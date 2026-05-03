#!/usr/bin/env bun
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  DEFAULT_CODEX_CLI_MODEL,
  type ModelProvider,
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
  compareProfileDrift,
  contentHash,
  createContextArtifacts,
  defaultArtifactTargets,
  expectedArtifactTypes,
  modelArtifactContentJsonSchema,
  modelSkillContentJsonSchema,
  parseModelArtifactContent,
  parseModelSkillContent,
  parseRepoProfileJson,
  parseStructuredRepoFacts,
  planArtifactWrites,
  profileFingerprint,
  renderReadinessReport,
  structuredContextOutputFromRepoFacts,
  structuredRepoFactsJsonSchema,
} from "@open-maintainer/context";
import {
  type GitHubRepositoryClient,
  fetchIssueTriageEvidence,
} from "@open-maintainer/github";
import {
  assembleLocalReviewInput,
  generateReview,
  renderInlineReviewComment,
  renderReviewMarkdown,
  renderReviewSummaryComment,
} from "@open-maintainer/review";
import type {
  IssueTriageEvidence,
  IssueTriageResult,
  ModelProviderConfig,
  ReviewCheckStatus,
  ReviewContributionTriageCategory,
  ReviewExistingComment,
  ReviewResult,
} from "@open-maintainer/shared";
import {
  IssueTriageResultSchema,
  newId,
  nowIso,
} from "@open-maintainer/shared";
import {
  buildIssueTriageModelPrompt,
  issueTriageModelOutputJsonSchema,
  mapIssueTriageLabelIntents,
  parseIssueTriageModelCompletion,
  renderIssueTriageCommentPreview,
} from "@open-maintainer/triage";

type CliOptions = {
  force: boolean;
  refreshGenerated: boolean;
  doctorFix: boolean;
  dryRun: boolean;
  createPr: boolean;
  failOnScoreBelow: number | null;
  reportPath: string | null;
  noProfileWrite: boolean;
  model: ArtifactModel | null;
  context: ArtifactSelection | null;
  skills: ArtifactSelection | null;
  allowWrite: boolean;
  llmModel: string | null;
  pr: number | null;
  baseRef: string | null;
  headRef: string | null;
  prNumber: number | null;
  outputPath: string | null;
  json: boolean;
  reviewProvider: ArtifactModel | null;
  reviewModel: string | null;
  allowModelContentTransfer: boolean;
  reviewPostSummary: boolean;
  reviewInlineComments: boolean;
  reviewInlineCap: number | null;
  reviewApplyTriageLabel: boolean;
  reviewCreateTriageLabels: boolean;
  issueNumber: number | null;
  triageState: "open" | "closed" | "all";
  triageLimit: number | null;
  triageLabel: string | null;
  issueApplyLabels: boolean;
  issueCreateLabels: boolean;
  issuePostComment: boolean;
};

type ArtifactSelection = "codex" | "claude" | "both";

const execFileAsync = promisify(execFile);

const rootUsage = `open-maintainer <command> <repo>

Commands:
  audit <repo>                         Analyze repo and write .open-maintainer/profile.json and report.md
  generate <repo> --model codex --context codex --skills codex
                                       Generate context artifacts safely
  init <repo>                           Run audit, then generate missing artifacts
  doctor <repo>                         Report missing or stale generated context
  review <repo>                         Produce or post a rule-grounded PR review
  triage issue <repo>                   Preview model-backed triage for one issue
  triage issues <repo>                  Preview model-backed triage for a bounded issue batch
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

Write options:
  --force                               Overwrite existing generated artifact files
  --refresh-generated                   Overwrite only existing Open Maintainer generated files
  --dry-run                             Print planned writes without writing files

Examples:
  open-maintainer generate ./repo --model codex --context codex --skills codex --allow-write
  open-maintainer generate ./repo --model claude --context claude --skills claude --allow-write
  open-maintainer generate ./repo --model codex --context both --skills both --allow-write
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
  --force                               Overwrite existing generated artifact files
  --refresh-generated                   Overwrite only existing Open Maintainer generated files
  --dry-run                             Print planned writes without writing files

Examples:
  open-maintainer init ./repo --model codex --context codex --skills codex --allow-write
`,
  doctor: `open-maintainer doctor <repo>

Check that required generated context artifacts are present and that the stored profile is not stale.

Options:
  --fix                                Remove obsolete generated context artifacts

Outputs:
  Agent readiness score
  Missing required artifacts, if any
  Profile drift, if detected

Examples:
  open-maintainer doctor .
  open-maintainer doctor . --fix
  open-maintainer doctor ./repo
`,
  review: `open-maintainer review <repo>

Produce a rule-grounded PR review from local git refs or a GitHub pull request. Local ref review is non-mutating by default. PR review fetches pull request refs with gh and posts marked summary plus capped inline comments unless --dry-run is used.

Diff options:
  --pr <number>                          Fetch PR metadata/diff with gh and post review comments
  --base-ref <ref>                      Base ref or SHA for the review diff
  --head-ref <ref>                      Head ref or SHA for the review diff (default: HEAD)
  --pr-number <number>                  Optional PR number metadata

Output options:
  --output-path <path>                  Write markdown review output to a file
  --json                                Print the machine-readable ReviewResult JSON
  --dry-run                             With --pr, fetch and review without posting to GitHub

Model review options:
  --model codex|claude                  Required CLI backend for model-backed review
  --llm-model <model>                   Optional backend model override
  --allow-model-content-transfer        Required with --model; sends repo content to the backend
  --review-provider codex|claude        Alias for --model, kept for existing scripts
  --review-model <model>                Alias for --llm-model, kept for existing scripts

Posting options:
  --review-post-summary                 Post or update the marked PR summary comment
  --review-inline-comments              Post capped inline finding comments
  --review-inline-cap <number>          Maximum inline comments (default with --pr: 5)
  --review-apply-triage-label           Apply one filterable PR label from the contribution-triage category
  --review-create-triage-labels         Create missing Open Maintainer PR triage labels before applying

Examples:
  open-maintainer review . --base-ref main --head-ref HEAD
  open-maintainer review . --base-ref origin/main --head-ref HEAD --output-path .open-maintainer/review.md
  open-maintainer review . --base-ref main --head-ref HEAD --json
  open-maintainer review . --base-ref main --head-ref HEAD --model codex --allow-model-content-transfer
  open-maintainer review . --pr 123 --model codex --allow-model-content-transfer
  open-maintainer review . --pr 123 --model claude --allow-model-content-transfer --dry-run
`,
  triage: `open-maintainer triage issue <repo> --number <n>
open-maintainer triage issues <repo> --state open --limit <n>

Run local, non-mutating model-backed triage for one GitHub issue or a bounded issue batch.

Single-issue required:
  --number <n>                          GitHub issue number to triage

Batch options:
  --state open|closed|all                Issue state to list (default: open)
  --limit <n>                            Maximum issues to triage before model calls (default: 10, max: 50)
  --label <name>                         Optional label filter for the issue list
  --apply-labels                         Apply mapped Open Maintainer issue labels
  --create-labels                        Create missing labels before applying them; requires --apply-labels
  --post-comment                         Post or update the marked Open Maintainer issue triage comment

Model required:
  --model codex|claude                  CLI backend used for model-backed triage
  --allow-model-content-transfer        Required; sends issue evidence and repo context to the backend

Model options:
  --llm-model <model>                   Optional backend model override

Output:
  .open-maintainer/triage/issues/<n>.json
  .open-maintainer/triage/runs/<run-id>.json
  .open-maintainer/triage/runs/<run-id>.md

Examples:
  open-maintainer triage issue . --number 82 --model codex --allow-model-content-transfer
  open-maintainer triage issues . --state open --limit 5 --model codex --allow-model-content-transfer
  open-maintainer triage issue . --number 82 --model claude --allow-model-content-transfer
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

  if (command === "triage") {
    const [subcommand, repoArg, ...rawOptions] = rest;
    if (subcommand !== "issue" && subcommand !== "issues") {
      console.error(
        "Unknown triage command. Expected: triage issue or triage issues\n",
      );
      console.error(commandUsages.triage);
      return 2;
    }
    if (!repoArg) {
      console.error("Missing repository path.\n");
      console.error(commandUsages.triage);
      return 2;
    }
    const repoRoot = path.resolve(repoArg);
    try {
      const options = parseOptions(rawOptions);
      if (subcommand === "issue") {
        await triageIssue(repoRoot, options);
      } else {
        await triageIssues(repoRoot, options);
      }
      return 0;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 1;
    }
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
        for (const line of formatReadinessSuggestions(profile)) {
          console.log(line);
        }
        return thresholdExit(profile.agentReadiness.score, options);
      }
      case "generate":
        await generate(repoRoot, options);
        return 0;
      case "init": {
        await audit(repoRoot, options);
        await generate(repoRoot, options);
        const { profile } = await audit(repoRoot, options);
        console.log(
          `Initialized Open Maintainer context at score ${profile.agentReadiness.score}/100.`,
        );
        return thresholdExit(profile.agentReadiness.score, options);
      }
      case "doctor": {
        let result = await doctor(repoRoot, repoArg);
        for (const line of result.messages) {
          console.log(line);
        }
        if (!result.ok && options.doctorFix) {
          if (result.fixablePaths.length > 0) {
            await removeDoctorFixableArtifacts(repoRoot, result.fixablePaths);
          }
          if (result.profileNeedsRefresh) {
            await audit(repoRoot, {
              ...options,
              noProfileWrite: false,
              reportPath: null,
            });
            console.log(
              "fix: refreshed .open-maintainer/profile.json and .open-maintainer/report.md",
            );
          }
          result = await doctor(repoRoot, repoArg);
          for (const line of result.messages) {
            console.log(line);
          }
        }
        return result.ok ? 0 : 1;
      }
      case "review":
        await review(repoRoot, options);
        return 0;
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
  const storedProfile = await readFile(
    path.join(openMaintainerDir, "profile.json"),
    "utf8",
  )
    .then(parseRepoProfileJson)
    .catch(() => null);
  const driftFindings = storedProfile
    ? compareProfileDrift({ stored: storedProfile, current: profile })
    : [];
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
  await writeFile(
    reportPath,
    renderReadinessReport(profile, { driftFindings }),
  );
  return { profile, reportPath };
}

async function generate(repoRoot: string, options: CliOptions): Promise<void> {
  const files = await scanRepository(repoRoot, { maxFiles: 800 });
  const profile = await createProfileFromFiles(repoRoot, files);
  const targets = resolveTargets(options);
  if (!options.model) {
    throw new Error(
      "generate requires --model codex or --model claude for LLM-backed artifact content.",
    );
  }
  const modelArtifacts = await generateModelArtifacts({
    repoRoot,
    profile,
    files,
    options,
  });
  const artifacts = createContextArtifacts({
    repoId: "local",
    profile,
    output: modelArtifacts.output,
    modelArtifacts: modelArtifacts.content,
    ...(modelArtifacts.skills ? { modelSkills: modelArtifacts.skills } : {}),
    modelProvider: modelArtifacts.provider,
    model: modelArtifacts.model,
    nextVersion: 1,
    targets,
  });
  const existingPaths = new Set(files.map((file) => file.path));
  const existingGeneratedPaths = new Set(
    files
      .filter((file) => isOpenMaintainerGeneratedFile(file.content))
      .map((file) => file.path),
  );
  const plan = planArtifactWrites({
    artifacts,
    existingPaths,
    ...(options.refreshGenerated ? { existingGeneratedPaths } : {}),
    force: options.force,
  });
  const artifactPaths = new Set(artifacts.map((artifact) => artifact.type));
  const obsoleteGeneratedPaths = options.force
    ? obsoleteGeneratedArtifactPaths({
        generatedPaths: existingGeneratedPaths,
        artifactPaths,
        targets,
      })
    : [];
  for (const item of obsoleteGeneratedPaths) {
    console.log(`remove: ${item} (obsolete generated artifact)`);
    if (!options.dryRun) {
      await rm(path.join(repoRoot, item), { force: true });
    }
  }
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

function obsoleteGeneratedArtifactPaths(input: {
  generatedPaths: Set<string>;
  artifactPaths: Set<string>;
  targets: ContextArtifactTarget[];
}): string[] {
  const targetRoots = new Set<string>();
  if (input.targets.includes("skills")) {
    targetRoots.add(".agents/skills/");
  }
  if (input.targets.includes("claude-skills")) {
    targetRoots.add(".claude/skills/");
  }
  if (targetRoots.size === 0) {
    return [];
  }
  return [...input.generatedPaths]
    .filter((generatedPath) =>
      [...targetRoots].some((root) => generatedPath.startsWith(root)),
    )
    .filter((generatedPath) => !input.artifactPaths.has(generatedPath))
    .sort();
}

function isOpenMaintainerGeneratedFile(content: string): boolean {
  return (
    content.includes("generated by open-maintainer") ||
    content.includes("by: open-maintainer") ||
    content.includes('"openMaintainerProfileHash"') ||
    content.includes("# Open Maintainer Readiness Report") ||
    content.includes("# Open Maintainer Report:")
  );
}

async function doctor(
  repoRoot: string,
  repoDisplayPath = repoRoot,
): Promise<{
  ok: boolean;
  messages: string[];
  fixablePaths: string[];
  profileNeedsRefresh: boolean;
}> {
  const profile = await createProfile(repoRoot);
  const files = await scanRepository(repoRoot, { maxFiles: 800 });
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const paths = new Set(filesByPath.keys());
  const currentProfileHash = profileFingerprint(profile);
  const storedProfile = filesByPath.get(".open-maintainer/profile.json");
  const driftFindings = storedProfile
    ? compareProfileDrift({
        stored: parseRepoProfileJson(storedProfile.content) ?? profile,
        current: profile,
      })
    : [];
  const parsedStoredProfile = storedProfile
    ? (parseRepoProfileJson(storedProfile.content) ?? null)
    : null;
  const storedContextHashes = new Map(
    parsedStoredProfile?.contextArtifactHashes.map((item) => [
      item.path,
      item.hash,
    ]) ?? [],
  );
  const required = doctorRequiredArtifacts(profile, storedContextHashes);
  const requiredPaths = new Set(required);
  const missing = required.filter(
    (artifactPath) => !requiredArtifactPresent(artifactPath, paths),
  );
  const stale = required.filter((artifactPath) => {
    const file = filesByPath.get(artifactPath);
    if (!file) {
      return false;
    }
    if (artifactPath === ".open-maintainer/profile.json") {
      return !file.content.includes(currentProfileHash);
    }
    const storedHash = storedContextHashes.get(artifactPath);
    if (storedHash) {
      return contentHash(file.content) !== storedHash;
    }
    return (
      file.content.includes("generated by open-maintainer") &&
      !file.content.includes(`profileHash=${currentProfileHash}`)
    );
  });
  const obsolete = doctorObsoleteGeneratedArtifacts({
    files,
    expectedPaths: requiredPaths,
    storedContextHashes,
  });
  const fixablePaths = obsolete;
  const profileNeedsRefresh =
    stale.includes(".open-maintainer/profile.json") || driftFindings.length > 0;
  const fixCommand =
    fixablePaths.length > 0 || profileNeedsRefresh
      ? formatDoctorFixCommand({
          repoPath: repoDisplayPath,
        })
      : null;
  return {
    ok:
      missing.length === 0 &&
      stale.length === 0 &&
      obsolete.length === 0 &&
      driftFindings.length === 0,
    messages: [
      `Agent Readiness: ${profile.agentReadiness.score}/100`,
      ...(missing.length > 0
        ? missing.map((item) => `missing: ${item}`)
        : ["all required artifacts are present"]),
      ...driftFindings.map(formatDriftFinding),
      ...stale.map(
        (item) =>
          `drift: ${item} was generated from a different repository profile`,
      ),
      ...obsolete.map(
        (item) =>
          `obsolete: ${item} is a generated context artifact no longer tracked by .open-maintainer/profile.json`,
      ),
      ...(fixCommand ? [`fix: ${fixCommand}`] : []),
    ],
    fixablePaths,
    profileNeedsRefresh,
  };
}

function doctorRequiredArtifacts(
  profile: ReturnType<typeof analyzeRepo>,
  storedContextHashes: Map<string, string>,
): string[] {
  if (storedContextHashes.size === 0) {
    return expectedArtifactTypes({
      profile,
      targets: defaultArtifactTargets,
    });
  }
  return [
    ...storedContextHashes.keys(),
    ".open-maintainer/profile.json",
    ".open-maintainer/report.md",
  ];
}

function doctorObsoleteGeneratedArtifacts(input: {
  files: Awaited<ReturnType<typeof scanRepository>>;
  expectedPaths: Set<string>;
  storedContextHashes: Map<string, string>;
}): string[] {
  if (input.storedContextHashes.size === 0) {
    return [];
  }
  return input.files
    .filter((file) => isGeneratedContextArtifactPath(file.path))
    .filter((file) => isOpenMaintainerGeneratedFile(file.content))
    .map((file) => file.path)
    .filter((filePath) => !input.expectedPaths.has(filePath))
    .sort();
}

function isGeneratedContextArtifactPath(repoPath: string): boolean {
  return (
    repoPath === "AGENTS.md" ||
    repoPath === "CLAUDE.md" ||
    repoPath === ".open-maintainer.yml" ||
    repoPath === ".github/copilot-instructions.md" ||
    repoPath === ".cursor/rules/open-maintainer.md" ||
    repoPath.startsWith(".agents/skills/") ||
    repoPath.startsWith(".claude/skills/")
  );
}

async function removeDoctorFixableArtifacts(
  repoRoot: string,
  fixablePaths: string[],
): Promise<void> {
  if (fixablePaths.length === 0) {
    console.log(
      "fix: no obsolete generated artifacts can be removed automatically",
    );
    return;
  }
  for (const item of fixablePaths) {
    console.log(`remove: ${item} (obsolete generated artifact)`);
    await rm(path.join(repoRoot, item), { force: true });
  }
}

function formatDoctorFixCommand({ repoPath }: { repoPath: string }): string {
  return ["bun run cli doctor", shellQuote(repoPath), "--fix"].join(" ");
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function formatDriftFinding(
  finding: ReturnType<typeof compareProfileDrift>[number],
): string {
  if (finding.group === "ci") {
    return `drift: CI workflow ${finding.subject} was ${finding.changeType}`;
  }
  if (finding.group === "docs") {
    return `drift: docs ${finding.subject} was ${finding.changeType}; review generated context against updated docs`;
  }
  if (finding.group === "templates") {
    return `drift: template ${finding.subject} was ${finding.changeType}; review issue and PR guidance`;
  }
  if (finding.group === "context") {
    return `drift: context artifact ${finding.subject} was ${finding.changeType}; rerun generation or review the artifact`;
  }
  if (finding.group === "lock_config") {
    return `drift: lockfile/config ${finding.subject} was ${finding.changeType}; review setup and validation context`;
  }
  if (finding.group === "boundaries") {
    return `drift: package boundary ${finding.subject} was ${finding.changeType}; review package/app context`;
  }
  if (finding.group === "risk") {
    return `drift: risk path ${finding.subject} was ${finding.changeType}; review high-risk area guidance`;
  }
  if (finding.changeType === "added") {
    return `drift: command ${finding.subject} was added: ${JSON.stringify(
      finding.currentValue,
    )}`;
  }
  if (finding.changeType === "removed") {
    return `drift: command ${finding.subject} was removed: ${JSON.stringify(
      finding.previousValue,
    )}`;
  }
  return `drift: command ${finding.subject} changed from ${JSON.stringify(
    finding.previousValue,
  )} to ${JSON.stringify(finding.currentValue)}`;
}

function requiredArtifactPresent(
  artifactPath: string,
  paths: Set<string>,
): boolean {
  if (paths.has(artifactPath)) {
    return true;
  }
  if (!artifactPath.endsWith("/SKILL.md")) {
    return false;
  }
  const requiredRole = skillRoleFromPath(artifactPath);
  if (!requiredRole) {
    return false;
  }
  return [...paths].some(
    (repoPath) =>
      repoPath.endsWith("/SKILL.md") &&
      (repoPath.startsWith(".agents/skills/") ||
        repoPath.startsWith(".claude/skills/")) &&
      skillRoleFromPath(repoPath) === requiredRole,
  );
}

function skillRoleFromPath(
  repoPath: string,
): "start" | "testing" | "review" | null {
  if (repoPath.includes("start-task") || repoPath.includes("repo-overview")) {
    return "start";
  }
  if (
    repoPath.includes("testing-workflow") ||
    repoPath.includes("validation-testing") ||
    repoPath.includes("test-workflow")
  ) {
    return "testing";
  }
  if (repoPath.includes("pr-review")) {
    return "review";
  }
  return null;
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

async function triageIssue(
  repoRoot: string,
  options: CliOptions,
): Promise<void> {
  if (options.issueNumber === null) {
    throw new Error("triage issue requires --number <n>.");
  }
  validateIssueTriageWriteOptions(options);
  const context = await prepareIssueTriageContext(repoRoot, options);
  const { evidence, result, artifactPath } = await runIssueTriagePreview({
    repoRoot,
    context,
    issueNumber: options.issueNumber,
    options,
  });
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  for (const line of formatIssueTriageSummary(result, evidence, artifactPath)) {
    console.log(line);
  }
}

type IssueTriageContext = {
  profile: Awaited<ReturnType<typeof createProfileFromFiles>>;
  providerConfig: ModelProviderConfig;
  provider: ModelProvider;
  client: GitHubRepositoryClient;
};

type IssueTriagePreview = {
  evidence: IssueTriageEvidence;
  result: IssueTriageResult;
  artifactPath: string;
};

async function prepareIssueTriageContext(
  repoRoot: string,
  options: CliOptions,
): Promise<IssueTriageContext> {
  const files = await scanRepository(repoRoot, { maxFiles: 800 });
  const profile = await createProfileFromFiles(repoRoot, files);
  const provider = buildIssueTriageProvider({
    repoRoot,
    provider: options.model,
    model: options.llmModel,
    allowModelContentTransfer: options.allowModelContentTransfer,
  });
  return {
    profile,
    providerConfig: provider.providerConfig,
    provider: provider.provider,
    client: buildGhIssueTriageClient(repoRoot),
  };
}

async function runIssueTriagePreview(input: {
  repoRoot: string;
  context: IssueTriageContext;
  issueNumber: number;
  options: CliOptions;
}): Promise<IssueTriagePreview> {
  const { profile, providerConfig, provider, client } = input.context;
  const evidence = await fetchIssueTriageEvidence({
    repoId: profile.repoId,
    owner: profile.owner,
    repo: profile.name,
    issueNumber: input.issueNumber,
    sourceProfileVersion: profile.version,
    client,
  });
  const triageInput = {
    repoId: profile.repoId,
    owner: profile.owner,
    repo: profile.name,
    issueNumber: input.issueNumber,
    evidence,
    modelProvider: providerConfig.displayName,
    model: providerConfig.model,
    consentMode: "explicit_repository_content_transfer" as const,
    createdAt: nowIso(),
  };
  const completion = await provider.complete(
    buildIssueTriageModelPrompt(triageInput),
    { outputSchema: issueTriageModelOutputJsonSchema },
  );
  const modelResult = parseIssueTriageModelCompletion(completion.text);
  const artifactPath = path.join(
    ".open-maintainer",
    "triage",
    "issues",
    `${input.issueNumber}.json`,
  );
  const commentPreview = renderIssueTriageCommentPreview(
    modelResult,
    artifactPath,
  );
  const writeActions = await issueTriageWriteActions(input.repoRoot, {
    owner: profile.owner,
    repo: profile.name,
    issueNumber: input.issueNumber,
    labelIntents: modelResult.labelIntents,
    commentPreview,
    applyLabels: input.options.issueApplyLabels,
    createLabels: input.options.issueCreateLabels,
    postComment: input.options.issuePostComment,
  });
  const result = IssueTriageResultSchema.parse({
    ...modelResult,
    commentPreview,
    id: newId("issue_triage"),
    repoId: profile.repoId,
    issueNumber: input.issueNumber,
    writeActions,
    modelProvider: providerConfig.displayName,
    model: completion.model,
    consentMode: "explicit_repository_content_transfer",
    sourceProfileVersion: profile.version,
    contextArtifactVersion: null,
    createdAt: nowIso(),
  } satisfies IssueTriageResult);
  await writeIssueTriageArtifact(input.repoRoot, artifactPath, {
    input: triageInput,
    result,
  });
  return { evidence, result, artifactPath };
}

async function triageIssues(
  repoRoot: string,
  options: CliOptions,
): Promise<void> {
  validateIssueTriageWriteOptions(options);
  const limit = options.triageLimit ?? 10;
  const context = await prepareIssueTriageContext(repoRoot, options);
  const issues = await listIssuesForTriage(repoRoot, {
    owner: context.profile.owner,
    repo: context.profile.name,
    state: options.triageState,
    limit,
    label: options.triageLabel,
  });
  const runId = newId("triage_run");
  const records: IssueTriageBatchRecord[] = [];
  for (const issue of issues) {
    try {
      const preview = await runIssueTriagePreview({
        repoRoot,
        context,
        issueNumber: issue.number,
        options,
      });
      records.push({
        status: "succeeded",
        issueNumber: issue.number,
        title: preview.evidence.issue.title,
        artifactPath: preview.artifactPath,
        classification: preview.result.classification,
        agentReadiness: preview.result.agentReadiness,
        nextAction: preview.result.nextAction,
        writeActions: preview.result.writeActions,
      });
    } catch (error) {
      records.push({
        status: "failed",
        issueNumber: issue.number,
        title: issue.title,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const report = {
    runId,
    owner: context.profile.owner,
    repo: context.profile.name,
    state: options.triageState,
    limit,
    label: options.triageLabel,
    issueCount: issues.length,
    provider: context.providerConfig.displayName,
    model: context.providerConfig.model,
    consentMode: "explicit_repository_content_transfer" as const,
    issues: records,
    createdAt: nowIso(),
  };
  const jsonPath = path.join(
    ".open-maintainer",
    "triage",
    "runs",
    `${runId}.json`,
  );
  const markdownPath = path.join(
    ".open-maintainer",
    "triage",
    "runs",
    `${runId}.md`,
  );
  await writeTriageRunReports(repoRoot, {
    jsonPath,
    markdownPath,
    report,
    markdown: renderTriageBatchMarkdown(report),
  });
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(renderTriageBatchConsole(report, { jsonPath, markdownPath }));
}

type ListedIssueForTriage = {
  number: number;
  title: string;
};

type IssueTriageBatchRecord =
  | {
      status: "succeeded";
      issueNumber: number;
      title: string;
      artifactPath: string;
      classification: IssueTriageResult["classification"];
      agentReadiness: IssueTriageResult["agentReadiness"];
      nextAction: string;
      writeActions: IssueTriageResult["writeActions"];
    }
  | {
      status: "failed";
      issueNumber: number;
      title: string;
      error: string;
    };

type IssueTriageBatchReport = {
  runId: string;
  owner: string;
  repo: string;
  state: "open" | "closed" | "all";
  limit: number;
  label: string | null;
  issueCount: number;
  provider: string;
  model: string;
  consentMode: "explicit_repository_content_transfer";
  issues: IssueTriageBatchRecord[];
  createdAt: string;
};

async function listIssuesForTriage(
  repoRoot: string,
  input: {
    owner: string;
    repo: string;
    state: "open" | "closed" | "all";
    limit: number;
    label: string | null;
  },
): Promise<ListedIssueForTriage[]> {
  const issues: ListedIssueForTriage[] = [];
  for (let page = 1; issues.length < input.limit; page += 1) {
    const pageSize = Math.min(100, input.limit - issues.length);
    const args = [
      "-F",
      `state=${input.state}`,
      "-F",
      `per_page=${pageSize}`,
      "-F",
      `page=${page}`,
      ...(input.label ? ["-F", `labels=${input.label}`] : []),
    ];
    const pageItems = await ghApiJson<
      Array<{
        number?: number | null;
        title?: string | null;
        pull_request?: unknown;
      }>
    >(repoRoot, `repos/${input.owner}/${input.repo}/issues`, args);
    for (const item of pageItems) {
      if (issues.length >= input.limit) {
        break;
      }
      if (item.pull_request || !item.number || !item.title) {
        continue;
      }
      issues.push({ number: item.number, title: item.title });
    }
    if (pageItems.length < pageSize) {
      break;
    }
  }
  return issues;
}

async function writeTriageRunReports(
  repoRoot: string,
  input: {
    jsonPath: string;
    markdownPath: string;
    report: IssueTriageBatchReport;
    markdown: string;
  },
): Promise<void> {
  const absoluteJsonPath = path.join(repoRoot, input.jsonPath);
  const absoluteMarkdownPath = path.join(repoRoot, input.markdownPath);
  await mkdir(path.dirname(absoluteJsonPath), { recursive: true });
  await writeFile(
    absoluteJsonPath,
    `${JSON.stringify(input.report, null, 2)}\n`,
  );
  await writeFile(absoluteMarkdownPath, input.markdown);
}

function renderTriageBatchConsole(
  report: IssueTriageBatchReport,
  paths: { jsonPath: string; markdownPath: string },
): string {
  return [
    `Issue triage run: ${report.runId}`,
    `Issues: ${report.issueCount} (state=${report.state}, limit=${report.limit})`,
    renderTriageBatchGroups(report),
    `JSON report: ${paths.jsonPath}`,
    `Markdown report: ${paths.markdownPath}`,
    "GitHub writes: skipped (preview-only default)",
  ].join("\n");
}

function renderTriageBatchMarkdown(report: IssueTriageBatchReport): string {
  return [
    `# Open Maintainer Issue Triage Run ${report.runId}`,
    "",
    `Repository: ${report.owner}/${report.repo}`,
    `State: ${report.state}`,
    `Limit: ${report.limit}`,
    `Provider: ${report.provider}`,
    `Model: ${report.model}`,
    `Consent: ${report.consentMode}`,
    "",
    renderTriageBatchGroups(report),
    "",
  ].join("\n");
}

function renderTriageBatchGroups(report: IssueTriageBatchReport): string {
  const lines: string[] = [];
  for (const group of TRIAGE_BATCH_GROUPS) {
    const records = report.issues.filter((record) =>
      group.classification
        ? record.status === "succeeded" &&
          record.classification === group.classification
        : record.status === "failed",
    );
    lines.push(`## ${group.title}`);
    if (records.length === 0) {
      lines.push("- none");
      lines.push("");
      continue;
    }
    for (const record of records) {
      if (record.status === "failed") {
        lines.push(
          `- #${record.issueNumber} ${record.title}: error: ${record.error}`,
        );
      } else {
        lines.push(
          `- #${record.issueNumber} ${record.title}: ${record.nextAction} (${record.artifactPath})`,
        );
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

const TRIAGE_BATCH_GROUPS: Array<{
  title: string;
  classification: IssueTriageResult["classification"] | null;
}> = [
  { title: "Ready for review", classification: "ready_for_review" },
  { title: "Needs author input", classification: "needs_author_input" },
  { title: "Needs human design", classification: "needs_maintainer_design" },
  { title: "Not agent-ready", classification: "not_agent_ready" },
  { title: "Possible spam", classification: "possible_spam" },
  { title: "Errors", classification: null },
];

function buildIssueTriageProvider(input: {
  repoRoot: string;
  provider: ArtifactModel | null;
  model: string | null;
  allowModelContentTransfer: boolean;
}): { providerConfig: ModelProviderConfig; provider: ModelProvider } {
  if (!input.provider) {
    throw new Error(
      "triage issue requires --model codex or --model claude because issue triage is LLM-backed only.",
    );
  }
  if (!input.allowModelContentTransfer) {
    throw new Error(
      "--model requires --allow-model-content-transfer because issue triage sends repository context and issue content to the selected CLI backend.",
    );
  }
  const createdAt = new Date(0).toISOString();
  const codexModel =
    input.model ??
    process.env.OPEN_MAINTAINER_CODEX_MODEL ??
    DEFAULT_CODEX_CLI_MODEL;
  const providerConfig: ModelProviderConfig =
    input.provider === "codex"
      ? {
          id: "model_provider_cli_issue_triage_codex",
          kind: "codex-cli",
          displayName: "Codex CLI",
          baseUrl: "http://localhost",
          model: codexModel,
          encryptedApiKey: "local-cli",
          repoContentConsent: true,
          createdAt,
          updatedAt: createdAt,
        }
      : {
          id: "model_provider_cli_issue_triage_claude",
          kind: "claude-cli",
          displayName: "Claude CLI",
          baseUrl: "http://localhost",
          model: input.model ?? "claude-cli",
          encryptedApiKey: "local-cli",
          repoContentConsent: true,
          createdAt,
          updatedAt: createdAt,
        };
  const provider =
    input.provider === "codex"
      ? buildCodexCliProvider({
          cwd: input.repoRoot,
          model: codexModel,
        })
      : buildClaudeCliProvider({
          cwd: input.repoRoot,
          ...(input.model ? { model: input.model } : {}),
        });
  return { providerConfig, provider };
}

function buildGhIssueTriageClient(repoRoot: string): GitHubRepositoryClient {
  return {
    repos: {
      async getContent() {
        throw new Error(
          "Repository content fetching is not used for issue triage.",
        );
      },
      async createOrUpdateFileContents() {
        throw new Error("Repository writes are not used for issue triage.");
      },
    },
    git: {
      async getRef() {
        throw new Error("Git ref reads are not used for issue triage.");
      },
      async createRef() {
        throw new Error("Git ref writes are not used for issue triage.");
      },
      async updateRef() {
        throw new Error("Git ref writes are not used for issue triage.");
      },
    },
    pulls: {
      async list() {
        return { data: [] };
      },
      async create() {
        throw new Error("Pull request writes are not used for issue triage.");
      },
      async update() {
        throw new Error("Pull request writes are not used for issue triage.");
      },
    },
    issues: {
      async get(input) {
        return {
          data: await ghApiJson(
            repoRoot,
            issueEndpoint(input.owner, input.repo, input.issue_number),
          ),
        };
      },
      async listComments(input) {
        const args = [
          "-F",
          `per_page=${input.per_page ?? 100}`,
          "-F",
          `page=${input.page ?? 1}`,
        ];
        return {
          data: await ghApiJson(
            repoRoot,
            `${issueEndpoint(input.owner, input.repo, input.issue_number)}/comments`,
            args,
          ),
        };
      },
    },
    search: {
      async issuesAndPullRequests(input) {
        const args = [
          "-F",
          `q=${input.q}`,
          "-F",
          `per_page=${input.per_page ?? 10}`,
          "-F",
          `page=${input.page ?? 1}`,
        ];
        return { data: await ghApiJson(repoRoot, "search/issues", args) };
      },
    },
  };
}

function issueEndpoint(
  owner: string,
  repo: string,
  issueNumber: number,
): string {
  return `repos/${owner}/${repo}/issues/${issueNumber}`;
}

function validateIssueTriageWriteOptions(options: CliOptions): void {
  if (options.issueCreateLabels && !options.issueApplyLabels) {
    throw new Error("--create-labels requires --apply-labels.");
  }
}

async function issueTriageWriteActions(
  repoRoot: string,
  input: {
    owner: string;
    repo: string;
    issueNumber: number;
    labelIntents: IssueTriageResult["labelIntents"];
    commentPreview: IssueTriageResult["commentPreview"];
    applyLabels: boolean;
    createLabels: boolean;
    postComment: boolean;
  },
): Promise<IssueTriageResult["writeActions"]> {
  const labelActions = await issueTriageLabelActions(repoRoot, input);
  const commentAction = await issueTriageCommentAction(repoRoot, input);
  return [
    ...labelActions,
    commentAction,
    {
      type: "close_issue",
      status: "skipped",
      target: `issue:${input.issueNumber}`,
      reason:
        "Issue triage is non-mutating by default; closure was not requested.",
    },
  ];
}

async function issueTriageCommentAction(
  repoRoot: string,
  input: {
    owner: string;
    repo: string;
    issueNumber: number;
    commentPreview: IssueTriageResult["commentPreview"];
    postComment: boolean;
  },
): Promise<IssueTriageResult["writeActions"][number]> {
  if (!input.postComment) {
    return {
      type: "post_comment",
      status: "skipped",
      target: `issue:${input.issueNumber}`,
      reason:
        "Issue triage is non-mutating by default; comment posting was not requested.",
    };
  }
  const comments = await ghApiJson<
    Array<{ id?: number | string | null; body?: string | null }>
  >(
    repoRoot,
    `${issueEndpoint(input.owner, input.repo, input.issueNumber)}/comments?per_page=100`,
  );
  const existing = comments.find((comment) =>
    comment.body?.includes(input.commentPreview.marker),
  );
  if (existing?.id) {
    await ghApiWithJsonBody(
      repoRoot,
      `repos/${input.owner}/${input.repo}/issues/comments/${existing.id}`,
      "PATCH",
      { body: input.commentPreview.body },
    );
    return {
      type: "update_comment",
      status: "applied",
      target: `comment:${existing.id}`,
      reason: "Updated existing marked issue triage comment.",
    };
  }
  await ghApiWithJsonBody(
    repoRoot,
    `${issueEndpoint(input.owner, input.repo, input.issueNumber)}/comments`,
    "POST",
    { body: input.commentPreview.body },
  );
  return {
    type: "post_comment",
    status: "applied",
    target: `issue:${input.issueNumber}`,
    reason:
      "Posted marked issue triage comment because --post-comment was set.",
  };
}

async function issueTriageLabelActions(
  repoRoot: string,
  input: {
    owner: string;
    repo: string;
    issueNumber: number;
    labelIntents: IssueTriageResult["labelIntents"];
    applyLabels: boolean;
    createLabels: boolean;
  },
): Promise<IssueTriageResult["writeActions"]> {
  const mappedLabels = mapIssueTriageLabelIntents(input.labelIntents);
  if (mappedLabels.length === 0) {
    return [
      {
        type: "apply_label",
        status: "skipped",
        target: `issue:${input.issueNumber}`,
        reason: "Model returned no issue label intents.",
      },
    ];
  }
  const repoLabels = await listRepoLabelNames(
    repoRoot,
    input.owner,
    input.repo,
  );
  if (!input.applyLabels) {
    return mappedLabels.map((label) => ({
      type: "apply_label",
      status: "skipped",
      target: label.label,
      reason: repoLabels.has(label.label)
        ? "Label exists; pass --apply-labels to apply it."
        : "Label is missing; pass --apply-labels --create-labels to create and apply it.",
    }));
  }

  const actions: IssueTriageResult["writeActions"] = [];
  const missingLabels = mappedLabels.filter(
    (label) => !repoLabels.has(label.label),
  );
  if (missingLabels.length > 0 && input.createLabels) {
    for (const label of missingLabels) {
      await createIssueTriageLabel(
        repoRoot,
        input.owner,
        input.repo,
        label.label,
      );
      repoLabels.add(label.label);
      actions.push({
        type: "create_label",
        status: "applied",
        target: label.label,
        reason:
          "Created missing issue triage label because --create-labels was set.",
      });
    }
  } else {
    for (const label of missingLabels) {
      actions.push({
        type: "create_label",
        status: "skipped",
        target: label.label,
        reason: "Label is missing; pass --create-labels to create it.",
      });
    }
  }

  const issueLabels = await listIssueLabelNames(
    repoRoot,
    input.owner,
    input.repo,
    input.issueNumber,
  );
  const labelsToApply = mappedLabels
    .filter((label) => repoLabels.has(label.label))
    .filter((label) => !issueLabels.has(label.label));
  for (const label of mappedLabels) {
    if (issueLabels.has(label.label)) {
      actions.push({
        type: "apply_label",
        status: "skipped",
        target: label.label,
        reason: "Issue already has this label.",
      });
    } else if (!repoLabels.has(label.label)) {
      actions.push({
        type: "apply_label",
        status: "skipped",
        target: label.label,
        reason: "Label is missing and was not created.",
      });
    }
  }
  if (labelsToApply.length > 0) {
    await applyIssueLabels(
      repoRoot,
      input.owner,
      input.repo,
      input.issueNumber,
      labelsToApply.map((label) => label.label),
    );
    for (const label of labelsToApply) {
      actions.push({
        type: "apply_label",
        status: "applied",
        target: label.label,
        reason: "Applied issue triage label because --apply-labels was set.",
      });
    }
  }
  return actions;
}

async function listRepoLabelNames(
  repoRoot: string,
  owner: string,
  repo: string,
): Promise<Set<string>> {
  const labels = await ghApiJson<Array<{ name?: string | null }>>(
    repoRoot,
    `repos/${owner}/${repo}/labels?per_page=100`,
  );
  return new Set(labels.flatMap((label) => (label.name ? [label.name] : [])));
}

async function listIssueLabelNames(
  repoRoot: string,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<Set<string>> {
  const labels = await ghApiJson<Array<{ name?: string | null }>>(
    repoRoot,
    `${issueEndpoint(owner, repo, issueNumber)}/labels?per_page=100`,
  );
  return new Set(labels.flatMap((label) => (label.name ? [label.name] : [])));
}

async function createIssueTriageLabel(
  repoRoot: string,
  owner: string,
  repo: string,
  label: string,
): Promise<void> {
  await ghApiWithJsonBody(repoRoot, `repos/${owner}/${repo}/labels`, "POST", {
    name: label,
    color: "5319e7",
    description: "Open Maintainer issue triage label.",
  });
}

async function applyIssueLabels(
  repoRoot: string,
  owner: string,
  repo: string,
  issueNumber: number,
  labels: string[],
): Promise<void> {
  await ghApiWithJsonBody(
    repoRoot,
    `${issueEndpoint(owner, repo, issueNumber)}/labels`,
    "POST",
    {
      labels,
    },
  );
}

async function writeIssueTriageArtifact(
  repoRoot: string,
  artifactPath: string,
  artifact: { input: unknown; result: IssueTriageResult },
): Promise<void> {
  const absolutePath = path.join(repoRoot, artifactPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(artifact, null, 2)}\n`);
}

function formatIssueTriageSummary(
  result: IssueTriageResult,
  evidence: IssueTriageEvidence,
  artifactPath: string,
): string[] {
  const riskFlags =
    result.riskFlags.length > 0 ? result.riskFlags.join(", ") : "none";
  const missing =
    result.missingInformation.length > 0
      ? result.missingInformation.join("; ")
      : "none";
  const requiredActions =
    result.requiredAuthorActions.length > 0
      ? result.requiredAuthorActions.join("; ")
      : "none";
  const labelIntents =
    result.labelIntents.length > 0 ? result.labelIntents.join(", ") : "none";
  return [
    `Issue #${result.issueNumber}: ${evidence.issue.title}`,
    `Classification: ${result.classification}`,
    `Agent readiness: ${result.agentReadiness}`,
    `Confidence: ${result.confidence}`,
    `Risk flags: ${riskFlags}`,
    `Missing information: ${missing}`,
    `Required author actions: ${requiredActions}`,
    `Label intents: ${labelIntents}`,
    `Label actions: ${formatWriteActionSummary(result.writeActions, "apply_label")}`,
    `Next action: ${result.nextAction}`,
    `Comment preview: ${result.commentPreview.summary}`,
    `Comment action: ${formatCommentActionSummary(result.writeActions)}`,
    `Artifact: ${artifactPath}`,
    "GitHub writes: skipped (preview-only default)",
  ];
}

function formatWriteActionSummary(
  actions: IssueTriageResult["writeActions"],
  type: IssueTriageResult["writeActions"][number]["type"],
): string {
  const matching = actions.filter((action) => action.type === type);
  if (matching.length === 0) {
    return "none";
  }
  return matching
    .map(
      (action) =>
        `${action.status} ${action.target ?? "target"} (${action.reason})`,
    )
    .join("; ");
}

function formatCommentActionSummary(
  actions: IssueTriageResult["writeActions"],
): string {
  const matching = actions.filter(
    (action) =>
      action.type === "post_comment" || action.type === "update_comment",
  );
  if (matching.length === 0) {
    return "none";
  }
  return matching
    .map(
      (action) =>
        `${action.status} ${action.target ?? "target"} (${action.reason})`,
    )
    .join("; ");
}

async function review(repoRoot: string, options: CliOptions): Promise<void> {
  if (
    (options.reviewPostSummary ||
      options.reviewInlineComments ||
      options.reviewApplyTriageLabel ||
      options.reviewCreateTriageLabels) &&
    options.pr === null
  ) {
    throw new Error(
      "Review GitHub write flags require --pr <number> so the CLI can target a GitHub pull request with gh.",
    );
  }
  if (options.reviewCreateTriageLabels && !options.reviewApplyTriageLabel) {
    throw new Error(
      "--review-create-triage-labels requires --review-apply-triage-label.",
    );
  }
  if (
    options.reviewInlineCap !== null &&
    !options.reviewInlineComments &&
    options.pr === null
  ) {
    throw new Error(
      "--review-inline-cap requires --review-inline-comments or --pr.",
    );
  }
  const files = await scanRepository(repoRoot, { maxFiles: 800 });
  const profile = await createProfileFromFiles(repoRoot, files);
  const pullRequest = options.pr
    ? await preparePullRequestReview(repoRoot, options.pr)
    : null;
  const baseRef =
    pullRequest?.baseRef ??
    options.baseRef ??
    (await detectDefaultBranch(repoRoot)) ??
    profile.defaultBranch ??
    "main";
  const headRef = pullRequest?.headRef ?? options.headRef ?? "HEAD";
  const input = await assembleLocalReviewInput({
    repoRoot,
    repoId: profile.repoId,
    baseRef,
    headRef,
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Unable to assemble review diff for ${baseRef}...${headRef}. Verify --base-ref and --head-ref. ${message}`,
    );
  });
  const reviewInput = {
    ...input,
    ...(pullRequest
      ? {
          prNumber: pullRequest.number,
          owner: pullRequest.owner,
          repo: pullRequest.repo,
          title: pullRequest.title,
          body: pullRequest.body,
          url: pullRequest.url,
          author: pullRequest.author,
          isDraft: pullRequest.isDraft,
          mergeable: pullRequest.mergeable,
          mergeStateStatus: pullRequest.mergeStateStatus,
          reviewDecision: pullRequest.reviewDecision,
          baseSha: pullRequest.baseSha,
          headSha: pullRequest.headSha,
          checkStatuses: pullRequest.checkStatuses,
          existingComments: pullRequest.existingComments,
        }
      : {
          prNumber: options.prNumber,
          owner: profile.owner,
          repo: profile.name,
          isDraft: null,
          mergeable: null,
          mergeStateStatus: null,
          reviewDecision: null,
        }),
  };
  const providerReview = buildReviewProvider({
    repoRoot,
    provider: resolveReviewProvider(options),
    model: resolveReviewModel(options),
    allowModelContentTransfer: options.allowModelContentTransfer,
  });
  const [
    openMaintainerConfig,
    agentsMd,
    repoPrReviewSkill,
    repoTestingWorkflowSkill,
    repoOverviewSkill,
    generatedReport,
  ] = await Promise.all([
    readOptionalRepoFile(repoRoot, ".open-maintainer.yml"),
    readOptionalRepoFile(repoRoot, "AGENTS.md"),
    readOptionalRepoFile(
      repoRoot,
      `.agents/skills/${profile.name}-pr-review/SKILL.md`,
    ),
    readOptionalRepoFile(
      repoRoot,
      `.agents/skills/${profile.name}-testing-workflow/SKILL.md`,
    ),
    readOptionalRepoFile(
      repoRoot,
      `.agents/skills/${profile.name}-start-task/SKILL.md`,
    ),
    readOptionalRepoFile(repoRoot, ".open-maintainer/report.md"),
  ]);
  const promptContext = {
    ...(openMaintainerConfig ? { openMaintainerConfig } : {}),
    ...(agentsMd ? { agentsMd } : {}),
    ...(generatedReport ? { generatedContext: generatedReport } : {}),
    ...(repoPrReviewSkill ? { repoPrReviewSkill } : {}),
    ...(repoTestingWorkflowSkill ? { repoTestingWorkflowSkill } : {}),
    ...(repoOverviewSkill ? { repoOverviewSkill } : {}),
  };
  const result = await generateReview({
    profile,
    input: reviewInput,
    rules: profile.reviewRuleCandidates,
    providerConfig: providerReview.providerConfig,
    provider: providerReview.provider,
    ...(Object.keys(promptContext).length > 0 ? { promptContext } : {}),
  });
  if (options.outputPath) {
    const outputPath = path.resolve(repoRoot, options.outputPath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, renderReviewMarkdown(result));
    if (!options.json) {
      console.log(`Review: ${path.relative(repoRoot, outputPath)}`);
    }
  }
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (!options.outputPath && !pullRequest) {
    console.log(renderReviewMarkdown(result));
  }
  if (pullRequest && options.dryRun && !options.json) {
    console.log(`Review generated for pull request #${pullRequest.number}.`);
    console.log("Dry run: no PR comments posted.");
  }
  if (pullRequest && !options.dryRun) {
    const explicitPosting =
      options.reviewPostSummary || options.reviewInlineComments;
    const posted = await postPullRequestReview(repoRoot, result, {
      prNumber: pullRequest.number,
      postSummary: explicitPosting ? options.reviewPostSummary : true,
      postInline: explicitPosting ? options.reviewInlineComments : true,
      inlineCap: options.reviewInlineCap ?? 5,
      applyTriageLabel: options.reviewApplyTriageLabel,
      createTriageLabels: options.reviewCreateTriageLabels,
      pullRequestState: pullRequest,
    });
    if (!options.json) {
      console.log(`Review generated for pull request #${pullRequest.number}.`);
      console.log(formatPullRequestPostStatus(posted));
    }
  }
}

type PullRequestReviewPostResult = {
  summaryComment: boolean;
  inlineComments: number;
  triageLabel: string | null;
  triageLabelsCreated: number;
};

const reviewTriageLabelDefinitions: Record<
  ReviewContributionTriageCategory,
  { name: string; color: string; description: string }
> = {
  ready_for_review: {
    name: "open-maintainer/ready-for-review",
    color: "2da44e",
    description: "Open Maintainer: PR appears ready for human review.",
  },
  needs_author_input: {
    name: "open-maintainer/needs-author-input",
    color: "d29922",
    description: "Open Maintainer: PR needs author information before review.",
  },
  needs_maintainer_design: {
    name: "open-maintainer/needs-maintainer-design",
    color: "8250df",
    description: "Open Maintainer: PR needs maintainer design judgment.",
  },
  not_agent_ready: {
    name: "open-maintainer/not-agent-ready",
    color: "bf8700",
    description: "Open Maintainer: PR is not ready for agent-assisted review.",
  },
  possible_spam: {
    name: "open-maintainer/possible-spam",
    color: "cf222e",
    description: "Open Maintainer: PR may be spam-like contribution noise.",
  },
};

const reviewTriageLabelNames = new Set(
  Object.values(reviewTriageLabelDefinitions).map((label) => label.name),
);

type PreparedPullRequestReview = {
  number: number;
  owner: string;
  repo: string;
  title: string | null;
  body: string;
  url: string | null;
  author: string | null;
  isDraft: boolean | null;
  mergeable: string | null;
  mergeStateStatus: string | null;
  reviewDecision: string | null;
  baseRef: string;
  headRef: string;
  baseSha: string;
  headSha: string;
  checkStatuses: ReviewCheckStatus[];
  existingComments: ReviewExistingComment[];
};

type GhPullRequestView = {
  number?: number;
  title?: string | null;
  body?: string | null;
  url?: string | null;
  author?: { login?: string | null } | null;
  isDraft?: boolean | null;
  mergeable?: string | null;
  mergeStateStatus?: string | null;
  reviewDecision?: string | null;
  baseRefName?: string | null;
  headRefName?: string | null;
  baseRefOid?: string | null;
  headRefOid?: string | null;
  comments?: Array<{
    id?: number | string | null;
    body?: string | null;
  }> | null;
  statusCheckRollup?: Array<{
    name?: string | null;
    status?: string | null;
    conclusion?: string | null;
    detailsUrl?: string | null;
    url?: string | null;
  }> | null;
};

type GhRepositoryView = {
  name?: string | null;
  owner?: { login?: string | null } | null;
};

async function preparePullRequestReview(
  repoRoot: string,
  prNumber: number,
): Promise<PreparedPullRequestReview> {
  const [repo, pr] = await Promise.all([
    ghJson<GhRepositoryView>(repoRoot, [
      "repo",
      "view",
      "--json",
      "owner,name",
    ]),
    ghJson<GhPullRequestView>(repoRoot, [
      "pr",
      "view",
      String(prNumber),
      "--json",
      [
        "number",
        "title",
        "body",
        "url",
        "author",
        "isDraft",
        "mergeable",
        "mergeStateStatus",
        "reviewDecision",
        "baseRefName",
        "headRefName",
        "baseRefOid",
        "headRefOid",
        "comments",
        "statusCheckRollup",
      ].join(","),
    ]),
  ]);
  const owner = repo.owner?.login;
  const repoName = repo.name;
  const baseSha = pr.baseRefOid;
  const headSha = pr.headRefOid;
  if (!owner || !repoName || !baseSha || !headSha) {
    throw new Error(
      `Unable to read pull request #${prNumber} metadata from gh.`,
    );
  }
  const headRef = `refs/remotes/open-maintainer/pr-${prNumber}`;
  await ensureGitObject(repoRoot, baseSha);
  await gitRequiredOutput(repoRoot, [
    "fetch",
    "--force",
    "--no-tags",
    "origin",
    `refs/pull/${prNumber}/head:${headRef}`,
  ]);

  return {
    number: pr.number ?? prNumber,
    owner,
    repo: repoName,
    title: pr.title ?? null,
    body: pr.body ?? "",
    url: pr.url ?? null,
    author: pr.author?.login ?? null,
    isDraft: pr.isDraft ?? null,
    mergeable: pr.mergeable ?? null,
    mergeStateStatus: pr.mergeStateStatus ?? null,
    reviewDecision: pr.reviewDecision ?? null,
    baseRef: baseSha,
    headRef,
    baseSha,
    headSha,
    checkStatuses: parseGhCheckStatuses(pr.statusCheckRollup ?? []),
    existingComments: parseGhExistingComments(pr.comments ?? []),
  };
}

async function postPullRequestReview(
  repoRoot: string,
  review: ReviewResult,
  options: {
    prNumber: number;
    postSummary: boolean;
    postInline: boolean;
    inlineCap: number;
    applyTriageLabel: boolean;
    createTriageLabels: boolean;
    pullRequestState: PreparedPullRequestReview;
  },
): Promise<PullRequestReviewPostResult> {
  const repo = await ghJson<GhRepositoryView>(repoRoot, [
    "repo",
    "view",
    "--json",
    "owner,name",
  ]);
  const owner = repo.owner?.login;
  const repoName = repo.name;
  if (!owner || !repoName) {
    throw new Error("Unable to read repository owner/name from gh.");
  }
  const posted: PullRequestReviewPostResult = {
    summaryComment: false,
    inlineComments: 0,
    triageLabel: null,
    triageLabelsCreated: 0,
  };
  if (options.applyTriageLabel) {
    assertReadyTriageLabelAllowed(review, options.pullRequestState);
    const applied = await applyReviewTriageLabel(
      repoRoot,
      owner,
      repoName,
      review,
      {
        createMissingLabels: options.createTriageLabels,
      },
    );
    posted.triageLabel = applied.label;
    posted.triageLabelsCreated = applied.created;
  }
  if (options.postSummary) {
    await upsertReviewSummaryComment(repoRoot, owner, repoName, review);
    posted.summaryComment = true;
  }
  if (options.postInline && options.inlineCap > 0) {
    posted.inlineComments = await createInlineReviewComments(
      repoRoot,
      owner,
      repoName,
      review,
      {
        prNumber: options.prNumber,
        cap: options.inlineCap,
      },
    );
  }
  return posted;
}

function assertReadyTriageLabelAllowed(
  review: ReviewResult,
  pullRequest: PreparedPullRequestReview,
): void {
  if (review.contributionTriage.category !== "ready_for_review") {
    return;
  }
  const blockers = blockingPullRequestStateReasons(pullRequest);
  if (blockers.length === 0) {
    return;
  }
  throw new Error(
    `Refusing to apply open-maintainer/ready-for-review because GitHub reports this PR is blocked: ${blockers.join("; ")}.`,
  );
}

function blockingPullRequestStateReasons(
  pullRequest: PreparedPullRequestReview,
): string[] {
  const reasons = [];
  if (pullRequest.isDraft === true) {
    reasons.push("PR is draft");
  }
  if (normalizeGhState(pullRequest.mergeable) === "CONFLICTING") {
    reasons.push("PR has merge conflicts");
  }
  if (normalizeGhState(pullRequest.mergeStateStatus) === "DIRTY") {
    reasons.push("merge state is dirty");
  }
  if (normalizeGhState(pullRequest.reviewDecision) === "CHANGES_REQUESTED") {
    reasons.push("changes are requested");
  }
  const blockingChecks = pullRequest.checkStatuses.filter((check) =>
    isBlockingCheckStatus(check),
  );
  if (blockingChecks.length > 0) {
    reasons.push(
      `blocking checks: ${blockingChecks.map((check) => check.name).join(", ")}`,
    );
  }
  return reasons;
}

function isBlockingCheckStatus(check: ReviewCheckStatus): boolean {
  const status = normalizeGhState(check.status);
  const conclusion = normalizeGhState(check.conclusion);
  if (status && status !== "COMPLETED") {
    return true;
  }
  return (
    conclusion === "FAILURE" ||
    conclusion === "TIMED_OUT" ||
    conclusion === "CANCELLED" ||
    conclusion === "ACTION_REQUIRED"
  );
}

function normalizeGhState(value: string | null | undefined): string | null {
  return value ? value.trim().toUpperCase() : null;
}

async function applyReviewTriageLabel(
  repoRoot: string,
  owner: string,
  repo: string,
  review: ReviewResult,
  options: { createMissingLabels: boolean },
): Promise<{ label: string; created: number }> {
  const category = review.contributionTriage.category;
  if (review.contributionTriage.status !== "evaluated" || !category) {
    throw new Error(
      "--review-apply-triage-label requires an evaluated contribution-triage category.",
    );
  }
  const target = reviewTriageLabelDefinitions[category].name;
  const created = options.createMissingLabels
    ? await createMissingReviewTriageLabels(repoRoot, owner, repo)
    : 0;
  const existingLabels = await ghApiJson<Array<{ name?: string | null }>>(
    repoRoot,
    `repos/${owner}/${repo}/issues/${review.prNumber}/labels?per_page=100`,
  );
  const existingNames = new Set(
    existingLabels.flatMap((label) => (label.name ? [label.name] : [])),
  );
  for (const existingName of existingNames) {
    if (reviewTriageLabelNames.has(existingName) && existingName !== target) {
      await ghApiWithMethod(
        repoRoot,
        `repos/${owner}/${repo}/issues/${review.prNumber}/labels/${encodeURIComponent(existingName)}`,
        "DELETE",
      );
    }
  }
  if (!existingNames.has(target)) {
    await ghApiWithJsonBody(
      repoRoot,
      `repos/${owner}/${repo}/issues/${review.prNumber}/labels`,
      "POST",
      { labels: [target] },
    );
  }
  return { label: target, created };
}

async function createMissingReviewTriageLabels(
  repoRoot: string,
  owner: string,
  repo: string,
): Promise<number> {
  const repoLabels = await ghApiJson<Array<{ name?: string | null }>>(
    repoRoot,
    `repos/${owner}/${repo}/labels?per_page=100`,
  );
  const existingNames = new Set(
    repoLabels.flatMap((label) => (label.name ? [label.name] : [])),
  );
  let created = 0;
  for (const label of Object.values(reviewTriageLabelDefinitions)) {
    if (existingNames.has(label.name)) {
      continue;
    }
    await ghApiWithJsonBody(repoRoot, `repos/${owner}/${repo}/labels`, "POST", {
      name: label.name,
      color: label.color,
      description: label.description,
    });
    created += 1;
  }
  return created;
}

async function upsertReviewSummaryComment(
  repoRoot: string,
  owner: string,
  repo: string,
  review: ReviewResult,
): Promise<void> {
  const marker = "<!-- open-maintainer-review-summary -->";
  const body = renderReviewSummaryComment(review);
  const comments = await ghApiJson<
    Array<{ id?: number | string | null; body?: string | null }>
  >(
    repoRoot,
    `repos/${owner}/${repo}/issues/${review.prNumber}/comments?per_page=100`,
  );
  const existing = comments.find((comment) => comment.body?.includes(marker));
  if (existing?.id) {
    await ghApiWithJsonBody(
      repoRoot,
      `repos/${owner}/${repo}/issues/comments/${existing.id}`,
      "PATCH",
      { body },
    );
    return;
  }
  await ghApiWithJsonBody(
    repoRoot,
    `repos/${owner}/${repo}/issues/${review.prNumber}/comments`,
    "POST",
    { body },
  );
}

async function createInlineReviewComments(
  repoRoot: string,
  owner: string,
  repo: string,
  review: ReviewResult,
  options: { prNumber: number; cap: number },
): Promise<number> {
  const marker = "open-maintainer-review-inline";
  const existing = await ghApiJson<
    Array<{
      body?: string | null;
      path?: string | null;
      line?: number | null;
    }>
  >(
    repoRoot,
    `repos/${owner}/${repo}/pulls/${options.prNumber}/comments?per_page=100`,
  );
  const existingFingerprints = new Set(
    existing.flatMap((comment) => {
      const match = comment.body?.match(
        /open-maintainer-review-inline fingerprint="([^"]+)"/,
      );
      if (match?.[1]) {
        return [match[1]];
      }
      return comment.path && comment.line
        ? [`legacy:${comment.path}:${comment.line}`]
        : [];
    }),
  );
  const changedFiles = new Map(
    review.changedFiles.map((file) => [file.path, file]),
  );
  const comments = [];
  for (const finding of [...review.findings].sort(compareReviewFindings)) {
    if (comments.length >= options.cap) {
      break;
    }
    if (!finding.path || !finding.line) {
      continue;
    }
    const changedFile = changedFiles.get(finding.path);
    if (!changedFile?.patch) {
      continue;
    }
    const fingerprint = `${finding.id}:${finding.path}:${finding.line}`;
    if (
      existingFingerprints.has(fingerprint) ||
      existingFingerprints.has(`legacy:${finding.path}:${finding.line}`)
    ) {
      continue;
    }
    comments.push({
      path: finding.path,
      line: finding.line,
      side: "RIGHT",
      body: [
        `<!-- ${marker} fingerprint="${fingerprint}" -->`,
        renderInlineReviewComment(finding),
      ].join("\n"),
    });
  }
  if (comments.length === 0) {
    return 0;
  }
  await ghApiWithJsonBody(
    repoRoot,
    `repos/${owner}/${repo}/pulls/${options.prNumber}/reviews`,
    "POST",
    {
      event: "COMMENT",
      body: "Open Maintainer inline review comments.",
      comments,
    },
  );
  return comments.length;
}

function formatPullRequestPostStatus(
  posted: PullRequestReviewPostResult,
): string {
  const parts = [];
  if (posted.summaryComment) {
    parts.push("summary comment");
  }
  if (posted.inlineComments > 0) {
    parts.push(
      `${posted.inlineComments} inline ${posted.inlineComments === 1 ? "comment" : "comments"}`,
    );
  }
  if (posted.triageLabel) {
    parts.push(`triage label ${posted.triageLabel}`);
  }
  if (parts.length === 0) {
    return "PR comments posted: none.";
  }
  const labelNote =
    posted.triageLabelsCreated > 0
      ? ` Created ${posted.triageLabelsCreated} triage labels.`
      : "";
  return `PR comments posted: ${parts.join(", ")}.${labelNote}`;
}

async function ghJson<T>(repoRoot: string, args: string[]): Promise<T> {
  const output = await execGh(repoRoot, args);
  return JSON.parse(output) as T;
}

async function ghApiJson<T>(
  repoRoot: string,
  endpoint: string,
  args: string[] = [],
): Promise<T> {
  const output = await execGh(repoRoot, ["api", endpoint, ...args]);
  return JSON.parse(output || "null") as T;
}

async function ghApiWithJsonBody(
  repoRoot: string,
  endpoint: string,
  method: "PATCH" | "POST",
  body: unknown,
): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), "open-maintainer-gh-"));
  const inputPath = path.join(directory, "body.json");
  try {
    await writeFile(inputPath, JSON.stringify(body));
    await execGh(repoRoot, [
      "api",
      endpoint,
      "--method",
      method,
      "--input",
      inputPath,
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function ghApiWithMethod(
  repoRoot: string,
  endpoint: string,
  method: "DELETE",
): Promise<void> {
  await execGh(repoRoot, ["api", endpoint, "--method", method]);
}

async function execGh(repoRoot: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("gh", args, {
      cwd: repoRoot,
      maxBuffer: 8 * 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `GitHub CLI command failed: gh ${args.join(" ")}. ${message}`,
    );
  }
}

async function ensureGitObject(repoRoot: string, sha: string): Promise<void> {
  const exists = await gitRequiredOutput(repoRoot, [
    "cat-file",
    "-e",
    `${sha}^{commit}`,
  ])
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    await gitRequiredOutput(repoRoot, ["fetch", "--no-tags", "origin", sha]);
  }
}

async function gitRequiredOutput(
  repoRoot: string,
  args: string[],
): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoRoot,
    maxBuffer: 8 * 1024 * 1024,
  });
  return stdout;
}

function parseGhCheckStatuses(
  statuses: NonNullable<GhPullRequestView["statusCheckRollup"]>,
): ReviewCheckStatus[] {
  return statuses.flatMap((status) => {
    const name = status.name?.trim();
    const state = status.status?.trim();
    if (!name || !state) {
      return [];
    }
    return [
      {
        name,
        status: state,
        conclusion: status.conclusion ?? null,
        url: status.detailsUrl ?? status.url ?? null,
      },
    ];
  });
}

function parseGhExistingComments(
  comments: NonNullable<GhPullRequestView["comments"]>,
): ReviewExistingComment[] {
  return comments.flatMap((comment) => {
    const id =
      typeof comment.id === "number"
        ? comment.id
        : Number.parseInt(String(comment.id ?? ""), 10);
    if (!Number.isInteger(id) || id <= 0 || !comment.body) {
      return [];
    }
    return [
      {
        id,
        kind: comment.body.includes("open-maintainer-review-summary")
          ? ("summary" as const)
          : ("inline" as const),
        body: comment.body,
        path: null,
        line: null,
      },
    ];
  });
}

function compareReviewFindings(
  left: ReviewResult["findings"][number],
  right: ReviewResult["findings"][number],
) {
  const severityRank = { blocker: 0, major: 1, minor: 2, note: 3 };
  const severityDelta =
    severityRank[left.severity] - severityRank[right.severity];
  return severityDelta === 0 ? left.id.localeCompare(right.id) : severityDelta;
}

function buildReviewProvider(input: {
  repoRoot: string;
  provider: ArtifactModel | null;
  model: string | null;
  allowModelContentTransfer: boolean;
}) {
  if (!input.provider) {
    throw new Error(
      "review requires --model codex or --model claude because PR reviews are LLM-backed only.",
    );
  }
  if (!input.allowModelContentTransfer) {
    throw new Error(
      "--model requires --allow-model-content-transfer because PR review sends repository content to the selected CLI backend.",
    );
  }
  const createdAt = new Date(0).toISOString();
  const codexModel =
    input.model ??
    process.env.OPEN_MAINTAINER_CODEX_MODEL ??
    DEFAULT_CODEX_CLI_MODEL;
  const providerConfig: ModelProviderConfig =
    input.provider === "codex"
      ? {
          id: "model_provider_cli_review_codex",
          kind: "codex-cli",
          displayName: "Codex CLI",
          baseUrl: "http://localhost",
          model: codexModel,
          encryptedApiKey: "local-cli",
          repoContentConsent: true,
          createdAt,
          updatedAt: createdAt,
        }
      : {
          id: "model_provider_cli_review_claude",
          kind: "claude-cli",
          displayName: "Claude CLI",
          baseUrl: "http://localhost",
          model: input.model ?? "claude-cli",
          encryptedApiKey: "local-cli",
          repoContentConsent: true,
          createdAt,
          updatedAt: createdAt,
        };
  const provider =
    input.provider === "codex"
      ? buildCodexCliProvider({
          cwd: input.repoRoot,
          model: codexModel,
        })
      : buildClaudeCliProvider({
          cwd: input.repoRoot,
          ...(input.model ? { model: input.model } : {}),
        });
  return { providerConfig, provider };
}

function resolveReviewProvider(options: CliOptions): ArtifactModel | null {
  if (
    options.model &&
    options.reviewProvider &&
    options.model !== options.reviewProvider
  ) {
    throw new Error(
      "--model and --review-provider disagree. Use one review provider flag.",
    );
  }
  return options.model ?? options.reviewProvider;
}

function resolveReviewModel(options: CliOptions): string | null {
  if (
    options.llmModel &&
    options.reviewModel &&
    options.llmModel !== options.reviewModel
  ) {
    throw new Error(
      "--llm-model and --review-model disagree. Use one model override flag.",
    );
  }
  return options.llmModel ?? options.reviewModel;
}

async function readOptionalRepoFile(
  repoRoot: string,
  repoPath: string,
): Promise<string | undefined> {
  return readFile(path.join(repoRoot, repoPath), "utf8").catch(() => undefined);
}

async function createProfile(repoRoot: string) {
  const files = await scanRepository(repoRoot, { maxFiles: 800 });
  return createProfileFromFiles(repoRoot, files);
}

async function createProfileFromFiles(
  repoRoot: string,
  files: Awaited<ReturnType<typeof scanRepository>>,
) {
  const identity = await resolveRepoIdentity(repoRoot);
  return analyzeRepo({
    repoId: "local",
    owner: identity.owner,
    name: identity.name,
    defaultBranch: identity.defaultBranch,
    version: 1,
    files,
  });
}

async function resolveRepoIdentity(repoRoot: string): Promise<{
  owner: string;
  name: string;
  defaultBranch: string;
}> {
  const fallback = {
    owner: path.basename(path.dirname(repoRoot)) || "local",
    name: path.basename(repoRoot),
    defaultBranch: "main",
  };
  const [remoteUrl, defaultBranch] = await Promise.all([
    gitOutput(repoRoot, ["remote", "get-url", "origin"]),
    detectDefaultBranch(repoRoot),
  ]);
  const remoteIdentity = remoteUrl ? parseGitHubRemote(remoteUrl) : null;
  return {
    owner: remoteIdentity?.owner ?? fallback.owner,
    name: remoteIdentity?.name ?? fallback.name,
    defaultBranch: defaultBranch ?? fallback.defaultBranch,
  };
}

async function detectDefaultBranch(repoRoot: string): Promise<string | null> {
  const symbolicRef = await gitOutput(repoRoot, [
    "symbolic-ref",
    "--short",
    "refs/remotes/origin/HEAD",
  ]);
  if (symbolicRef?.startsWith("origin/")) {
    return symbolicRef.slice("origin/".length);
  }
  return null;
}

async function gitOutput(
  repoRoot: string,
  args: string[],
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoRoot, ...args]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function parseGitHubRemote(
  remoteUrl: string,
): { owner: string; name: string } | null {
  const normalized = remoteUrl.trim().replace(/\.git$/, "");
  const sshMatch = /^git@[^:]+:([^/]+)\/(.+)$/.exec(normalized);
  if (sshMatch?.[1] && sshMatch[2]) {
    return { owner: sshMatch[1], name: sshMatch[2] };
  }
  try {
    const url = new URL(normalized);
    const [owner, name] = url.pathname.replace(/^\/+/, "").split("/");
    return owner && name ? { owner, name } : null;
  } catch {
    return null;
  }
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
  console.log(`${input.label}: generating workflow skills`);
  const completion = await input.complete(input.prompt);
  return parseModelSkillContent(completion.text);
}

function parseOptions(rawOptions: string[]): CliOptions {
  const options: CliOptions = {
    force: false,
    refreshGenerated: false,
    doctorFix: false,
    dryRun: false,
    createPr: false,
    failOnScoreBelow: null,
    reportPath: null,
    noProfileWrite: false,
    model: null,
    context: null,
    skills: null,
    allowWrite: false,
    llmModel: null,
    pr: null,
    baseRef: null,
    headRef: null,
    prNumber: null,
    outputPath: null,
    json: false,
    reviewProvider: null,
    reviewModel: null,
    allowModelContentTransfer: false,
    reviewPostSummary: false,
    reviewInlineComments: false,
    reviewInlineCap: null,
    reviewApplyTriageLabel: false,
    reviewCreateTriageLabels: false,
    issueNumber: null,
    triageState: "open",
    triageLimit: null,
    triageLabel: null,
    issueApplyLabels: false,
    issueCreateLabels: false,
    issuePostComment: false,
  };
  for (let index = 0; index < rawOptions.length; index += 1) {
    const option = rawOptions[index];
    if (option === "--force") {
      options.force = true;
    } else if (option === "--fix") {
      options.doctorFix = true;
    } else if (option === "--refresh-generated") {
      options.refreshGenerated = true;
    } else if (option === "--dry-run") {
      options.dryRun = true;
    } else if (option === "--create") {
      options.createPr = true;
    } else if (option === "--fail-on-score-below") {
      const value = requireOptionValue(rawOptions, index, option);
      const threshold = Number(value);
      if (!Number.isFinite(threshold)) {
        throw new Error(
          "Invalid value for --fail-on-score-below. Expected a number.",
        );
      }
      options.failOnScoreBelow = threshold;
      index += 1;
    } else if (option === "--report-path") {
      options.reportPath = requireOptionValue(rawOptions, index, option);
      index += 1;
    } else if (option === "--no-profile-write") {
      options.noProfileWrite = true;
    } else if (option === "--model") {
      options.model = parseArtifactModel(
        requireOptionValue(rawOptions, index, option),
      );
      index += 1;
    } else if (option === "--context") {
      options.context = parseArtifactSelection(
        requireOptionValue(rawOptions, index, option),
        "--context",
      );
      index += 1;
    } else if (option === "--skills") {
      options.skills = parseArtifactSelection(
        requireOptionValue(rawOptions, index, option),
        "--skills",
      );
      index += 1;
    } else if (option === "--llm-model") {
      options.llmModel = requireOptionValue(rawOptions, index, option);
      index += 1;
    } else if (option === "--allow-write") {
      options.allowWrite = true;
    } else if (option === "--pr") {
      const value = requireOptionValue(rawOptions, index, option);
      const pr = Number(value);
      if (!Number.isInteger(pr) || pr <= 0) {
        throw new Error("Invalid value for --pr. Expected a positive integer.");
      }
      options.pr = pr;
      index += 1;
    } else if (option === "--base-ref") {
      options.baseRef = requireOptionValue(rawOptions, index, option);
      index += 1;
    } else if (option === "--head-ref") {
      options.headRef = requireOptionValue(rawOptions, index, option);
      index += 1;
    } else if (option === "--pr-number") {
      const value = requireOptionValue(rawOptions, index, option);
      const prNumber = Number(value);
      if (!Number.isInteger(prNumber) || prNumber <= 0) {
        throw new Error(
          "Invalid value for --pr-number. Expected a positive integer.",
        );
      }
      options.prNumber = prNumber;
      index += 1;
    } else if (option === "--number") {
      const value = requireOptionValue(rawOptions, index, option);
      const issueNumber = Number(value);
      if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
        throw new Error(
          "Invalid value for --number. Expected a positive integer.",
        );
      }
      options.issueNumber = issueNumber;
      index += 1;
    } else if (option === "--state") {
      const value = requireOptionValue(rawOptions, index, option);
      if (value !== "open" && value !== "closed" && value !== "all") {
        throw new Error(
          "Invalid value for --state. Expected open, closed, or all.",
        );
      }
      options.triageState = value;
      index += 1;
    } else if (option === "--limit") {
      const value = requireOptionValue(rawOptions, index, option);
      const limit = Number(value);
      if (!Number.isInteger(limit) || limit <= 0 || limit > 50) {
        throw new Error(
          "Invalid value for --limit. Expected a positive integer up to 50.",
        );
      }
      options.triageLimit = limit;
      index += 1;
    } else if (option === "--label") {
      options.triageLabel = requireOptionValue(rawOptions, index, option);
      index += 1;
    } else if (option === "--apply-labels") {
      options.issueApplyLabels = true;
    } else if (option === "--create-labels") {
      options.issueCreateLabels = true;
    } else if (option === "--post-comment") {
      options.issuePostComment = true;
    } else if (option === "--output-path") {
      options.outputPath = requireOptionValue(rawOptions, index, option);
      index += 1;
    } else if (option === "--json") {
      options.json = true;
    } else if (option === "--review-provider") {
      options.reviewProvider = parseArtifactModel(
        requireOptionValue(rawOptions, index, option),
      );
      index += 1;
    } else if (option === "--review-model") {
      options.reviewModel = requireOptionValue(rawOptions, index, option);
      index += 1;
    } else if (option === "--allow-model-content-transfer") {
      options.allowModelContentTransfer = true;
    } else if (option === "--review-post-summary") {
      options.reviewPostSummary = true;
    } else if (option === "--review-inline-comments") {
      options.reviewInlineComments = true;
    } else if (option === "--review-inline-cap") {
      const value = requireOptionValue(rawOptions, index, option);
      const cap = Number(value);
      if (!Number.isInteger(cap) || cap < 0) {
        throw new Error(
          "Invalid value for --review-inline-cap. Expected a non-negative integer.",
        );
      }
      options.reviewInlineCap = cap;
      index += 1;
    } else if (option === "--review-apply-triage-label") {
      options.reviewApplyTriageLabel = true;
    } else if (option === "--review-create-triage-labels") {
      options.reviewCreateTriageLabels = true;
    } else {
      throw new Error(`Unknown option: ${option}`);
    }
  }
  return options;
}

function requireOptionValue(
  rawOptions: string[],
  index: number,
  flag: string,
): string {
  const value = rawOptions[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
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
    value === "review" ||
    value === "triage" ||
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

function formatReadinessSuggestions(
  profile: ReturnType<typeof analyzeRepo>,
): string[] {
  const suggestions = readinessSuggestions(profile);
  if (suggestions.length === 0) {
    return [];
  }
  return ["Next steps:", ...suggestions.map((suggestion) => `- ${suggestion}`)];
}

function readinessSuggestions(
  profile: ReturnType<typeof analyzeRepo>,
): string[] {
  const suggestions = new Map<string, string>();
  for (const category of profile.agentReadiness.categories) {
    for (const missing of category.missing) {
      const suggestion = suggestionForMissingItem(
        category.name,
        missing,
        profile,
      );
      suggestions.set(suggestion, suggestion);
    }
  }
  return [...suggestions.values()];
}

function suggestionForMissingItem(
  categoryName: string,
  missing: string,
  profile: ReturnType<typeof analyzeRepo>,
): string {
  switch (missing) {
    case "README is missing.":
      return "Add `README.md` with setup steps, core commands, architecture notes, and validation expectations.";
    case "No runnable scripts or Make targets detected.":
      return "Add runnable scripts in `package.json` or Make targets for common workflows such as test, build, lint, and typecheck.";
    case "No lockfile or dependency lock evidence detected.":
      return "Commit a dependency lockfile such as `bun.lock`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `uv.lock`, `Cargo.lock`, `Scarb.lock`, or `go.sum`.";
    case "Environment variables are referenced without example or setup documentation.":
      return "Add `.env.example` or setup documentation covering the detected environment variables.";
    case "No major source directories detected.":
      return "Organize code under detectable source directories such as `src/`, `apps/`, `packages/`, `contracts/`, or `cmd/`.";
    case "No workspace or package boundary evidence detected.":
      return "Document package boundaries or add workspace metadata when the repository has multiple app or package areas.";
    case "No docs directory detected.":
      return "Add a `docs/` directory with architecture, operations, or runbook notes.";
    case "No toolchain config files detected.":
      return "Add toolchain config such as `tsconfig.json`, `biome.json`, `pyproject.toml`, `go.mod`, `Scarb.toml`, or `docker-compose.yml`.";
    case "No test command detected.":
      return "Add a `test` script in `package.json`, a `test` Make target, or an equivalent workspace test command.";
    case "No test files detected.":
      return "Add deterministic tests under `tests/`, `test/`, `__tests__/`, or `*.test.*` files.";
    case "No lint/check command detected.":
      return "Add a `lint` or `check` script in `package.json`, a Make target, or an equivalent quality command.";
    case "No GitHub Actions workflow detected.":
      return "Add `.github/workflows/ci.yml` running the repository's install and validation commands.";
    case "No review or quality gate rules inferred.":
      return "Add documented review or quality-gate rules through scripts, Make targets, CONTRIBUTING.md, or repo-local context.";
    case "Risk-sensitive paths are present without repo-local guidance.":
      return "Document review expectations for auth, security, secret, payment, or billing paths.";
    case "No ownership or maintainer guidance detected.":
      return "Add CODEOWNERS, OWNERS, MAINTAINERS, or maintainer guidance in README, CONTRIBUTING, or docs.";
    case "No ignore file detected.":
      return "Add `.gitignore` or `.dockerignore` entries for generated outputs, dependency directories, and build artifacts.";
    case "Generated files are present without documented handling.":
      return "Document generated-file handling in README, CONTRIBUTING, AGENTS.md, or `.open-maintainer.yml`.";
    case "AGENTS.md or CLAUDE.md is missing.":
      return "Add `AGENTS.md` or `CLAUDE.md` with repo-specific agent instructions.";
    case "Repo-local skills are missing.":
      return `Add repo-local skills such as ${joinInlineList(defaultSkillPaths(profile))}.`;
    case ".open-maintainer.yml policy file is missing.":
      return "Add `.open-maintainer.yml` with repository policy and generated-context metadata.";
    case "CONTRIBUTING.md is missing.":
      return "Add `CONTRIBUTING.md` with PR workflow, review rules, and validation commands.";
    default:
      return `Address ${categoryName}: ${missing}`;
  }
}

function defaultSkillPaths(profile: ReturnType<typeof analyzeRepo>): string[] {
  const repoSlug = slugify(profile.name);
  const hints = profile.generatedFileHints
    .filter((hint) => hint.startsWith(".agents/skills/"))
    .map((hint) => hint.replace("<repo>", repoSlug));
  return hints.length > 0
    ? hints
    : [
        `.agents/skills/${repoSlug}-start-task/SKILL.md`,
        `.agents/skills/${repoSlug}-testing-workflow/SKILL.md`,
        `.agents/skills/${repoSlug}-pr-review/SKILL.md`,
      ];
}

function joinInlineList(items: string[]): string {
  const formatted = items.map((item) => `\`${item}\``);
  if (formatted.length <= 1) {
    return formatted[0] ?? "";
  }
  return `${formatted.slice(0, -1).join(", ")}, and ${formatted.at(-1)}`;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "repo";
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
