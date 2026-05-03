import {
  DefaultIssueTriageLabelMappings,
  type IssueTriageEvidence,
  type IssueTriageEvidenceCitation,
  type IssueTriageIssueMetadata,
  type IssueTriageLabelIntent,
  IssueTriageLabelIntentSchema,
  type IssueTriageModelResult,
  IssueTriageModelResultSchema,
  type IssueTriageRelatedIssue,
  type IssueTriageSkippedEvidence,
} from "@open-maintainer/shared";
import type { z } from "zod";

export type IssueTriageLabelMapping = Partial<
  Record<IssueTriageLabelIntent, string>
>;

export type MappedIssueTriageLabel = {
  intent: IssueTriageLabelIntent;
  label: string;
};

export type IssueTriageEvidenceCommentInput = {
  id: number;
  body: string;
  author: string | null;
  url: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type BuildIssueTriageEvidenceInput = {
  repoId: string;
  owner: string;
  repo: string;
  issue: IssueTriageIssueMetadata;
  comments?: readonly IssueTriageEvidenceCommentInput[];
  relatedIssues?: readonly IssueTriageRelatedIssue[];
  sourceProfileVersion?: number | null;
  contextArtifactVersion?: number | null;
  skippedEvidence?: readonly IssueTriageSkippedEvidence[];
};

export function parseIssueTriageModelResult(
  value: unknown,
): IssueTriageModelResult {
  return IssueTriageModelResultSchema.parse(value);
}

export function safeParseIssueTriageModelResult(
  value: unknown,
): z.SafeParseReturnType<unknown, IssueTriageModelResult> {
  return IssueTriageModelResultSchema.safeParse(value);
}

export function mapIssueTriageLabelIntents(
  intents: readonly IssueTriageLabelIntent[],
  mappings: IssueTriageLabelMapping = {},
): MappedIssueTriageLabel[] {
  return intents.map((intent) => {
    const parsedIntent = IssueTriageLabelIntentSchema.parse(intent);
    return {
      intent: parsedIntent,
      label:
        mappings[parsedIntent] ?? DefaultIssueTriageLabelMappings[parsedIntent],
    };
  });
}

export function buildIssueTriageEvidence(
  input: BuildIssueTriageEvidenceInput,
): IssueTriageEvidence {
  const comments = input.comments ?? [];
  const issueBody = input.issue.body.trim();
  const commentBodies = comments.map((comment) => comment.body).join("\n\n");
  const combinedText = [input.issue.title, issueBody, commentBodies].join(
    "\n\n",
  );
  const templateHints = extractIssueTemplateHints(issueBody);
  const acceptanceCriteriaCandidates =
    extractAcceptanceCriteriaCandidates(issueBody);
  const referencedSurfaces = extractReferencedSurfaces(combinedText);
  const citations: IssueTriageEvidenceCitation[] = [
    {
      source: "github_issue",
      path: null,
      url: input.issue.url,
      excerpt: excerpt(input.issue.body || input.issue.title),
      reason: "Primary GitHub issue text for model-backed issue triage.",
    },
    ...comments
      .filter((comment) => comment.body.trim().length > 0)
      .map((comment) => ({
        source: "github_comment" as const,
        path: null,
        url: comment.url,
        excerpt: excerpt(comment.body),
        reason: `Issue comment ${comment.id} may contain maintainer or author follow-up evidence.`,
      })),
    ...templateHints.map((hint) => ({
      source: "issue_template" as const,
      path: null,
      url: input.issue.url,
      excerpt: hint,
      reason: "Issue body contains a template section hint.",
    })),
    ...referencedSurfaces.map((surface) => ({
      source: "referenced_file" as const,
      path: surface,
      url: null,
      excerpt: surface,
      reason: "Issue text references this repository surface.",
    })),
    ...(input.relatedIssues ?? []).map((issue) => ({
      source: "related_issue" as const,
      path: null,
      url: issue.url,
      excerpt: `#${issue.number} ${issue.title}`,
      reason: issue.reason,
    })),
  ];

  return {
    issue: input.issue,
    repoId: input.repoId,
    owner: input.owner,
    repo: input.repo,
    sourceProfileVersion: input.sourceProfileVersion ?? null,
    contextArtifactVersion: input.contextArtifactVersion ?? null,
    templateHints,
    acceptanceCriteriaCandidates,
    referencedSurfaces,
    relatedIssues: [...(input.relatedIssues ?? [])],
    citations,
    skippedEvidence: [...(input.skippedEvidence ?? [])],
  };
}

export function extractIssueTemplateHints(text: string): string[] {
  const hints: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const heading = trimmed.match(/^#{1,6}\s+(.+)$/)?.[1];
    const boldLabel = trimmed.match(/^\*\*([^*]+)\*\*:?\s*$/)?.[1];
    const label = heading ?? boldLabel;
    if (label && isTemplateHint(label)) {
      hints.push(normalizeWhitespace(label));
    }
  }
  return unique(hints).slice(0, 20);
}

export function extractAcceptanceCriteriaCandidates(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const criteria: string[] = [];
  let inSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#{1,6}\s+acceptance criteria\b/i.test(trimmed)) {
      inSection = true;
      continue;
    }
    if (inSection && /^#{1,6}\s+/.test(trimmed)) {
      break;
    }
    if (!inSection) {
      continue;
    }
    const item = trimmed
      .replace(/^- \[[ xX]\]\s+/, "")
      .replace(/^[-*]\s+/, "")
      .replace(/^\d+\.\s+/, "");
    if (item) {
      criteria.push(item);
    }
  }
  return unique(criteria).slice(0, 20);
}

export function extractReferencedSurfaces(text: string): string[] {
  const candidates: string[] = [];
  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
    candidates.push(match[1] ?? "");
  }
  for (const match of text.matchAll(
    /(?:^|[\s([{:])((?:(?:apps|packages|tests|docs|src|lib|components|pages|app|\.github)\/)[A-Za-z0-9_./-]+|[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+)(?=$|[\s)\]},:.;])/g,
  )) {
    candidates.push(match[1] ?? "");
  }

  return unique(
    candidates
      .map((candidate) => candidate.trim().replace(/^\/+/, ""))
      .map((candidate) => candidate.replace(/[),.;:]+$/, ""))
      .filter(isLikelyRepositorySurface),
  ).slice(0, 30);
}

export function extractReferencedIssueNumbers(text: string): number[] {
  const issueNumbers = new Set<number>();
  for (const match of text.matchAll(
    /(?:^|[^\w/])(?:[\w.-]+\/[\w.-]+)?#(\d+)\b/g,
  )) {
    addPositiveInteger(issueNumbers, match[1]);
  }
  for (const match of text.matchAll(
    /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(?:issues|pull)\/(\d+)\b/g,
  )) {
    addPositiveInteger(issueNumbers, match[1]);
  }
  return [...issueNumbers];
}

function addPositiveInteger(values: Set<number>, value: string | undefined) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    values.add(parsed);
  }
}

function isTemplateHint(label: string): boolean {
  return /^(bug report|feature request|problem|proposal|expected behavior|actual behavior|current behavior|steps to reproduce|reproduction|environment|acceptance criteria|test plan|validation|scope|out of scope|dependencies|implementation notes)\b/i.test(
    label.trim(),
  );
}

function isLikelyRepositorySurface(candidate: string): boolean {
  if (
    !candidate ||
    candidate.length > 200 ||
    candidate.includes("://") ||
    candidate.includes("..") ||
    candidate.startsWith("#")
  ) {
    return false;
  }
  if (/^[\w.-]+#[0-9]+$/.test(candidate)) {
    return false;
  }
  return (
    candidate.includes("/") ||
    /^(README|AGENTS|CONTRIBUTING|package|tsconfig|biome|docker-compose)\.[A-Za-z0-9]+$/i.test(
      candidate,
    )
  );
}

function excerpt(text: string): string {
  const normalized = normalizeWhitespace(text);
  return normalized.length > 500
    ? `${normalized.slice(0, 497).trimEnd()}...`
    : normalized;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}
