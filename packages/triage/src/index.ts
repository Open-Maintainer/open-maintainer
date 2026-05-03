import {
  DefaultIssueTriageLabelMappings,
  type DetectedCommand,
  type IssueTriageCommentPreview,
  type IssueTriageEvidence,
  type IssueTriageEvidenceCitation,
  type IssueTriageInput,
  type IssueTriageIssueMetadata,
  type IssueTriageLabelIntent,
  IssueTriageLabelIntentSchema,
  type IssueTriageModelResult,
  IssueTriageModelResultSchema,
  type IssueTriageRelatedIssue,
  type IssueTriageSkippedEvidence,
  type IssueTriageTaskBrief,
} from "@open-maintainer/shared";
import type { z } from "zod";

export const ISSUE_TRIAGE_COMMENT_MARKER =
  "<!-- open-maintainer:issue-triage -->";

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

export type BuildIssueTriageTaskBriefInput = {
  result: IssueTriageModelResult;
  evidence: IssueTriageEvidence;
  validationCommands: readonly DetectedCommand[];
  readFirstPaths?: readonly string[];
  allowNonAgentReady?: boolean;
};

export const issueTriageModelOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "classification",
    "agentReadiness",
    "confidence",
    "riskFlags",
    "labelIntents",
    "recommendation",
    "rationale",
    "evidence",
    "missingInformation",
    "requiredAuthorActions",
    "nextAction",
    "commentPreview",
  ],
  properties: {
    classification: {
      type: "string",
      enum: [
        "ready_for_review",
        "needs_author_input",
        "needs_maintainer_design",
        "not_agent_ready",
        "possible_spam",
      ],
    },
    agentReadiness: {
      type: "string",
      enum: ["agent_ready", "not_agent_ready", "needs_human_design"],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    riskFlags: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "security_sensitive",
          "high_risk_path",
          "dependency_change",
          "migration",
          "release_or_ci_change",
          "generated_file_change",
          "broad_scope",
          "unclear_scope",
          "missing_validation",
          "repository_content_transfer",
        ],
      },
    },
    labelIntents: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "ready_for_review",
          "needs_author_input",
          "needs_maintainer_design",
          "not_agent_ready",
          "possible_spam",
          "agent_ready",
          "needs_human_design",
          "security_sensitive",
          "high_risk_path",
          "needs_reproduction",
          "needs_validation",
          "duplicate_candidate",
        ],
      },
    },
    recommendation: { type: "string" },
    rationale: { type: "string" },
    evidence: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source", "path", "url", "excerpt", "reason"],
        properties: {
          source: {
            type: "string",
            enum: [
              "github_issue",
              "github_comment",
              "issue_template",
              "repo_profile",
              "open_maintainer_config",
              "generated_context",
              "related_issue",
              "referenced_file",
              "maintainer_input",
            ],
          },
          path: { type: ["string", "null"] },
          url: { type: ["string", "null"] },
          excerpt: { type: ["string", "null"] },
          reason: { type: "string" },
        },
      },
    },
    missingInformation: { type: "array", items: { type: "string" } },
    requiredAuthorActions: { type: "array", items: { type: "string" } },
    nextAction: { type: "string" },
    commentPreview: {
      type: "object",
      additionalProperties: false,
      required: ["marker", "summary", "body", "artifactPath"],
      properties: {
        marker: { type: "string" },
        summary: { type: "string" },
        body: { type: "string" },
        artifactPath: { type: ["string", "null"] },
      },
    },
  },
} as const;

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

export function parseIssueTriageModelCompletion(
  text: string,
): IssueTriageModelResult {
  const parsed = parseJsonObjectFromModelText(text);
  const result = IssueTriageModelResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Invalid issue triage model output: ${result.error.issues
        .map((issue) => `${issue.path.join(".") || "result"} ${issue.message}`)
        .join("; ")}`,
    );
  }
  return result.data;
}

export function buildIssueTriageModelPrompt(input: IssueTriageInput): {
  system: string;
  user: string;
} {
  return {
    system: [
      "You are Open Maintainer's issue triage reviewer.",
      "Classify the issue only from the provided issue evidence and repository context.",
      "Do not infer, mention, or evaluate whether an author used AI or automation.",
      "Return JSON that matches the provided schema and cite at least one provided evidence item.",
    ].join("\n"),
    user: JSON.stringify(
      {
        task: "Classify one GitHub issue for maintainer review and agent readiness.",
        allowedClassifications: [
          "ready_for_review",
          "needs_author_input",
          "needs_maintainer_design",
          "not_agent_ready",
          "possible_spam",
        ],
        allowedAgentReadiness: [
          "agent_ready",
          "not_agent_ready",
          "needs_human_design",
        ],
        boundaries: [
          "Do not mutate GitHub state.",
          "Do not claim or imply the author used AI.",
          "Use the LLM result as the only source of classification and agent readiness.",
        ],
        input,
      },
      null,
      2,
    ),
  };
}

export function renderIssueTriageCommentPreview(
  result: IssueTriageModelResult,
  artifactPath: string | null,
): IssueTriageCommentPreview {
  const title = humanizeTriageValue(result.classification);
  const missingLines =
    result.missingInformation.length > 0
      ? result.missingInformation.map((item) => `- ${item}`)
      : ["- No missing information was identified."];
  const actionLines =
    result.requiredAuthorActions.length > 0
      ? result.requiredAuthorActions.map((item) => `- ${item}`)
      : ["- No author action is required before maintainer review."];
  const body = [
    ISSUE_TRIAGE_COMMENT_MARKER,
    "## Open Maintainer Issue Triage",
    "",
    `Status: **${title}**`,
    "",
    result.recommendation,
    "",
    "### Missing Information",
    ...missingLines,
    "",
    "### Requested Author Actions",
    ...actionLines,
    "",
    "### Next Step",
    result.nextAction,
  ].join("\n");

  return {
    marker: ISSUE_TRIAGE_COMMENT_MARKER,
    summary: title,
    body,
    artifactPath,
  };
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

export function buildIssueTriageTaskBrief(
  input: BuildIssueTriageTaskBriefInput,
): IssueTriageTaskBrief {
  if (
    input.result.agentReadiness !== "agent_ready" &&
    !input.allowNonAgentReady
  ) {
    return {
      status: "skipped",
      goal: null,
      userVisibleBehavior: [],
      readFirst: [],
      likelyFiles: [],
      constraints: [],
      safetyNotes: [],
      validationCommands: [],
      doneCriteria: [],
      escalationRisks: [
        `Triage marked this issue as ${humanizeTriageValue(input.result.agentReadiness)}.`,
        `Classification is ${humanizeTriageValue(input.result.classification)}.`,
        "Pass the explicit non-agent-ready override only after a maintainer accepts the risk.",
      ],
      markdown:
        "Task brief was not generated because the issue is not agent-ready.",
    };
  }

  const validationCommands = selectValidationCommands(input.validationCommands);
  const userVisibleBehavior =
    input.evidence.acceptanceCriteriaCandidates.length > 0
      ? input.evidence.acceptanceCriteriaCandidates
      : [input.result.recommendation];
  const readFirst = unique([
    ...(input.readFirstPaths ?? []),
    ...input.evidence.referencedSurfaces.filter(isDocumentationSurface),
  ]).slice(0, 12);
  const likelyFiles = unique([
    ...input.evidence.referencedSurfaces.filter(
      (surface) => !isDocumentationSurface(surface),
    ),
    ...input.evidence.referencedSurfaces.filter(isDocumentationSurface),
  ]).slice(0, 12);
  const constraints = unique([
    "Use the existing repository patterns and keep the change scoped to this issue.",
    "Do not run agent dispatch, create branches, open pull requests, or mutate GitHub from this task brief.",
    ...input.result.requiredAuthorActions.map(
      (action) => `Do not proceed past missing author input: ${action}`,
    ),
  ]);
  const safetyNotes = unique([
    `Model rationale: ${input.result.rationale}`,
    ...input.result.riskFlags.map(
      (flag) => `Triage risk flag: ${humanizeTriageValue(flag)}.`,
    ),
    ...(input.result.agentReadiness === "agent_ready"
      ? [
          "Triage marked this issue agent-ready, but implementation still needs normal review.",
        ]
      : [
          `Override path: triage marked this issue ${humanizeTriageValue(input.result.agentReadiness)}.`,
        ]),
  ]);
  const doneCriteria = unique([
    ...input.evidence.acceptanceCriteriaCandidates,
    ...(validationCommands.length > 0
      ? validationCommands.map(
          (command) => `Run or explicitly skip: ${command.command}`,
        )
      : ["Document why no validation command was detected before handoff."]),
    "Update relevant docs when public behavior or workflow changes.",
  ]);
  const escalationRisks = unique([
    ...(input.result.agentReadiness === "agent_ready"
      ? []
      : [
          `Non-agent-ready override: ${humanizeTriageValue(input.result.agentReadiness)}.`,
        ]),
    ...input.result.missingInformation.map(
      (item) => `Missing information: ${item}`,
    ),
    ...input.result.riskFlags.map(
      (flag) =>
        `Escalate if implementation touches ${humanizeTriageValue(flag)} areas.`,
    ),
    "Escalate if the implementation requires product, security, data migration, or release policy decisions not already covered by the issue.",
  ]);
  const brief: Omit<IssueTriageTaskBrief, "markdown"> = {
    status: "generated",
    goal: `Resolve issue #${input.evidence.issue.number}: ${input.evidence.issue.title}`,
    userVisibleBehavior,
    readFirst,
    likelyFiles,
    constraints,
    safetyNotes,
    validationCommands,
    doneCriteria,
    escalationRisks,
  };

  return {
    ...brief,
    markdown: renderIssueTriageTaskBriefMarkdown(brief),
  };
}

function renderIssueTriageTaskBriefMarkdown(
  brief: Omit<IssueTriageTaskBrief, "markdown">,
): string {
  return [
    "# Open Maintainer Agent Task Brief",
    "",
    `Goal: ${brief.goal}`,
    "",
    "## User-visible Behavior",
    ...markdownList(brief.userVisibleBehavior),
    "",
    "## Read First",
    ...markdownList(
      brief.readFirst,
      "No required read-first files were detected.",
    ),
    "",
    "## Likely Files or Surfaces",
    ...markdownList(
      brief.likelyFiles,
      "No likely files were detected from the issue evidence.",
    ),
    "",
    "## Constraints",
    ...markdownList(brief.constraints),
    "",
    "## Safety Notes",
    ...markdownList(brief.safetyNotes),
    "",
    "## Validation",
    ...markdownList(
      brief.validationCommands.map((command) => command.command),
      "No validation command was detected; document the validation gap.",
    ),
    "",
    "## Done Criteria",
    ...markdownList(brief.doneCriteria),
    "",
    "## Escalation Risks",
    ...markdownList(
      brief.escalationRisks,
      "No specific escalation risks were detected beyond normal review.",
    ),
    "",
  ].join("\n");
}

function markdownList(values: readonly string[], empty: string | null = null) {
  const items = values.length > 0 ? values : empty ? [empty] : [];
  return items.map((item) => `- ${item}`);
}

function selectValidationCommands(
  commands: readonly DetectedCommand[],
): DetectedCommand[] {
  const preferred = ["lint", "typecheck", "test", "build", "smoke"];
  return [...commands]
    .sort((left, right) => {
      const leftIndex = preferred.findIndex((name) =>
        left.name.toLowerCase().includes(name),
      );
      const rightIndex = preferred.findIndex((name) =>
        right.name.toLowerCase().includes(name),
      );
      return (
        normalizeCommandIndex(leftIndex) - normalizeCommandIndex(rightIndex)
      );
    })
    .slice(0, 5);
}

function normalizeCommandIndex(index: number): number {
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
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

function isDocumentationSurface(candidate: string): boolean {
  return (
    /^(.+\/)?(README|AGENTS|CONTRIBUTING|CHANGELOG|CLAUDE)\.md$/i.test(
      candidate,
    ) || candidate.startsWith("docs/")
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

function humanizeTriageValue(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseJsonObjectFromModelText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  const jsonText = fenced?.[1] ?? trimmed;
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid issue triage model output: ${message}`);
  }
}
