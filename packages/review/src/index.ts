import type {
  RepoProfile,
  ReviewEvidenceCitation,
  ReviewFinding,
  ReviewInput,
  ReviewResult,
  ReviewSeverity,
  ReviewValidationExpectation,
} from "@open-maintainer/shared";
import { ReviewResultSchema, newId, nowIso } from "@open-maintainer/shared";
export { assembleLocalReviewInput } from "./local-git";
export type { LocalReviewInputOptions } from "./local-git";

const severityOrder: ReviewSeverity[] = ["blocker", "major", "minor", "note"];

export type DeterministicReviewOptions = {
  repoId?: string;
  profile: RepoProfile;
  input: ReviewInput;
  rules?: string[];
};

export function generateDeterministicReview(
  options: DeterministicReviewOptions,
): ReviewResult {
  const changedSurface = classifyChangedSurface(options.input, options.profile);
  const expectedValidation = inferExpectedValidation({
    profile: options.profile,
    changedSurface,
    input: options.input,
    rules: options.rules ?? [],
  });
  const validationEvidence = detectValidationEvidence(
    options.input,
    expectedValidation,
  );
  const docsImpact = inferDocsImpact(options.input, changedSurface);
  const findings = buildDeterministicFindings({
    profile: options.profile,
    input: options.input,
    changedSurface,
    expectedValidation,
    validationEvidence,
    docsImpact,
  });
  const riskAnalysis = buildRiskAnalysis(options.input, options.profile);
  const residualRisk = buildResidualRisk(options.input, findings);
  const mergeReadiness = findings.some(
    (finding) => finding.severity === "blocker",
  )
    ? {
        status: "blocked" as const,
        reason: "At least one blocker finding must be resolved before merge.",
        evidence:
          findings.find((finding) => finding.severity === "blocker")
            ?.citations ?? [],
      }
    : findings.some((finding) => finding.severity === "major")
      ? {
          status: "needs_attention" as const,
          reason:
            "Major findings or missing validation evidence need maintainer attention.",
          evidence:
            findings.find((finding) => finding.severity === "major")
              ?.citations ?? [],
        }
      : {
          status: "ready" as const,
          reason:
            "No blocker or major deterministic findings were produced from available evidence.",
          evidence: [],
        };

  return parseReviewResult({
    id: newId("review"),
    repoId: options.repoId ?? options.input.repoId,
    prNumber: options.input.prNumber,
    baseRef: options.input.baseRef,
    headRef: options.input.headRef,
    baseSha: options.input.baseSha,
    headSha: options.input.headSha,
    summary: `Deterministic review for ${options.profile.owner}/${options.profile.name} across ${changedSurface.length} changed surface${changedSurface.length === 1 ? "" : "s"}.`,
    walkthrough: options.input.changedFiles.map(
      (file) =>
        `${file.status} ${file.path} (+${file.additions}/-${file.deletions})`,
    ),
    changedSurface,
    riskAnalysis,
    expectedValidation,
    validationEvidence,
    docsImpact,
    findings,
    mergeReadiness,
    residualRisk,
    changedFiles: options.input.changedFiles,
    feedback: [],
    modelProvider: null,
    model: null,
    createdAt: nowIso(),
  });
}

export function parseReviewResult(input: unknown): ReviewResult {
  return ReviewResultSchema.parse(input);
}

export function classifyChangedSurface(
  input: ReviewInput,
  profile: RepoProfile,
): string[] {
  const surfaces = new Set<string>();
  for (const file of input.changedFiles) {
    const path = file.path;
    if (path.startsWith("apps/cli/")) {
      surfaces.add("cli");
    } else if (path.startsWith("apps/api/")) {
      surfaces.add("api");
    } else if (path.startsWith("apps/web/")) {
      surfaces.add("web");
    } else if (path.startsWith("apps/worker/")) {
      surfaces.add("worker");
    } else if (path.startsWith("packages/")) {
      const [, packageName = "unknown"] = path.split("/");
      surfaces.add(`package:${packageName}`);
    } else if (path === "action.yml" || path.startsWith(".github/workflows/")) {
      surfaces.add("github-action/workflow");
    } else if (path === "docker-compose.yml" || path === ".dockerignore") {
      surfaces.add("docker-compose");
    } else if (isGeneratedContextPath(path, profile)) {
      surfaces.add("generated-context");
    } else if (isDocsPath(path)) {
      surfaces.add("docs");
    } else if (path.startsWith("tests/")) {
      surfaces.add("fixtures/tests");
    } else if (isConfigOrLockPath(path, profile)) {
      surfaces.add("config/lockfile");
    }
    if (profile.riskHintPaths.some((riskPath) => path.startsWith(riskPath))) {
      surfaces.add("risk");
    }
  }
  return [...surfaces].sort();
}

export function inferExpectedValidation(input: {
  profile: RepoProfile;
  changedSurface: string[];
  input: ReviewInput;
  rules?: string[];
}): ReviewValidationExpectation[] {
  const commands = new Map<string, ReviewValidationExpectation>();
  const addCommand = (
    command: string,
    reason: string,
    evidence: ReviewEvidenceCitation,
  ) => {
    if (!commands.has(command)) {
      commands.set(command, { command, reason, evidence: [evidence] });
    }
  };
  const ruleCitation = {
    source: "open_maintainer_config" as const,
    path: ".open-maintainer.yml",
    excerpt: input.rules?.[0] ?? null,
    reason: "Repository validation rules define expected checks.",
  };

  for (const command of input.profile.commands) {
    if (shouldRunCommandForSurface(command.command, input.changedSurface)) {
      addCommand(
        command.command,
        `Changed surfaces ${input.changedSurface.join(", ")} match ${command.name} validation.`,
        {
          source: "repo_profile",
          path: command.source,
          excerpt: command.command,
          reason: "Repository profile detected this validation command.",
        },
      );
    }
  }

  if (
    input.input.changedFiles.some((file) =>
      /\.(ts|tsx|js|jsx)$/.test(file.path),
    )
  ) {
    for (const command of input.profile.commands.filter((item) =>
      /(tsc|typecheck)/i.test(`${item.name} ${item.command}`),
    )) {
      addCommand(command.command, "TypeScript or JavaScript files changed.", {
        source: "repo_profile",
        path: command.source,
        excerpt: command.command,
        reason: "Typecheck command was detected in the repo profile.",
      });
    }
  }

  if (input.rules && input.rules.length > 0) {
    for (const rule of input.rules) {
      const command = extractCommandFromRule(rule);
      if (command) {
        addCommand(command, "Repository rule names this validation command.", {
          ...ruleCitation,
          excerpt: rule,
        });
      }
    }
  }

  return [...commands.values()];
}

export function detectValidationEvidence(
  input: ReviewInput,
  expectedValidation: ReviewValidationExpectation[],
): string[] {
  const evidence = new Set<string>();
  const body = input.body.toLowerCase();
  for (const expected of expectedValidation) {
    const normalizedCommand = expected.command.toLowerCase();
    if (body.includes(normalizedCommand)) {
      evidence.add(`PR body mentions \`${expected.command}\`.`);
    }
    const commandWords = normalizedCommand.split(/\s+/).filter(Boolean);
    for (const check of input.checkStatuses) {
      const checkText =
        `${check.name} ${check.status} ${check.conclusion ?? ""}`.toLowerCase();
      if (
        commandWords.some(
          (word) => word.length > 2 && checkText.includes(word),
        ) ||
        (normalizedCommand.includes("tsc") && checkText.includes("typecheck"))
      ) {
        evidence.add(
          `Check \`${check.name}\` reported ${check.conclusion ?? check.status}.`,
        );
      }
    }
  }
  return [...evidence].sort();
}

function inferDocsImpact(input: ReviewInput, changedSurface: string[]) {
  const docsChanged = input.changedFiles.some((file) => isDocsPath(file.path));
  const impacts = new Map<string, ReviewResult["docsImpact"][number]>();
  const addImpact = (path: string, reason: string, required: boolean) => {
    if (!impacts.has(path)) {
      impacts.set(path, {
        path,
        reason,
        required,
        evidence: [
          {
            source: "changed_file",
            path: input.changedFiles[0]?.path ?? null,
            excerpt: null,
            reason: "Changed surface can affect user-facing documentation.",
          },
        ],
      });
    }
  };
  if (changedSurface.includes("cli")) {
    addImpact("README.md", "CLI behavior or help may have changed.", true);
    addImpact("docs/DEMO_RUNBOOK.md", "Demo commands may need review.", true);
  }
  if (changedSurface.includes("github-action/workflow")) {
    addImpact("README.md", "Action behavior may have changed.", true);
  }
  if (
    changedSurface.includes("api") ||
    changedSurface.includes("web") ||
    changedSurface.includes("docker-compose")
  ) {
    addImpact(
      "docs/DEMO_RUNBOOK.md",
      "Self-hosted or dashboard workflow may have changed.",
      true,
    );
  }
  if (changedSurface.includes("generated-context")) {
    addImpact("AGENTS.md", "Generated context changed.", false);
  }
  return docsChanged ? [] : [...impacts.values()];
}

function buildDeterministicFindings(input: {
  profile: RepoProfile;
  input: ReviewInput;
  changedSurface: string[];
  expectedValidation: ReviewValidationExpectation[];
  validationEvidence: string[];
  docsImpact: ReviewResult["docsImpact"];
}): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  if (
    input.expectedValidation.length > 0 &&
    input.validationEvidence.length === 0
  ) {
    findings.push({
      id: "missing-validation-evidence",
      title: "Missing validation evidence",
      severity: "major",
      body: "Expected validation was inferred, but no matching PR body or CI evidence was detected.",
      path: null,
      line: null,
      citations: input.expectedValidation.flatMap((item) => item.evidence),
    });
  }
  for (const docsImpact of input.docsImpact.filter((item) => item.required)) {
    findings.push({
      id: `docs-impact-${slugify(docsImpact.path)}`,
      title: "Documentation impact needs review",
      severity: "minor",
      body: `${docsImpact.path} may need updates: ${docsImpact.reason}`,
      path: docsImpact.path,
      line: null,
      citations: docsImpact.evidence,
    });
  }
  return findings;
}

function buildRiskAnalysis(input: ReviewInput, profile: RepoProfile): string[] {
  const risks = new Set<string>();
  for (const skipped of input.skippedFiles) {
    risks.add(`${skipped.path} was skipped during review (${skipped.reason}).`);
  }
  for (const file of input.changedFiles) {
    if (
      profile.riskHintPaths.some((riskPath) => file.path.startsWith(riskPath))
    ) {
      risks.add(`${file.path} matches a repository risk path.`);
    }
  }
  return risks.size > 0
    ? [...risks].sort()
    : ["No deterministic risk path or skipped-file risk was detected."];
}

function buildResidualRisk(
  input: ReviewInput,
  findings: ReviewFinding[],
): string[] {
  const risks = [];
  if (input.checkStatuses.length === 0) {
    risks.push("CI/check status was unavailable in the review input.");
  }
  if (input.issueContext.length === 0) {
    risks.push("No linked issue acceptance criteria were available.");
  }
  if (findings.length === 0) {
    risks.push("No generic critique was emitted without repo evidence.");
  }
  return risks;
}

export function renderReviewMarkdown(input: ReviewResult): string {
  const review = parseReviewResult(input);
  const lines = [
    "## Open Maintainer PR Review",
    "",
    review.prNumber
      ? `Pull request: #${review.prNumber}`
      : "Pull request: local review",
    `Base: ${review.baseRef}${review.baseSha ? ` (${review.baseSha})` : ""}`,
    `Head: ${review.headRef}${review.headSha ? ` (${review.headSha})` : ""}`,
    renderModelLine(review),
    "",
    "### Summary",
    "",
    review.summary,
    "",
    "### Walkthrough",
    "",
    renderList(review.walkthrough),
    "",
    "### Changed Surface",
    "",
    renderList(review.changedSurface),
    "",
    "### Risk Analysis",
    "",
    renderList(review.riskAnalysis),
    "",
    "### Expected Validation",
    "",
    renderValidation(review.expectedValidation),
    "",
    "### Validation Evidence",
    "",
    renderListOrFallback(
      review.validationEvidence,
      "No validation evidence detected.",
    ),
    "",
    "### Docs Impact",
    "",
    renderDocsImpact(review.docsImpact),
    "",
    "### Findings",
    "",
    renderFindings(review.findings),
    "",
    "### Merge Readiness",
    "",
    `**${formatReadiness(review.mergeReadiness.status)}:** ${review.mergeReadiness.reason}`,
    renderCitationBlock(review.mergeReadiness.evidence),
    "",
    "### Residual Risk",
    "",
    renderListOrFallback(review.residualRisk, "No residual risk recorded."),
  ];

  return trimTrailingBlankLines(lines).join("\n");
}

export function renderReviewSummaryComment(input: ReviewResult): string {
  const review = parseReviewResult(input);
  return [
    "<!-- open-maintainer-review-summary -->",
    "## Open Maintainer PR Review",
    "",
    review.summary,
    "",
    "### Merge Readiness",
    "",
    `**${formatReadiness(review.mergeReadiness.status)}:** ${review.mergeReadiness.reason}`,
    "",
    "### Findings",
    "",
    renderFindings(review.findings),
    "",
    "### Expected Validation",
    "",
    renderValidation(review.expectedValidation),
    "",
    "### Docs Impact",
    "",
    renderDocsImpact(review.docsImpact),
    "",
    "### Residual Risk",
    "",
    renderListOrFallback(review.residualRisk, "No residual risk recorded."),
  ].join("\n");
}

export function renderInlineReviewComment(finding: ReviewFinding): string {
  if (finding.citations.length === 0) {
    throw new Error(`Review finding ${finding.id} has no citations.`);
  }
  return [
    `**${formatSeverity(finding.severity)}: ${finding.title}**`,
    "",
    finding.body,
    "",
    "Evidence:",
    renderCitationList(finding.citations),
  ].join("\n");
}

function renderModelLine(review: ReviewResult): string {
  return review.modelProvider && review.model
    ? `Model: ${review.modelProvider} / ${review.model}`
    : "Model: deterministic or not recorded";
}

function renderList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function renderListOrFallback(items: string[], fallback: string): string {
  return items.length > 0 ? renderList(items) : `- ${fallback}`;
}

function renderValidation(items: ReviewResult["expectedValidation"]): string {
  if (items.length === 0) {
    return "- No expected validation was inferred.";
  }
  return items
    .map((item) =>
      [
        `- \`${item.command}\`: ${item.reason}`,
        renderCitationList(item.evidence, "  "),
      ].join("\n"),
    )
    .join("\n");
}

function renderDocsImpact(items: ReviewResult["docsImpact"]): string {
  if (items.length === 0) {
    return "- No documentation impact was inferred.";
  }
  return items
    .map((item) => {
      const requirement = item.required ? "required" : "advisory";
      return [
        `- \`${item.path}\` (${requirement}): ${item.reason}`,
        renderCitationList(item.evidence, "  "),
      ].join("\n");
    })
    .join("\n");
}

function renderFindings(findings: ReviewFinding[]): string {
  if (findings.length === 0) {
    return "- No rule-grounded findings.";
  }

  return severityOrder
    .flatMap((severity) =>
      findings.filter((item) => item.severity === severity),
    )
    .map((finding) => {
      const location =
        finding.path && finding.line
          ? ` (${finding.path}:${finding.line})`
          : finding.path
            ? ` (${finding.path})`
            : "";
      return [
        `- **${formatSeverity(finding.severity)}: ${finding.title}**${location}`,
        `  ${finding.body}`,
        renderCitationList(finding.citations, "  "),
      ].join("\n");
    })
    .join("\n");
}

function renderCitationBlock(citations: ReviewEvidenceCitation[]): string {
  if (citations.length === 0) {
    return "";
  }
  return ["", "Evidence:", renderCitationList(citations)].join("\n");
}

function renderCitationList(
  citations: ReviewEvidenceCitation[],
  prefix = "",
): string {
  return citations
    .map((citation) => {
      const location = citation.path ? ` ${citation.path}` : "";
      const excerpt = citation.excerpt ? `: ${citation.excerpt}` : "";
      return `${prefix}- ${citation.source}${location}: ${citation.reason}${excerpt}`;
    })
    .join("\n");
}

function formatSeverity(severity: ReviewSeverity): string {
  return `${severity.charAt(0).toUpperCase()}${severity.slice(1)}`;
}

function formatReadiness(status: ReviewResult["mergeReadiness"]["status"]) {
  return status
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function trimTrailingBlankLines(lines: string[]): string[] {
  const next = [...lines];
  while (next.at(-1) === "") {
    next.pop();
  }
  return next;
}

function shouldRunCommandForSurface(
  command: string,
  changedSurface: string[],
): boolean {
  const normalized = command.toLowerCase();
  if (
    changedSurface.some((surface) => surface.startsWith("package:")) &&
    !normalized.includes("smoke") &&
    /(build|tsc|test|vitest|lint|biome)/.test(normalized)
  ) {
    return true;
  }
  if (changedSurface.includes("cli") && normalized.includes("apps/cli")) {
    return true;
  }
  if (changedSurface.includes("api") && normalized.includes("apps/api")) {
    return true;
  }
  if (changedSurface.includes("web") && normalized.includes("apps/web")) {
    return true;
  }
  if (changedSurface.includes("worker") && normalized.includes("apps/worker")) {
    return true;
  }
  if (
    changedSurface.includes("github-action/workflow") &&
    /(action|lint|test|vitest)/.test(normalized)
  ) {
    return true;
  }
  if (
    changedSurface.includes("docker-compose") &&
    /(compose|docker|smoke)/.test(normalized)
  ) {
    return true;
  }
  if (
    changedSurface.includes("fixtures/tests") &&
    /(test|vitest)/.test(normalized)
  ) {
    return true;
  }
  if (
    changedSurface.includes("config/lockfile") &&
    /(lint|typecheck|build|test|tsc|biome|vitest)/.test(normalized)
  ) {
    return true;
  }
  if (
    changedSurface.includes("generated-context") &&
    /(doctor|context|render|test)/.test(normalized)
  ) {
    return true;
  }
  return false;
}

function extractCommandFromRule(rule: string): string | null {
  const command = rule.match(/`([^`]+)`/)?.[1];
  return command && command.trim().length > 0 ? command : null;
}

function isGeneratedContextPath(path: string, profile: RepoProfile): boolean {
  return (
    path === "AGENTS.md" ||
    path === ".open-maintainer.yml" ||
    path.startsWith(".open-maintainer/") ||
    path.startsWith(".agents/skills/") ||
    profile.generatedFilePaths.includes(path) ||
    profile.generatedFileHints.includes(path)
  );
}

function isDocsPath(path: string): boolean {
  return (
    /^readme(\..*)?$/i.test(path) ||
    /^contributing(\..*)?$/i.test(path) ||
    path.startsWith("docs/") ||
    path.startsWith("local-docs/")
  );
}

function isConfigOrLockPath(path: string, profile: RepoProfile): boolean {
  return (
    profile.lockfiles.includes(path) ||
    profile.configFiles.includes(path) ||
    path.endsWith("package.json") ||
    path.endsWith("tsconfig.json") ||
    path === "biome.json"
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
