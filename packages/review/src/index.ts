import type { ModelProvider } from "@open-maintainer/ai";
import type {
  ModelProviderConfig,
  RepoProfile,
  ReviewEvidenceCitation,
  ReviewFinding,
  ReviewInput,
  ReviewResult,
  ReviewSeverity,
  ReviewValidationExpectation,
} from "@open-maintainer/shared";
import { ReviewResultSchema } from "@open-maintainer/shared";
import { type ReviewPromptContext, generateModelBackedReview } from "./model";
export { assembleLocalReviewInput } from "./local-git";
export type { LocalReviewInputOptions } from "./local-git";
export {
  buildReviewPrompt,
  modelReviewOutputJsonSchema,
  parseModelReviewOutput,
} from "./model";
export type { ModelBackedReviewOptions, ModelReviewOutput } from "./model";

const severityOrder: ReviewSeverity[] = ["blocker", "major", "minor", "note"];

export type ReviewEvidencePrecheck = Pick<
  ReviewResult,
  | "walkthrough"
  | "changedSurface"
  | "riskAnalysis"
  | "expectedValidation"
  | "validationEvidence"
  | "docsImpact"
  | "residualRisk"
>;

export type GenerateReviewOptions = {
  repoId?: string;
  profile: RepoProfile;
  input: ReviewInput;
  rules?: string[];
  providerConfig: ModelProviderConfig;
  provider: ModelProvider;
  promptContext?: ReviewPromptContext;
};

export async function generateReview(
  options: GenerateReviewOptions,
): Promise<ReviewResult> {
  const precheck = buildReviewEvidencePrecheck(options);
  return generateModelBackedReview({
    ...(options.repoId ? { repoId: options.repoId } : {}),
    profile: options.profile,
    input: options.input,
    rules: options.rules ?? [],
    precheck,
    providerConfig: options.providerConfig,
    provider: options.provider,
    ...(options.promptContext ? { promptContext: options.promptContext } : {}),
  });
}

export function buildReviewEvidencePrecheck(input: {
  profile: RepoProfile;
  input: ReviewInput;
  rules?: string[];
}): ReviewEvidencePrecheck {
  const changedSurface = classifyChangedSurface(input.input, input.profile);
  const expectedValidation = inferExpectedValidation({
    profile: input.profile,
    changedSurface,
    input: input.input,
    rules: input.rules ?? [],
  });
  const validationEvidence = detectValidationEvidence(
    input.input,
    expectedValidation,
  );
  const docsImpact = inferDocsImpact(input.input, changedSurface);
  const riskAnalysis = buildRiskAnalysis(input.input, input.profile);
  const residualRisk = buildResidualRisk(input.input);

  return {
    walkthrough: input.input.changedFiles.map(
      (file) =>
        `${file.status} ${file.path} (+${file.additions}/-${file.deletions})`,
    ),
    changedSurface,
    riskAnalysis,
    expectedValidation,
    validationEvidence,
    docsImpact,
    residualRisk,
  };
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
    : ["No risk path or skipped-file risk was detected before model review."];
}

function buildResidualRisk(input: ReviewInput): string[] {
  const risks = [];
  if (input.checkStatuses.length === 0) {
    risks.push("CI/check status was unavailable in the review input.");
  }
  if (input.issueContext.length === 0) {
    risks.push("No linked issue acceptance criteria were available.");
  }
  return risks;
}

export function renderReviewMarkdown(input: ReviewResult): string {
  const review = parseReviewResult(input);
  const summary = parseStructuredSummary(review.summary);
  const lines = [
    `## OpenMaintainer Review ${review.prNumber ? `#${review.prNumber}` : "local"}`,
    "",
    `${review.baseRef}...${review.headRef}`,
    renderModelLine(review),
    "",
    "### Summary",
    "",
    summary.overview,
    "",
    `Risk level: **${summary.riskLevel ?? inferredRiskLevel(review)}**`,
    "",
    "Main concerns:",
    renderMainConcerns(review),
    "",
    "### Walkthrough",
    "",
    renderWalkthroughTable(review),
    "",
    "### Findings",
    "",
    renderFindings(review.findings),
    "",
    "### Required Validation For This PR",
    "",
    renderRequiredValidationBlock(review),
    "",
    "### Merge Readiness",
    "",
    review.mergeReadiness.reason,
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
    renderReviewMarkdown(review),
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
    : "Model: not recorded";
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

function parseStructuredSummary(summary: string): {
  overview: string;
  riskLevel: string | null;
  validationSummary: string | null;
  docsSummary: string | null;
} {
  const lines = summary.split(/\r?\n/).map((line) => line.trim());
  const riskLine = lines.find((line) => /^Risk:/i.test(line));
  const validationLine = lines.find((line) => /^Validation:/i.test(line));
  const docsLine = lines.find((line) => /^Docs:/i.test(line));
  const overview = lines
    .filter(
      (line) =>
        line &&
        !/^Risk:/i.test(line) &&
        !/^Validation:/i.test(line) &&
        !/^Docs:/i.test(line),
    )
    .join("\n");
  return {
    overview: overview || summary,
    riskLevel: riskLine?.replace(/^Risk:\s*/i, "").replace(/\.$/, "") ?? null,
    validationSummary:
      validationLine?.replace(/^Validation:\s*/i, "").replace(/\.$/, "") ??
      null,
    docsSummary: docsLine?.replace(/^Docs:\s*/i, "").replace(/\.$/, "") ?? null,
  };
}

function inferredRiskLevel(review: ReviewResult): string {
  if (review.findings.some((finding) => finding.severity === "blocker")) {
    return "critical";
  }
  if (review.findings.some((finding) => finding.severity === "major")) {
    return "high";
  }
  if (review.findings.some((finding) => finding.severity === "minor")) {
    return "medium";
  }
  return "low";
}

function renderMainConcerns(review: ReviewResult): string {
  const concerns = review.findings.slice(0, 5).map((finding) => finding.title);
  if (concerns.length === 0) {
    return "- No concrete findings.";
  }
  return renderList(concerns);
}

function renderWalkthroughTable(review: ReviewResult): string {
  const areas = review.changedSurface.length
    ? review.changedSurface
    : review.walkthrough;
  const rows = areas.map((area) => {
    const files = review.changedFiles.filter((file) =>
      fileMatchesSurface(file.path, area),
    );
    const changed = files.length
      ? files
          .slice(0, 3)
          .map((file) => `\`${file.path}\``)
          .join(", ")
      : review.walkthrough[0] || "Changed files in this area.";
    const focus =
      review.riskAnalysis.find((risk) =>
        risk.toLowerCase().includes(area.toLowerCase()),
      ) ??
      review.findings.find((finding) =>
        finding.path ? fileMatchesSurface(finding.path, area) : false,
      )?.title ??
      "Review changed behavior, validation, and repo policy.";
    return `| \`${area}\` | ${escapeTableCell(changed)} | ${escapeTableCell(focus)} |`;
  });
  return [
    "| Area | What changed | Review focus |",
    "|---|---|---|",
    ...(rows.length
      ? rows
      : ["| general | Changed files | Review changed behavior |"]),
  ].join("\n");
}

function fileMatchesSurface(repoPath: string, surface: string): boolean {
  if (surface.startsWith("package:")) {
    return repoPath.startsWith(`packages/${surface.slice("package:".length)}/`);
  }
  if (surface === "api") {
    return repoPath.startsWith("apps/api/");
  }
  if (surface === "cli") {
    return repoPath.startsWith("apps/cli/");
  }
  if (surface === "web") {
    return repoPath.startsWith("apps/web/");
  }
  if (surface === "worker") {
    return repoPath.startsWith("apps/worker/");
  }
  if (surface === "docs") {
    return repoPath.endsWith(".md") || repoPath.startsWith("docs/");
  }
  if (surface === "github-action/workflow") {
    return repoPath === "action.yml" || repoPath.startsWith(".github/");
  }
  if (surface === "fixtures/tests") {
    return repoPath.startsWith("tests/");
  }
  return repoPath.includes(surface);
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function renderRequiredValidationBlock(review: ReviewResult): string {
  const commands = requiredValidationCommands(review);
  if (commands.length === 0) {
    return "No required validation was inferred.";
  }
  return ["```sh", ...commands, "```"].join("\n");
}

function requiredValidationCommands(review: ReviewResult): string[] {
  const commands = review.expectedValidation
    .map((item) => item.command)
    .filter(isReviewValidationCommand);
  const preferred = [
    "biome check .",
    "tsc -b",
    "vitest run",
    "bun run build",
    "bun run tests/smoke/mvp-demo.ts",
    "bun run tests/smoke/compose-smoke.ts",
  ];
  const selected = preferred.filter(
    (command) =>
      commands.includes(command) ||
      (command === "bun run build" &&
        commands.some((item) => item.includes("bun run --cwd"))),
  );
  for (const command of commands) {
    if (!selected.includes(command) && selected.length < 10) {
      selected.push(command);
    }
  }
  return selected;
}

function isReviewValidationCommand(command: string): boolean {
  const normalized = command.toLowerCase();
  return (
    !normalized.includes("--watch") &&
    !normalized.includes(" next dev") &&
    !normalized.includes("bun src/server") &&
    !normalized.includes("format --write") &&
    /(biome check|tsc|typecheck|vitest|bun test|bun run build|smoke|mvp-demo|compose-smoke)/.test(
      normalized,
    )
  );
}

function parseFindingBody(body: string): {
  category: string | null;
  description: string;
  impact: string;
  recommendation: string;
} {
  const category = body.match(/^Category:\s*(.+)$/m)?.[1] ?? null;
  const impact = body.match(
    /^Impact:\s*([\s\S]*?)(?:\nRecommendation:|$)/m,
  )?.[1];
  const recommendation = body.match(/^Recommendation:\s*([\s\S]*)$/m)?.[1];
  const description = body
    .replace(/^Category:.*$/m, "")
    .replace(/^Impact:[\s\S]*$/m, "")
    .trim();
  return {
    category,
    description,
    impact: impact?.trim() ?? "",
    recommendation: recommendation?.trim() ?? "",
  };
}

function renderParagraphList(value: string): string {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `- ${line}`)
    .join("\n");
}

function renderFindings(findings: ReviewFinding[]): string {
  if (findings.length === 0) {
    return "No concrete findings.";
  }

  return severityOrder
    .flatMap((severity) =>
      findings.filter((item) => item.severity === severity),
    )
    .map((finding) => {
      const detail = parseFindingBody(finding.body);
      return [
        `#### ${formatSeverity(finding.severity)}: ${finding.title}`,
        "",
        finding.path
          ? `File: \`${finding.path}${finding.line ? `:${finding.line}` : ""}\``
          : "File: not path-specific",
        "",
        detail.category ? `Category: ${detail.category}` : "",
        detail.description,
        "",
        "Impact:",
        detail.impact ? renderParagraphList(detail.impact) : "- Not specified.",
        "",
        "Recommendation:",
        detail.recommendation
          ? renderParagraphList(detail.recommendation)
          : "- Not specified.",
        "",
        "Evidence:",
        renderCitationList(finding.citations),
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
