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
  buildRepoFactsSynthesisPrompt,
  buildSkillSynthesisPrompt,
  createContextArtifacts,
  defaultArtifactTargets,
  deterministicContextOutput,
  modelArtifactContentJsonSchema,
  modelSkillContentJsonSchema,
  parseModelArtifactContent,
  parseModelSkillContent,
  parseStructuredRepoFacts,
  planArtifactWrites,
  profileFingerprint,
  renderReadinessReport,
  structuredContextOutputFromRepoFacts,
  structuredRepoFactsJsonSchema,
} from "@open-maintainer/context";

type CliOptions = {
  force: boolean;
  dryRun: boolean;
  createPr: boolean;
  failOnScoreBelow: number | null;
  reportPath: string | null;
  noProfileWrite: boolean;
  model: ArtifactModel | null;
  context: ArtifactSelection | null;
  skills: ArtifactSelection | null;
  deterministic: boolean;
  allowWrite: boolean;
  llmModel: string | null;
};

type ArtifactSelection = "codex" | "claude" | "both";

const rootUsage = `open-maintainer <command> <repo>

Commands:
  audit <repo>                         Analyze repo and write .open-maintainer/profile.json and report.md
  generate <repo> --model codex --context codex --skills codex
                                       Generate context artifacts safely
  init <repo>                           Run audit, then generate missing artifacts
  doctor <repo>                         Report missing or stale generated context
  pr <repo> --create                    Print a dry-run PR summary for generated artifacts

Help:
  open-maintainer --help
  open-maintainer help
  open-maintainer help <command>
  open-maintainer <command> --help
  open-maintainer <command> help
`;

const commandUsages = {
  audit: `open-maintainer audit <repo>

Analyze a repository and write an agent-readiness profile and markdown report.

Writes:
  .open-maintainer/profile.json
  .open-maintainer/report.md

Options:
  --fail-on-score-below <number>        Exit non-zero when audit score is below threshold
  --report-path <path>                  Write audit report to a custom path
  --no-profile-write                    Skip .open-maintainer/profile.json writes

Examples:
  open-maintainer audit .
  open-maintainer audit ./repo --fail-on-score-below 60
  open-maintainer audit ./repo --report-path .open-maintainer/report.md --no-profile-write
`,
  generate: `open-maintainer generate <repo>

Generate repository context artifacts safely. Existing files are preserved unless --force is used.

Required artifact target:
  --context codex|claude|both           Generate AGENTS.md, CLAUDE.md, or both
  --skills codex|claude|both            Generate .agents skills, .claude skills, or both

Model options:
  --model codex|claude                  LLM CLI backend used to generate artifact bodies
  --llm-model <model>                   Optional backend model override
  --allow-write                         Required with --model; permits model-backed artifact writes
  --deterministic                       Use template-only artifact generation for offline smoke tests

Write options:
  --force                               Overwrite existing generated artifact files
  --dry-run                             Print planned writes without writing files

Examples:
  open-maintainer generate ./repo --model codex --context codex --skills codex --allow-write
  open-maintainer generate ./repo --model claude --context claude --skills claude --allow-write
  open-maintainer generate ./repo --model codex --context both --skills both --allow-write
  open-maintainer generate ./repo --deterministic --context codex --skills codex
`,
  init: `open-maintainer init <repo>

Run audit, then generate missing context artifacts.

Audit options:
  --fail-on-score-below <number>        Exit non-zero when audit score is below threshold
  --report-path <path>                  Write audit report to a custom path
  --no-profile-write                    Skip .open-maintainer/profile.json writes during audit

Generate options:
  --model codex|claude                  LLM CLI backend used to generate artifact bodies
  --context codex|claude|both           Generate AGENTS.md, CLAUDE.md, or both
  --skills codex|claude|both            Generate .agents skills, .claude skills, or both
  --llm-model <model>                   Optional backend model override
  --allow-write                         Required with --model; permits model-backed artifact writes
  --deterministic                       Use template-only artifact generation for offline smoke tests
  --force                               Overwrite existing generated artifact files
  --dry-run                             Print planned writes without writing files

Examples:
  open-maintainer init ./repo --model codex --context codex --skills codex --allow-write
  open-maintainer init ./repo --deterministic --context codex --skills codex
`,
  doctor: `open-maintainer doctor <repo>

Check that required generated context artifacts are present and that the stored profile is not stale.

Outputs:
  Agent readiness score
  Missing required artifacts, if any
  Profile drift, if detected

Examples:
  open-maintainer doctor .
  open-maintainer doctor ./repo
`,
  pr: `open-maintainer pr <repo> --create

Print a dry-run context PR summary for generated artifacts.

Options:
  --create                              Required; print the dry-run PR summary

Examples:
  open-maintainer pr ./repo --create
`,
} as const;

type CommandName = keyof typeof commandUsages;

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    console.log(rootUsage);
    return 0;
  }
  if (command === "help") {
    const helpCommand = rest[0];
    if (isCommandName(helpCommand)) {
      console.log(commandUsages[helpCommand]);
      return 0;
    }
    console.log(rootUsage);
    return 0;
  }
  if (!isCommandName(command)) {
    console.error(`Unknown command: ${command}\n`);
    console.error(rootUsage);
    return 2;
  }
  if (rest.some(isHelpToken)) {
    console.log(commandUsages[command]);
    return 0;
  }

  const [repoArg, ...rawOptions] = rest;
  if (!repoArg) {
    console.error("Missing repository path.\n");
    console.error(commandUsages[command]);
    return 2;
  }

  const repoRoot = path.resolve(repoArg);
  try {
    const options = parseOptions(rawOptions);
    switch (command) {
      case "audit": {
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
      case "generate":
        await generate(repoRoot, options);
        return 0;
      case "init": {
        const { profile } = await audit(repoRoot, options);
        await generate(repoRoot, options);
        console.log(
          `Initialized Open Maintainer context at score ${profile.agentReadiness.score}/100.`,
        );
        return thresholdExit(profile.agentReadiness.score, options);
      }
      case "doctor": {
        const result = await doctor(repoRoot);
        for (const line of result.messages) {
          console.log(line);
        }
        return result.ok ? 0 : 1;
      }
      case "pr":
        await pr(repoRoot, options);
        return 0;
    }
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
    output: modelArtifacts?.output ?? deterministicContextOutput(profile),
    ...(modelArtifacts ? { modelArtifacts: modelArtifacts.content } : {}),
    ...(modelArtifacts?.skills ? { modelSkills: modelArtifacts.skills } : {}),
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
  if (!input.options.allowWrite) {
    throw new Error(
      "--model requires --allow-write because repository content will be sent to the selected CLI backend.",
    );
  }
  const factsPrompt = buildRepoFactsSynthesisPrompt({
    profile: input.profile,
    files: input.files,
  });
  if (input.options.model === "codex") {
    const model =
      input.options.llmModel ?? process.env.OPEN_MAINTAINER_CODEX_MODEL;
    const needsSkills = input.options.skills !== null;
    console.log(
      `codex: analyzing repo evidence${model ? ` with ${model}` : ""}`,
    );
    const factsCompletion = await buildCodexCliProvider({
      cwd: input.repoRoot,
      ...(model ? { model } : {}),
      outputSchema: structuredRepoFactsJsonSchema,
    }).complete(factsPrompt);
    const repoFacts = parseStructuredRepoFacts(factsCompletion.text);
    const artifactPrompt = buildArtifactSynthesisPrompt({
      profile: input.profile,
      repoFacts,
    });
    console.log(
      `codex: generating artifact content${model ? ` with ${model}` : ""}`,
    );
    const artifactCompletion = await buildCodexCliProvider({
      cwd: input.repoRoot,
      ...(model ? { model } : {}),
      outputSchema: modelArtifactContentJsonSchema,
    }).complete(artifactPrompt);
    const artifactContent = parseModelArtifactContent(artifactCompletion.text);
    const skills = needsSkills
      ? await generateModelSkills({
          label: "codex",
          complete: (prompt) =>
            buildCodexCliProvider({
              cwd: input.repoRoot,
              ...(model ? { model } : {}),
              outputSchema: modelSkillContentJsonSchema,
            }).complete(prompt),
          prompt: buildSkillSynthesisPrompt({
            profile: input.profile,
            repoFacts,
            agentsMd: artifactContent.agentsMd,
            files: input.files,
          }),
        })
      : undefined;
    return {
      provider: "Codex CLI",
      model: artifactCompletion.model,
      output: structuredContextOutputFromRepoFacts(input.profile, repoFacts),
      content: artifactContent,
      skills,
    };
  }
  if (input.options.model === "claude") {
    const model =
      input.options.llmModel ?? process.env.OPEN_MAINTAINER_CLAUDE_MODEL;
    const needsSkills = input.options.skills !== null;
    console.log(
      `claude: analyzing repo evidence${model ? ` with ${model}` : ""}`,
    );
    const factsCompletion = await buildClaudeCliProvider({
      cwd: input.repoRoot,
      ...(model ? { model } : {}),
      outputSchema: structuredRepoFactsJsonSchema,
    }).complete(factsPrompt);
    const repoFacts = parseStructuredRepoFacts(factsCompletion.text);
    const artifactPrompt = buildArtifactSynthesisPrompt({
      profile: input.profile,
      repoFacts,
    });
    console.log(
      `claude: generating artifact content${model ? ` with ${model}` : ""}`,
    );
    const artifactCompletion = await buildClaudeCliProvider({
      cwd: input.repoRoot,
      ...(model ? { model } : {}),
      outputSchema: modelArtifactContentJsonSchema,
    }).complete(artifactPrompt);
    const artifactContent = parseModelArtifactContent(artifactCompletion.text);
    const skills = needsSkills
      ? await generateModelSkills({
          label: "claude",
          complete: (prompt) =>
            buildClaudeCliProvider({
              cwd: input.repoRoot,
              ...(model ? { model } : {}),
              outputSchema: modelSkillContentJsonSchema,
            }).complete(prompt),
          prompt: buildSkillSynthesisPrompt({
            profile: input.profile,
            repoFacts,
            agentsMd: artifactContent.agentsMd,
            files: input.files,
          }),
        })
      : undefined;
    return {
      provider: "Claude CLI",
      model: artifactCompletion.model,
      output: structuredContextOutputFromRepoFacts(input.profile, repoFacts),
      content: artifactContent,
      skills,
    };
  }
  throw new Error("Unknown model backend.");
}

async function generateModelSkills(input: {
  label: string;
  complete: (
    prompt: ReturnType<typeof buildSkillSynthesisPrompt>,
  ) => Promise<{ text: string }>;
  prompt: ReturnType<typeof buildSkillSynthesisPrompt>;
}) {
  try {
    console.log(`${input.label}: generating workflow skills`);
    const completion = await input.complete(input.prompt);
    return parseModelSkillContent(completion.text);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(
      `${input.label}: skill generation fell back to deterministic skills (${message})`,
    );
    return undefined;
  }
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
    context: null,
    skills: null,
    deterministic: false,
    allowWrite: false,
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
    } else if (option === "--context") {
      options.context = parseArtifactSelection(
        rawOptions[index + 1] ?? "",
        "--context",
      );
      index += 1;
    } else if (option === "--skills") {
      options.skills = parseArtifactSelection(
        rawOptions[index + 1] ?? "",
        "--skills",
      );
      index += 1;
    } else if (option === "--llm-model") {
      options.llmModel = rawOptions[index + 1] ?? null;
      index += 1;
    } else if (option === "--deterministic") {
      options.deterministic = true;
    } else if (option === "--allow-write") {
      options.allowWrite = true;
    } else {
      throw new Error(`Unknown option: ${option}`);
    }
  }
  return options;
}

function isHelpToken(value: string | undefined): boolean {
  return value === "--help" || value === "-h" || value === "help";
}

function isCommandName(value: string | undefined): value is CommandName {
  return (
    value === "audit" ||
    value === "generate" ||
    value === "init" ||
    value === "doctor" ||
    value === "pr"
  );
}

function resolveTargets(options: CliOptions): ContextArtifactTarget[] {
  const targets: ContextArtifactTarget[] = [];
  if (options.context === "codex" || options.context === "both") {
    targets.push("agents");
  }
  if (options.context === "claude" || options.context === "both") {
    targets.push("claude");
  }
  if (options.skills === "codex" || options.skills === "both") {
    targets.push("skills");
  }
  if (options.skills === "claude" || options.skills === "both") {
    targets.push("claude-skills");
  }
  if (targets.length === 0) {
    throw new Error(
      "generate requires --context codex|claude|both, --skills codex|claude|both, or both.",
    );
  }
  targets.push("profile", "report", "config");
  return targets;
}

function parseArtifactSelection(
  value: string,
  flag: "--context" | "--skills",
): ArtifactSelection {
  if (value === "codex" || value === "claude" || value === "both") {
    return value;
  }
  throw new Error(
    `Unknown value for ${flag}. Expected codex, claude, or both.`,
  );
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
