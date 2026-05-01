import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type {
  DetectedCommand,
  EvidenceReference,
  RepoProfile,
} from "@open-maintainer/shared";
import { newId, nowIso } from "@open-maintainer/shared";

export type AnalyzerFile = {
  path: string;
  content: string;
};

export type AnalyzeRepoInput = {
  repoId: string;
  owner: string;
  name: string;
  defaultBranch: string;
  version: number;
  files: AnalyzerFile[];
};

export type ScanRepositoryOptions = {
  maxFiles?: number;
  maxBytesPerFile?: number;
};

const defaultScanOptions = {
  maxFiles: 400,
  maxBytesPerFile: 128_000,
};

const ignoredPathParts = new Set([
  ".git",
  ".next",
  ".turbo",
  ".cache",
  ".vercel",
  "coverage",
  "dist",
  "build",
  "node_modules",
  "out",
  "target",
  "vendor",
]);

const languageByExtension = new Map([
  [".ts", "TypeScript"],
  [".tsx", "TypeScript"],
  [".js", "JavaScript"],
  [".jsx", "JavaScript"],
  [".go", "Go"],
  [".py", "Python"],
  [".rs", "Rust"],
  [".nr", "Noir"],
  [".sol", "Solidity"],
  [".cairo", "Cairo"],
]);

const configFilePatterns = [
  /^tsconfig(\..+)?\.json$/,
  /^biome\.json$/,
  /^eslint\.config\.[cm]?[jt]s$/,
  /^\.eslintrc(\..+)?$/,
  /^\.prettierrc(\..+)?$/,
  /^docker-compose\.ya?ml$/,
  /^drizzle\.config\.[cm]?[jt]s$/,
  /^Scarb\.toml$/,
  /^Cargo\.toml$/,
  /^pyproject\.toml$/,
  /^go\.mod$/,
  /^Makefile$/,
];

const environmentFilePatterns = [
  /^\.env\.example$/,
  /^\.env\.sample$/,
  /^\.env\.template$/,
  /^\.env\.dist$/,
  /^\.envrc$/,
];

const contextArtifactPaths = [
  "AGENTS.md",
  ".agents/skills/<repo>-start-task/SKILL.md",
  ".agents/skills/<repo>-testing-workflow/SKILL.md",
  ".agents/skills/<repo>-pr-review/SKILL.md",
  ".open-maintainer/profile.json",
  ".open-maintainer/report.md",
  ".open-maintainer.yml",
];

const optionalContextArtifactPaths = [
  "CLAUDE.md",
  ".github/copilot-instructions.md",
  ".cursor/rules/open-maintainer.md",
  ".claude/skills/<repo>-start-task/SKILL.md",
  ".claude/skills/<repo>-testing-workflow/SKILL.md",
  ".claude/skills/<repo>-pr-review/SKILL.md",
];

const recognizedContextArtifactPaths = [
  ...contextArtifactPaths,
  ...optionalContextArtifactPaths,
];

export async function scanRepository(
  repoRoot: string,
  options: ScanRepositoryOptions = {},
): Promise<AnalyzerFile[]> {
  const absoluteRoot = path.resolve(repoRoot);
  const maxFiles = options.maxFiles ?? defaultScanOptions.maxFiles;
  const maxBytesPerFile =
    options.maxBytesPerFile ?? defaultScanOptions.maxBytesPerFile;
  const files: AnalyzerFile[] = [];

  async function visit(directory: string): Promise<void> {
    if (files.length >= maxFiles) {
      return;
    }
    const entries = await readdir(directory, { withFileTypes: true }).catch(
      () => [],
    );
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (files.length >= maxFiles) {
        return;
      }
      const absolutePath = path.join(directory, entry.name);
      const relativePath = normalizeRepoPath(
        path.relative(absoluteRoot, absolutePath),
      );
      if (shouldSkipRepoPath(relativePath)) {
        continue;
      }
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile() || !shouldReadFile(relativePath)) {
        continue;
      }
      const fileStat = await stat(absolutePath).catch(() => null);
      if (!fileStat) {
        continue;
      }
      if (fileStat.size > maxBytesPerFile) {
        continue;
      }
      const content = await readFile(absolutePath, "utf8").catch(() => null);
      if (content === null) {
        continue;
      }
      files.push({ path: relativePath, content });
    }
  }

  await visit(absoluteRoot);
  return files;
}

export function shouldSkipRepoPath(repoPath: string): boolean {
  return repoPath
    .split("/")
    .some(
      (part) => ignoredPathParts.has(part) || part.endsWith(".tsbuildinfo"),
    );
}

export function analyzeRepo(input: AnalyzeRepoInput): RepoProfile {
  const normalizedFiles = input.files
    .map((file) => ({ ...file, path: normalizeRepoPath(file.path) }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const paths = normalizedFiles.map((file) => file.path);
  const evidence: EvidenceReference[] = [];
  const commands: DetectedCommand[] = [];
  const frameworks = new Set<string>();
  const workspaceManifests: string[] = [];

  for (const packageJson of normalizedFiles.filter((file) =>
    file.path.endsWith("package.json"),
  )) {
    evidence.push({ path: packageJson.path, reason: "package manifest" });
    const manifest = parseJson(packageJson.content) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      workspaces?: string[] | { packages?: string[] };
    } | null;
    if (!manifest) {
      continue;
    }
    if (manifest.workspaces) {
      workspaceManifests.push(packageJson.path);
    }
    for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
      if (isQualityOrWorkflowScript(name)) {
        commands.push({
          name,
          command: commandForSource(packageJson.path, name, command),
          source: packageJson.path,
        });
      }
    }
    const deps = { ...manifest.dependencies, ...manifest.devDependencies };
    for (const candidate of [
      "next",
      "react",
      "fastify",
      "hono",
      "drizzle-orm",
      "vitest",
      "playwright",
      "typescript",
      "zod",
    ]) {
      if (deps[candidate]) {
        frameworks.add(candidate);
      }
    }
  }

  for (const makefile of normalizedFiles.filter(
    (file) => path.posix.basename(file.path) === "Makefile",
  )) {
    evidence.push({ path: makefile.path, reason: "make targets" });
    for (const target of detectMakeTargets(makefile.content)) {
      if (isQualityOrWorkflowScript(target)) {
        commands.push({
          name: target,
          command:
            makefile.path === "Makefile"
              ? `make ${target}`
              : `make -C ${path.posix.dirname(makefile.path)} ${target}`,
          source: makefile.path,
        });
      }
    }
  }

  for (const scarbToml of normalizedFiles.filter((file) =>
    file.path.endsWith("Scarb.toml"),
  )) {
    evidence.push({ path: scarbToml.path, reason: "Scarb manifest" });
    frameworks.add("Scarb");
    frameworks.add("Starknet Foundry");
    const scriptCommands = detectScarbScripts(scarbToml.content);
    for (const [name, command] of Object.entries(scriptCommands)) {
      if (isQualityOrWorkflowScript(name)) {
        const directory = path.posix.dirname(scarbToml.path);
        commands.push({
          name,
          command:
            directory === "."
              ? `scarb run ${name}`
              : `cd ${directory} && ${command}`,
          source: scarbToml.path,
        });
      }
    }
  }

  const lockfiles = paths.filter((repoPath) =>
    [
      "bun.lock",
      "bun.lockb",
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "uv.lock",
      "Cargo.lock",
      "Scarb.lock",
      "go.sum",
    ].some(
      (lockfile) => repoPath === lockfile || repoPath.endsWith(`/${lockfile}`),
    ),
  );
  const ciWorkflows = paths.filter((repoPath) =>
    repoPath.startsWith(".github/workflows/"),
  );
  const importantDocs = paths.filter((repoPath) =>
    /^(README|CONTRIBUTING|docs\/|local-docs\/)/i.test(repoPath),
  );
  const repoTemplates = paths.filter(
    (repoPath) =>
      repoPath.startsWith(".github/ISSUE_TEMPLATE/") ||
      repoPath === ".github/pull_request_template.md" ||
      repoPath === "PULL_REQUEST_TEMPLATE.md",
  );
  const existingContextFiles = paths.filter(
    (repoPath) =>
      recognizedContextArtifactPaths.includes(repoPath) ||
      repoPath.startsWith(".agents/skills/") ||
      repoPath.startsWith(".claude/skills/"),
  );
  const configFiles = paths.filter((repoPath) =>
    configFilePatterns.some((pattern) =>
      pattern.test(path.posix.basename(repoPath)),
    ),
  );
  const ownershipHints = detectOwnershipHints(paths);
  const environmentFiles = paths.filter((repoPath) =>
    environmentFilePatterns.some((pattern) =>
      pattern.test(path.posix.basename(repoPath)),
    ),
  );
  const environmentVariables = detectEnvironmentVariables(normalizedFiles);
  const generatedFilePaths = detectGeneratedFilePaths(normalizedFiles);
  const ignoreFiles = paths.filter(
    (repoPath) =>
      path.posix.basename(repoPath) === ".gitignore" ||
      path.posix.basename(repoPath) === ".dockerignore",
  );
  const testFilePaths = detectTestFilePaths(paths);
  const riskHintPaths = detectRiskHintPaths(paths);
  const trackedDriftPaths = new Set([
    ...commands.map((command) => command.source),
    ...ciWorkflows,
    ...importantDocs,
    ...repoTemplates,
    ...existingContextFiles,
    ...workspaceManifests,
    ...lockfiles,
    ...configFiles,
    ...ownershipHints,
    ...environmentFiles,
    ...generatedFilePaths,
    ...ignoreFiles,
    ...testFilePaths,
    ...riskHintPaths,
  ]);
  const trackedFileHashes = normalizedFiles
    .filter((file) => trackedDriftPaths.has(file.path))
    .map((file) => ({
      path: file.path,
      hash: fileHash(file.content),
    }));
  const packageManager = detectPackageManager(lockfiles, paths);

  for (const repoPath of [
    ...lockfiles,
    ...ciWorkflows,
    ...importantDocs,
    ...repoTemplates,
    ...existingContextFiles,
    ...configFiles,
    ...ownershipHints,
    ...environmentFiles,
    ...generatedFilePaths,
    ...ignoreFiles,
    ...testFilePaths,
  ]) {
    evidence.push({ path: repoPath, reason: "detected repository context" });
  }

  const riskAreas = detectRiskAreas(
    riskHintPaths,
    ciWorkflows,
    existingContextFiles,
  );
  const profileBase = {
    id: newId("repo_profile"),
    repoId: input.repoId,
    version: input.version,
    owner: input.owner,
    name: input.name,
    defaultBranch: input.defaultBranch,
    primaryLanguages: [...new Set(paths.flatMap(detectLanguage))],
    frameworks: [...frameworks],
    packageManager,
    commands: dedupeCommands(commands),
    ciWorkflows,
    importantDocs,
    repoTemplates,
    architecturePathGroups: detectPathGroups(paths),
    generatedFileHints: contextArtifactPaths,
    generatedFilePaths,
    existingContextFiles,
    detectedRiskAreas: riskAreas,
    riskHintPaths,
    ownershipHints,
    environmentFiles,
    environmentVariables,
    ignoreFiles,
    testFilePaths,
    reviewRuleCandidates: buildRuleCandidates(commands, packageManager),
    evidence: dedupeEvidence(evidence),
    workspaceManifests: [...new Set(workspaceManifests)],
    lockfiles,
    configFiles,
    trackedFileHashes,
    contextArtifactHashes: [],
    createdAt: nowIso(),
  };

  const profileWithoutReadiness = {
    ...profileBase,
    agentReadiness: {
      score: 0,
      categories: [],
      missingItems: [],
      generatedAt: nowIso(),
    },
  };

  return {
    ...profileBase,
    agentReadiness: scoreAgentReadiness(profileWithoutReadiness),
  };
}

export function scoreAgentReadiness(
  profile: Pick<
    RepoProfile,
    | "commands"
    | "ciWorkflows"
    | "importantDocs"
    | "architecturePathGroups"
    | "repoTemplates"
    | "generatedFilePaths"
    | "existingContextFiles"
    | "reviewRuleCandidates"
    | "detectedRiskAreas"
    | "riskHintPaths"
    | "ownershipHints"
    | "environmentFiles"
    | "environmentVariables"
    | "ignoreFiles"
    | "testFilePaths"
    | "evidence"
    | "workspaceManifests"
    | "lockfiles"
    | "configFiles"
  >,
): RepoProfile["agentReadiness"] {
  const categories: RepoProfile["agentReadiness"]["categories"] = [
    scoreCategory({
      name: "setup clarity",
      maxScore: 13,
      checks: [
        check(
          profile.importantDocs.some((repoPath) => /^README/i.test(repoPath)),
          "README is missing.",
        ),
        check(
          profile.commands.length > 0,
          "No runnable scripts or Make targets detected.",
        ),
        check(
          profile.lockfiles.length > 0,
          "No lockfile or dependency lock evidence detected.",
        ),
        check(
          profile.environmentVariables.length === 0 ||
            profile.environmentFiles.length > 0 ||
            profile.importantDocs.length > 0,
          "Environment variables are referenced without example or setup documentation.",
        ),
      ],
      evidence: evidenceFor(profile, [
        ...profile.importantDocs,
        ...profile.commands.map((command) => command.source),
        ...profile.lockfiles,
        ...profile.environmentFiles,
      ]),
    }),
    scoreCategory({
      name: "architecture clarity",
      maxScore: 13,
      checks: [
        check(
          profile.architecturePathGroups.length > 0,
          "No major source directories detected.",
        ),
        check(
          profile.configFiles.length > 0,
          "No toolchain config files detected.",
        ),
        check(
          profile.workspaceManifests.length > 0 ||
            !profile.architecturePathGroups.some(
              (group) =>
                group.startsWith("apps/") || group.startsWith("packages/"),
            ),
          "No workspace or package boundary evidence detected.",
        ),
      ],
      evidence: evidenceFor(profile, [
        ...profile.architecturePathGroups,
        ...profile.configFiles,
        ...profile.workspaceManifests,
      ]),
    }),
    scoreCategory({
      name: "testing",
      maxScore: 13,
      checks: [
        check(
          hasCommand(profile.commands, "test"),
          "No test command detected.",
        ),
        check(profile.testFilePaths.length > 0, "No test files detected."),
      ],
      evidence: evidenceFor(profile, [
        ...profile.commands.map((command) => command.source),
        ...profile.testFilePaths,
      ]),
    }),
    scoreCategory({
      name: "CI",
      maxScore: 13,
      checks: [
        check(
          hasCommand(profile.commands, "lint") ||
            hasCommand(profile.commands, "check"),
          "No lint/check command detected.",
        ),
        check(
          profile.ciWorkflows.length > 0,
          "No GitHub Actions workflow detected.",
        ),
      ],
      evidence: evidenceFor(profile, [
        ...profile.commands.map((command) => command.source),
        ...profile.ciWorkflows,
      ]),
    }),
    scoreCategory({
      name: "docs",
      maxScore: 12,
      checks: [
        check(
          profile.importantDocs.some((repoPath) => /^README/i.test(repoPath)),
          "README is missing.",
        ),
        check(
          profile.importantDocs.some((repoPath) =>
            repoPath.startsWith("docs/"),
          ),
          "No docs directory detected.",
        ),
        check(
          profile.importantDocs.some((repoPath) =>
            /CONTRIBUTING/i.test(repoPath),
          ),
          "CONTRIBUTING.md is missing.",
        ),
      ],
      evidence: evidenceFor(profile, [
        ...profile.importantDocs,
        ...profile.repoTemplates,
      ]),
    }),
    scoreCategory({
      name: "risk handling",
      maxScore: 12,
      checks: [
        check(
          profile.reviewRuleCandidates.length > 0,
          "No review or quality gate rules inferred.",
        ),
        check(
          profile.riskHintPaths.length === 0 ||
            profile.importantDocs.some((repoPath) =>
              /CONTRIBUTING|SECURITY|docs\//i.test(repoPath),
            ) ||
            profile.existingContextFiles.length > 0,
          "Risk-sensitive paths are present without repo-local guidance.",
        ),
        check(
          profile.ownershipHints.length > 0 ||
            profile.importantDocs.some((repoPath) =>
              /CONTRIBUTING|README|docs\//i.test(repoPath),
            ),
          "No ownership or maintainer guidance detected.",
        ),
      ],
      evidence: evidenceFor(profile, [
        ...profile.riskHintPaths,
        ...profile.ownershipHints,
        ...profile.importantDocs,
      ]),
    }),
    scoreCategory({
      name: "generated-file handling",
      maxScore: 12,
      checks: [
        check(profile.ignoreFiles.length > 0, "No ignore file detected."),
        check(
          profile.generatedFilePaths.length === 0 ||
            profile.importantDocs.length > 0 ||
            profile.existingContextFiles.length > 0,
          "Generated files are present without documented handling.",
        ),
        check(
          profile.existingContextFiles.includes(".open-maintainer.yml"),
          ".open-maintainer.yml policy file is missing.",
        ),
      ],
      evidence: evidenceFor(profile, [
        ...profile.ignoreFiles,
        ...profile.generatedFilePaths,
        ...profile.existingContextFiles,
      ]),
    }),
    scoreCategory({
      name: "agent instructions",
      maxScore: 12,
      checks: [
        check(
          profile.existingContextFiles.includes("AGENTS.md") ||
            profile.existingContextFiles.includes("CLAUDE.md"),
          "AGENTS.md or CLAUDE.md is missing.",
        ),
        check(
          profile.existingContextFiles.some(
            (repoPath) =>
              repoPath.startsWith(".agents/skills/") ||
              repoPath.startsWith(".claude/skills/"),
          ),
          "Repo-local skills are missing.",
        ),
      ],
      evidence: evidenceFor(profile, profile.existingContextFiles),
    }),
  ];
  const missingItems = categories.flatMap((category) =>
    category.missing.map((item) => `${category.name}: ${item}`),
  );
  return {
    score: categories.reduce((total, category) => total + category.score, 0),
    categories,
    missingItems,
    generatedAt: nowIso(),
  };
}

function normalizeRepoPath(repoPath: string): string {
  return repoPath.split(path.sep).join("/");
}

function shouldReadFile(repoPath: string): boolean {
  if (repoPath.startsWith(".open-maintainer/")) {
    return true;
  }
  if (
    repoPath.startsWith(".github/workflows/") ||
    repoPath.startsWith(".cursor/rules/") ||
    repoPath.startsWith(".agents/skills/") ||
    repoPath.startsWith(".claude/skills/")
  ) {
    return true;
  }
  if (
    /^(README|CONTRIBUTING|CHANGELOG|AGENTS|CLAUDE)(\..*)?$/i.test(
      path.posix.basename(repoPath),
    )
  ) {
    return true;
  }
  if (
    path.posix.basename(repoPath) === ".gitignore" ||
    path.posix.basename(repoPath) === ".dockerignore" ||
    detectOwnershipHints([repoPath]).length > 0 ||
    environmentFilePatterns.some((pattern) =>
      pattern.test(path.posix.basename(repoPath)),
    )
  ) {
    return true;
  }
  if (repoPath.startsWith("docs/")) {
    return true;
  }
  if (
    repoPath.endsWith("package.json") ||
    repoPath.endsWith("bun.lock") ||
    repoPath.endsWith("bun.lockb") ||
    repoPath.endsWith("package-lock.json") ||
    repoPath.endsWith("pnpm-lock.yaml") ||
    repoPath.endsWith("yarn.lock") ||
    repoPath.endsWith("go.mod") ||
    repoPath.endsWith("go.sum") ||
    repoPath.endsWith("Cargo.toml") ||
    repoPath.endsWith("Scarb.toml") ||
    repoPath.endsWith("pyproject.toml") ||
    repoPath.endsWith("Makefile")
  ) {
    return true;
  }
  return /\.(ts|tsx|js|jsx|go|py|rs|nr|sol|cairo|json|ya?ml|toml|md)$/.test(
    repoPath,
  );
}

function isQualityOrWorkflowScript(name: string): boolean {
  return [
    "install",
    "dev",
    "test",
    "test:unit",
    "test:integration",
    "test:e2e",
    "build",
    "lint",
    "check",
    "typecheck",
    "format",
    "format:check",
    "diagnostics",
    "smoke",
    "smoke:compose",
    "smoke:mvp",
    "dev-up",
    "dev-down",
    "dev-fork",
    "dev-fork-down",
    "clean-env",
  ].includes(name);
}

function commandForSource(
  source: string,
  name: string,
  command: string,
): string {
  if (source === "package.json") {
    return command;
  }
  return `cd ${path.posix.dirname(source)} && ${command}`;
}

function parseJson(content: string): unknown | null {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function fileHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function detectMakeTargets(content: string): string[] {
  return [...content.matchAll(/^([a-zA-Z0-9][\w:.-]*):(?:\s|$)/gm)].flatMap(
    (match) => {
      const target = match[1];
      return target && !target.includes("%") ? [target] : [];
    },
  );
}

function detectScarbScripts(content: string): Record<string, string> {
  const scripts: Record<string, string> = {};
  let inScripts = false;
  for (const line of content.split(/\r?\n/)) {
    if (/^\[[^\]]+\]\s*$/.test(line)) {
      inScripts = line.trim() === "[scripts]";
      continue;
    }
    if (!inScripts) {
      continue;
    }
    const match = /^([A-Za-z0-9:_-]+)\s*=\s*"([^"]+)"\s*$/.exec(line);
    if (match?.[1] && match[2]) {
      scripts[match[1]] = match[2];
    }
  }
  return scripts;
}

function detectPackageManager(
  lockfiles: string[],
  paths: string[],
): string | null {
  if (
    lockfiles.some(
      (repoPath) =>
        repoPath.endsWith("bun.lock") || repoPath.endsWith("bun.lockb"),
    )
  ) {
    return "bun";
  }
  if (lockfiles.some((repoPath) => repoPath.endsWith("pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (lockfiles.some((repoPath) => repoPath.endsWith("yarn.lock"))) {
    return "yarn";
  }
  if (lockfiles.some((repoPath) => repoPath.endsWith("package-lock.json"))) {
    return "npm";
  }
  if (paths.some((repoPath) => repoPath.endsWith("pyproject.toml"))) {
    return "uv/pip";
  }
  if (paths.some((repoPath) => repoPath.endsWith("go.mod"))) {
    return "go";
  }
  return null;
}

function detectLanguage(repoPath: string): string[] {
  for (const [extension, language] of languageByExtension) {
    if (repoPath.endsWith(extension)) {
      return [language];
    }
  }
  return [];
}

function detectPathGroups(paths: string[]): string[] {
  const groups = new Set<string>();
  for (const repoPath of paths) {
    const [topLevel, second] = repoPath.split("/");
    if (!topLevel) {
      continue;
    }
    if (
      ["apps", "packages", "src", "docs", "contracts", "tests"].includes(
        topLevel,
      )
    ) {
      groups.add(
        second && ["apps", "packages"].includes(topLevel)
          ? `${topLevel}/${second}`
          : topLevel,
      );
    }
  }
  return [...groups].sort();
}

function detectOwnershipHints(paths: string[]): string[] {
  return paths.filter((repoPath) =>
    [
      "CODEOWNERS",
      ".github/CODEOWNERS",
      "OWNERS",
      "OWNERS.md",
      "docs/OWNERS.md",
      "docs/MAINTAINERS.md",
      "MAINTAINERS.md",
    ].includes(repoPath),
  );
}

function detectEnvironmentVariables(files: AnalyzerFile[]): string[] {
  const variables = new Set<string>();
  const patterns = [
    /\bprocess\.env\.([A-Z][A-Z0-9_]*)\b/g,
    /\bDeno\.env\.get\(["']([A-Z][A-Z0-9_]*)["']\)/g,
    /\bimport\.meta\.env\.([A-Z][A-Z0-9_]*)\b/g,
    /\$\{([A-Z][A-Z0-9_]*)(?::[-=?][^}]*)?\}/g,
  ];
  for (const file of files) {
    for (const pattern of patterns) {
      for (const match of file.content.matchAll(pattern)) {
        if (match[1]) {
          variables.add(match[1]);
        }
      }
    }
  }
  return [...variables].sort();
}

function detectGeneratedFilePaths(files: AnalyzerFile[]): string[] {
  return files
    .filter(
      (file) =>
        path.posix.basename(file.path) === "next-env.d.ts" ||
        file.path.includes("/generated/") ||
        /generated by open-maintainer|auto-generated|autogenerated|do not edit/i.test(
          file.content.slice(0, 4000),
        ),
    )
    .map((file) => file.path)
    .sort();
}

function detectTestFilePaths(paths: string[]): string[] {
  return paths
    .filter(
      (repoPath) =>
        /(^|\/)(tests?|__tests__)\//.test(repoPath) ||
        /\.(test|spec)\.[cm]?[jt]sx?$/.test(repoPath),
    )
    .sort();
}

function detectRiskAreas(
  riskHintPaths: string[],
  ciWorkflows: string[],
  existingContextFiles: string[],
): string[] {
  const riskAreas = [];
  if (riskHintPaths.length > 0) {
    riskAreas.push(
      "Authentication, secret, payment, or security-sensitive paths are present.",
    );
  }
  if (ciWorkflows.length === 0) {
    riskAreas.push("No GitHub Actions workflows detected.");
  }
  if (existingContextFiles.length === 0) {
    riskAreas.push("No repo-local agent context files detected.");
  }
  return riskAreas;
}

function detectRiskHintPaths(paths: string[]): string[] {
  return paths.filter(
    (repoPath) =>
      /auth|security|secret|payment|billing/i.test(repoPath) &&
      detectTestFilePaths([repoPath]).length === 0,
  );
}

function buildRuleCandidates(
  commands: DetectedCommand[],
  packageManager: string | null,
): string[] {
  const rules = [];
  if (packageManager) {
    rules.push(`Use ${packageManager} for dependency and script commands.`);
  }
  for (const command of dedupeCommands(commands)) {
    if (
      ["test", "lint", "check", "typecheck", "build"].includes(command.name)
    ) {
      rules.push(
        `Run \`${command.command}\` before finishing changes that affect ${command.name}.`,
      );
    }
  }
  return rules;
}

function dedupeCommands(commands: DetectedCommand[]): DetectedCommand[] {
  const seen = new Set<string>();
  return commands.filter((command) => {
    const key = `${command.name}:${command.command}:${command.source}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeEvidence(evidence: EvidenceReference[]): EvidenceReference[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = `${item.path}:${item.reason}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function check(
  passed: boolean,
  missing: string,
): { passed: boolean; missing: string } {
  return { passed, missing };
}

function scoreCategory(input: {
  name: RepoProfile["agentReadiness"]["categories"][number]["name"];
  maxScore: number;
  checks: Array<{ passed: boolean; missing: string }>;
  evidence: EvidenceReference[];
}): RepoProfile["agentReadiness"]["categories"][number] {
  const passed = input.checks.filter((item) => item.passed).length;
  return {
    name: input.name,
    score: Math.round((passed / input.checks.length) * input.maxScore),
    maxScore: input.maxScore,
    missing: input.checks
      .filter((item) => !item.passed)
      .map((item) => item.missing),
    evidence: input.evidence,
  };
}

function evidenceFor(
  profile: Pick<RepoProfile, "evidence">,
  paths: string[],
): EvidenceReference[] {
  const pathSet = new Set(paths);
  return profile.evidence.filter(
    (item) =>
      pathSet.has(item.path) ||
      paths.some((repoPath) => item.path.startsWith(`${repoPath}/`)),
  );
}

function hasCommand(commands: DetectedCommand[], name: string): boolean {
  return commands.some(
    (command) => command.name === name || command.name.startsWith(`${name}:`),
  );
}
