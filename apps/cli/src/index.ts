#!/usr/bin/env bun
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  DEFAULT_CODEX_CLI_MODEL,
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
  assembleLocalReviewInput,
  generateReview,
  renderInlineReviewComment,
  renderReviewMarkdown,
  renderReviewSummaryComment,
} from "@open-maintainer/review";
import type {
  ModelProviderConfig,
  ReviewCheckStatus,
  ReviewExistingComment,
  ReviewResult,
} from "@open-maintainer/shared";

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
  --review-provider codex|claude        Required CLI backend for model-backed review
  --review-model <model>                Optional backend model override
  --allow-model-content-transfer        Required with --review-provider; sends repo content to the backend

Posting options:
  --review-post-summary                 Post or update the marked PR summary comment
  --review-inline-comments              Post capped inline finding comments
  --review-inline-cap <number>          Maximum inline comments (default with --pr: 5)

Examples:
  open-maintainer review . --base-ref main --head-ref HEAD
  open-maintainer review . --base-ref origin/main --head-ref HEAD --output-path .open-maintainer/review.md
  open-maintainer review . --base-ref main --head-ref HEAD --json
  open-maintainer review . --base-ref main --head-ref HEAD --review-provider codex --allow-model-content-transfer
  open-maintainer review . --pr 123 --review-provider codex --allow-model-content-transfer
  open-maintainer review . --pr 123 --review-provider claude --allow-model-content-transfer --dry-run
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

async function review(repoRoot: string, options: CliOptions): Promise<void> {
  if (
    (options.reviewPostSummary || options.reviewInlineComments) &&
    options.pr === null
  ) {
    throw new Error(
      "Review posting requires --pr <number> so the CLI can target a GitHub pull request with gh.",
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
          baseSha: pullRequest.baseSha,
          headSha: pullRequest.headSha,
          checkStatuses: pullRequest.checkStatuses,
          existingComments: pullRequest.existingComments,
        }
      : {
          prNumber: options.prNumber,
          owner: profile.owner,
          repo: profile.name,
        }),
  };
  const providerReview = buildReviewProvider({
    repoRoot,
    provider: options.reviewProvider,
    model: options.reviewModel,
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
};

type PreparedPullRequestReview = {
  number: number;
  owner: string;
  repo: string;
  title: string | null;
  body: string;
  url: string | null;
  author: string | null;
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
  };
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
  if (parts.length === 0) {
    return "PR comments posted: none.";
  }
  return `PR comments posted: ${parts.join(", ")}.`;
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
      "review requires --review-provider codex or --review-provider claude because PR reviews are LLM-backed only.",
    );
  }
  if (!input.allowModelContentTransfer) {
    throw new Error(
      "--review-provider requires --allow-model-content-transfer because PR review sends repository content to the selected CLI backend.",
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
