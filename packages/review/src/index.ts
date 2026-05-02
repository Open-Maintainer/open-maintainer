import type {
  ReviewEvidenceCitation,
  ReviewFinding,
  ReviewResult,
  ReviewSeverity,
} from "@open-maintainer/shared";
import { ReviewResultSchema } from "@open-maintainer/shared";
export { assembleLocalReviewInput } from "./local-git";
export type { LocalReviewInputOptions } from "./local-git";

const severityOrder: ReviewSeverity[] = ["blocker", "major", "minor", "note"];

export function parseReviewResult(input: unknown): ReviewResult {
  return ReviewResultSchema.parse(input);
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
