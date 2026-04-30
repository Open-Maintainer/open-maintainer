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

const languageByExtension = new Map([
  [".ts", "TypeScript"],
  [".tsx", "TypeScript"],
  [".js", "JavaScript"],
  [".jsx", "JavaScript"],
  [".go", "Go"],
  [".py", "Python"],
  [".rs", "Rust"],
  [".nr", "Noir"],
]);

export function analyzeRepo(input: AnalyzeRepoInput): RepoProfile {
  const paths = input.files.map((file) => file.path);
  const evidence: EvidenceReference[] = [];
  const commands: DetectedCommand[] = [];
  const frameworks = new Set<string>();

  const packageJson = input.files.find((file) =>
    file.path.endsWith("package.json"),
  );
  if (packageJson) {
    evidence.push({ path: packageJson.path, reason: "package manifest" });
    const manifest = JSON.parse(packageJson.content) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
      if (
        [
          "install",
          "dev",
          "test",
          "build",
          "lint",
          "typecheck",
          "format:check",
        ].includes(name)
      ) {
        commands.push({ name, command, source: packageJson.path });
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
    ]) {
      if (deps[candidate]) {
        frameworks.add(candidate);
      }
    }
  }

  const primaryLanguages = [...new Set(paths.flatMap(detectLanguage))];
  const ciWorkflows = paths.filter((path) =>
    path.startsWith(".github/workflows/"),
  );
  const importantDocs = paths.filter((path) =>
    /^(README|CONTRIBUTING|docs\/|local-docs\/)/i.test(path),
  );
  const existingContextFiles = paths.filter((path) =>
    [
      "AGENTS.md",
      "CLAUDE.md",
      ".open-maintainer.yml",
      ".github/copilot-instructions.md",
    ].includes(path),
  );
  const packageManager =
    paths.includes("bun.lock") || paths.includes("bun.lockb")
      ? "bun"
      : paths.includes("package-lock.json")
        ? "npm"
        : null;

  for (const path of [
    ...ciWorkflows,
    ...importantDocs,
    ...existingContextFiles,
  ]) {
    evidence.push({ path, reason: "detected repository context" });
  }

  const riskAreas = [];
  if (
    paths.some((path) => path.includes("auth") || path.includes("security"))
  ) {
    riskAreas.push("Authentication or security-sensitive paths are present.");
  }
  if (ciWorkflows.length === 0) {
    riskAreas.push("No GitHub Actions workflows detected.");
  }

  return {
    id: newId("repo_profile"),
    repoId: input.repoId,
    version: input.version,
    owner: input.owner,
    name: input.name,
    defaultBranch: input.defaultBranch,
    primaryLanguages,
    frameworks: [...frameworks],
    packageManager,
    commands,
    ciWorkflows,
    importantDocs,
    architecturePathGroups: detectPathGroups(paths),
    generatedFileHints: ["AGENTS.md", ".open-maintainer.yml"],
    existingContextFiles,
    detectedRiskAreas: riskAreas,
    reviewRuleCandidates: buildRuleCandidates(commands, packageManager),
    evidence,
    createdAt: nowIso(),
  };
}

function detectLanguage(path: string): string[] {
  for (const [extension, language] of languageByExtension) {
    if (path.endsWith(extension)) {
      return [language];
    }
  }
  return [];
}

function detectPathGroups(paths: string[]): string[] {
  return [
    ...new Set(
      paths
        .map((path) => path.split("/")[0] ?? path)
        .filter((part) =>
          ["apps", "packages", "src", "docs", "contracts"].includes(part),
        ),
    ),
  ];
}

function buildRuleCandidates(
  commands: DetectedCommand[],
  packageManager: string | null,
): string[] {
  const rules = [];
  if (packageManager) {
    rules.push(`Use ${packageManager} for dependency and script commands.`);
  }
  for (const command of commands) {
    if (["test", "lint", "typecheck", "build"].includes(command.name)) {
      rules.push(
        `Run \`${command.command}\` before finishing changes that affect ${command.name}.`,
      );
    }
  }
  return rules;
}
