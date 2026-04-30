#!/usr/bin/env bun
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildClaudeCliProvider,
  buildCodexCliProvider,
} from "@open-maintainer/ai";
import { analyzeRepo, scanRepository } from "@open-maintainer/analyzer";
import {
  type ArtifactModel,
  type ContextArtifactTarget,
  buildArtifactSynthesisPrompt,
  createContextArtifacts,
  defaultArtifactTargets,
  deterministicContextOutput,
  modelArtifactContentJsonSchema,
  parseModelArtifactContent,
  planArtifactWrites,
  profileFingerprint,
  renderReadinessReport,
} from "@open-maintainer/context";

type CliOptions = {
  force: boolean;
  dryRun: boolean;
  createPr: boolean;
  failOnScoreBelow: number | null;
  reportPath: string | null;
  noProfileWrite: boolean;
  model: ArtifactModel | null;
  codex: boolean;
  claude: boolean;
  deterministic: boolean;
  allowRepoContentProvider: boolean;
  llmModel: string | null;
};

const usage = `open-maintainer <command> <repo>

Commands:
  audit <repo>                         Analyze repo and write .open-maintainer/profile.json and report.md
  generate <repo> --model codex --codex Generate context artifacts safely
  init <repo>                           Run audit, then generate missing artifacts
  doctor <repo>                         Report missing or stale generated context
  pr <repo> --create                    Print a dry-run PR summary for generated artifacts

Options:
  --force                               Overwrite existing generated artifact files
  --dry-run                             Print planned writes without writing files
  --model codex|claude                  LLM CLI backend used to generate artifact bodies
  --codex                               Generate AGENTS.md and Codex skills under .agents/skills
  --claude                              Generate CLAUDE.md and Claude skills under .claude/skills
  --llm-model <model>                   Optional backend model override
  --fail-on-score-below <number>        Exit non-zero when audit score is below threshold
  --report-path <path>                  Write audit report to a custom path
  --no-profile-write                    Skip .open-maintainer/profile.json writes during audit
  --deterministic                       Use template-only artifact generation for offline smoke tests
  --allow-repo-content-provider         Required with --model; permits sending scanned repo content to the backend
`;

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const [command, repoArg, ...rawOptions] = argv;
  const options = parseOptions(rawOptions);
  if (!command || command === "--help" || command === "-h") {
    console.log(usage);
    return 0;
  }
  if (!repoArg) {
    console.error("Missing repository path.\n");
    console.error(usage);
    return 2;
  }

  const repoRoot = path.resolve(repoArg);
  try {
    if (command === "audit") {
      const { profile, reportPath } = await audit(repoRoot, options);
      console.log(`Agent Readiness: ${profile.agentReadiness.score}/100`);
      console.log(
        options.noProfileWrite
          ? "Profile: skipped (--no-profile-write)"
          : "Profile: .open-maintainer/profile.json",
      );
      console.log(`Report: ${path.relative(repoRoot, reportPath)}`);
      return thresholdExit(profile.agentReadiness.score, options);
    }
    if (command === "generate") {
      await generate(repoRoot, options);
      return 0;
    }
    if (command === "init") {
      const { profile } = await audit(repoRoot, options);
      await generate(repoRoot, options);
      console.log(
        `Initialized Open Maintainer context at score ${profile.agentReadiness.score}/100.`,
      );
      return thresholdExit(profile.agentReadiness.score, options);
    }
    if (command === "doctor") {
      const result = await doctor(repoRoot);
      for (const line of result.messages) {
        console.log(line);
      }
      return result.ok ? 0 : 1;
    }
    if (command === "pr") {
      await pr(repoRoot, options);
      return 0;
    }
    console.error(`Unknown command: ${command}\n`);
    console.error(usage);
    return 2;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function audit(
  repoRoot: string,
  options: CliOptions,
): Promise<{ profile: ReturnType<typeof analyzeRepo>; reportPath: string }> {
  const profile = await createProfile(repoRoot);
  const openMaintainerDir = path.join(repoRoot, ".open-maintainer");
  if (!options.noProfileWrite) {
    await mkdir(openMaintainerDir, { recursive: true });
    await writeFile(
      path.join(openMaintainerDir, "profile.json"),
      `${JSON.stringify(
        {
          ...profile,
          openMaintainerProfileHash: profileFingerprint(profile),
        },
        null,
        2,
      )}\n`,
    );
  }
  const reportPath = options.reportPath
    ? path.resolve(repoRoot, options.reportPath)
    : path.join(openMaintainerDir, "report.md");
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, renderReadinessReport(profile));
  return { profile, reportPath };
}

async function generate(repoRoot: string, options: CliOptions): Promise<void> {
  const files = await scanRepository(repoRoot, { maxFiles: 800 });
  const profile = createProfileFromFiles(repoRoot, files);
  const targets = resolveTargets(options);
  if (!options.model && !options.deterministic) {
    throw new Error(
      "generate requires --model codex or --model claude for repo-specific artifact content. Use --deterministic only for offline smoke tests.",
    );
  }
  const modelArtifacts = options.deterministic
    ? undefined
    : await generateModelArtifacts({ repoRoot, profile, files, options });
  const artifacts = createContextArtifacts({
    repoId: "local",
    profile,
    output: deterministicContextOutput(profile),
    ...(modelArtifacts ? { modelArtifacts: modelArtifacts.content } : {}),
    modelProvider: modelArtifacts?.provider ?? null,
    model: modelArtifacts?.model ?? null,
    nextVersion: 1,
    targets,
  });
  const existingPaths = new Set(files.map((file) => file.path));
  const plan = planArtifactWrites({
    artifacts,
    existingPaths,
    force: options.force,
  });
  for (const item of plan) {
    console.log(`${item.action}: ${item.path} (${item.reason})`);
    if (options.dryRun || item.action === "skip") {
      continue;
    }
    const absolutePath = path.join(repoRoot, item.path);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, item.artifact.content);
  }
}

async function doctor(
  repoRoot: string,
): Promise<{ ok: boolean; messages: string[] }> {
  const profile = await createProfile(repoRoot);
  const files = await scanRepository(repoRoot, { maxFiles: 800 });
  const paths = new Set(files.map((file) => file.path));
  const required = createContextArtifacts({
    repoId: "local",
    profile,
    output: deterministicContextOutput(profile),
    modelProvider: null,
    model: null,
    nextVersion: 1,
    targets: defaultArtifactTargets,
  }).map((artifact) => artifact.type);
  const missing = required.filter((artifactPath) => !paths.has(artifactPath));
  const profileJson = files.find(
    (file) => file.path === ".open-maintainer/profile.json",
  );
  const stale = profileJson
    ? !profileJson.content.includes(profileFingerprint(profile))
    : false;
  return {
    ok: missing.length === 0 && !stale,
    messages: [
      `Agent Readiness: ${profile.agentReadiness.score}/100`,
      ...(missing.length > 0
        ? missing.map((item) => `missing: ${item}`)
        : ["all required artifacts are present"]),
      ...(stale
        ? ["drift: current profile differs from generated profile artifact"]
        : []),
    ],
  };
}

async function pr(repoRoot: string, options: CliOptions): Promise<void> {
  if (!options.createPr) {
    throw new Error("PR command requires --create.");
  }
  const profile = await createProfile(repoRoot);
  console.log("Dry-run context PR summary");
  console.log(`Branch: open-maintainer/context-${profile.version}`);
  console.log(`Agent Readiness: ${profile.agentReadiness.score}/100`);
  console.log(
    "Use the GitHub App API flow to create a real remote PR with installation credentials.",
  );
}

async function createProfile(repoRoot: string) {
  const files = await scanRepository(repoRoot, { maxFiles: 800 });
  return createProfileFromFiles(repoRoot, files);
}

function createProfileFromFiles(
  repoRoot: string,
  files: Awaited<ReturnType<typeof scanRepository>>,
) {
  return analyzeRepo({
    repoId: "local",
    owner: path.basename(path.dirname(repoRoot)) || "local",
    name: path.basename(repoRoot),
    defaultBranch: "main",
    version: 1,
    files,
  });
}

async function generateModelArtifacts(input: {
  repoRoot: string;
  profile: ReturnType<typeof analyzeRepo>;
  files: Awaited<ReturnType<typeof scanRepository>>;
  options: CliOptions;
}) {
  if (!input.options.allowRepoContentProvider) {
    throw new Error(
      "--model requires --allow-repo-content-provider because repository content will be sent to the selected CLI backend.",
    );
  }
  const prompt = buildArtifactSynthesisPrompt({
    profile: input.profile,
    files: input.files,
  });
  if (input.options.model === "codex") {
    const model =
      input.options.llmModel ?? process.env.OPEN_MAINTAINER_CODEX_MODEL;
    console.log(
      `codex: generating artifact content${model ? ` with ${model}` : ""}`,
    );
    const completion = await buildCodexCliProvider({
      cwd: input.repoRoot,
      ...(model ? { model } : {}),
      outputSchema: modelArtifactContentJsonSchema,
    }).complete(prompt);
    return {
      provider: "Codex CLI",
      model: completion.model,
      content: parseModelArtifactContent(completion.text),
    };
  }
  if (input.options.model === "claude") {
    const model =
      input.options.llmModel ?? process.env.OPEN_MAINTAINER_CLAUDE_MODEL;
    console.log(
      `claude: generating artifact content${model ? ` with ${model}` : ""}`,
    );
    const completion = await buildClaudeCliProvider({
      cwd: input.repoRoot,
      ...(model ? { model } : {}),
      outputSchema: modelArtifactContentJsonSchema,
    }).complete(prompt);
    return {
      provider: "Claude CLI",
      model: completion.model,
      content: parseModelArtifactContent(completion.text),
    };
  }
  throw new Error("Unknown model backend.");
}

function parseOptions(rawOptions: string[]): CliOptions {
  const options: CliOptions = {
    force: false,
    dryRun: false,
    createPr: false,
    failOnScoreBelow: null,
    reportPath: null,
    noProfileWrite: false,
    model: null,
    codex: false,
    claude: false,
    deterministic: false,
    allowRepoContentProvider: false,
    llmModel: null,
  };
  for (let index = 0; index < rawOptions.length; index += 1) {
    const option = rawOptions[index];
    if (option === "--force") {
      options.force = true;
    } else if (option === "--dry-run") {
      options.dryRun = true;
    } else if (option === "--create") {
      options.createPr = true;
    } else if (option === "--fail-on-score-below") {
      options.failOnScoreBelow = Number(rawOptions[index + 1]);
      index += 1;
    } else if (option === "--report-path") {
      options.reportPath = rawOptions[index + 1] ?? null;
      index += 1;
    } else if (option === "--no-profile-write") {
      options.noProfileWrite = true;
    } else if (option === "--model") {
      options.model = parseArtifactModel(rawOptions[index + 1] ?? "");
      index += 1;
    } else if (option === "--codex") {
      options.codex = true;
    } else if (option === "--claude") {
      options.claude = true;
    } else if (option === "--llm-model") {
      options.llmModel = rawOptions[index + 1] ?? null;
      index += 1;
    } else if (option === "--deterministic") {
      options.deterministic = true;
    } else if (option === "--allow-repo-content-provider") {
      options.allowRepoContentProvider = true;
    } else {
      throw new Error(`Unknown option: ${option}`);
    }
  }
  return options;
}

function resolveTargets(options: CliOptions): ContextArtifactTarget[] {
  const targets: ContextArtifactTarget[] = [];
  if (options.codex) {
    targets.push("agents", "skills");
  }
  if (options.claude) {
    targets.push("claude", "claude-skills");
  }
  if (targets.length === 0) {
    throw new Error("generate requires --codex, --claude, or both.");
  }
  targets.push("profile", "report", "config");
  return targets;
}

function parseArtifactModel(value: string): ArtifactModel {
  if (value === "codex" || value === "claude") {
    return value;
  }
  throw new Error("Unknown model. Expected --model codex or --model claude.");
}

function thresholdExit(score: number, options: CliOptions): number {
  if (options.failOnScoreBelow !== null && score < options.failOnScoreBelow) {
    console.error(
      `Agent readiness ${score}/100 is below threshold ${options.failOnScoreBelow}.`,
    );
    return 1;
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
