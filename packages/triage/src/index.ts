import {
  DefaultIssueTriageLabelDefinitions,
  DefaultIssueTriageLabelMappings,
  type DetectedCommand,
  type IssueTriageCommentPreview,
  type IssueTriageEvidence,
  type IssueTriageEvidenceCitation,
  type IssueTriageInput,
  IssueTriageInputSchema,
  type IssueTriageIssueMetadata,
  type IssueTriageModelResult,
  IssueTriageModelResultSchema,
  type IssueTriageRelatedIssue,
  type IssueTriageResolvedLabel,
  type IssueTriageResult,
  IssueTriageResultSchema,
  type IssueTriageSignal,
  IssueTriageSignalSchema,
  type IssueTriageSkippedEvidence,
  type IssueTriageTaskBrief,
  newId,
  nowIso,
} from "@open-maintainer/shared";
import type { z } from "zod";

export const ISSUE_TRIAGE_COMMENT_MARKER =
  "<!-- open-maintainer:issue-triage -->";

export type IssueTriageLabelMapping = Partial<
  Record<IssueTriageSignal, string>
>;

export type MappedIssueTriageLabel = {
  signal: IssueTriageSignal;
  label: string;
};

export type GitHubLabel = {
  id?: string;
  name: string;
  color?: string;
  description?: string | null;
};

export type IssueTriageLabelResolutionConfig = {
  mappings?: Partial<Record<IssueTriageSignal, string>>;
  preferUpstream?: boolean;
  createMissingPresetLabels?: boolean;
};

export const ISSUE_TRIAGE_SIGNALS = [
  "needs_author_input",
  "missing_reproduction",
  "missing_expected_actual",
  "missing_environment",
  "possible_duplicate",
  "possibly_spam",
  "not_actionable",
  "needs_human_design",
  "ready_for_maintainer_review",
  "agent_ready",
  "not_agent_ready",
  "bug_report",
  "feature_request",
  "question",
  "documentation",
  "security_claim_needs_poc",
] as const satisfies readonly IssueTriageSignal[];

const SIGNAL_PRIORITY: readonly IssueTriageSignal[] = [
  "possibly_spam",
  "possible_duplicate",
  "not_actionable",
  "missing_reproduction",
  "missing_expected_actual",
  "missing_environment",
  "security_claim_needs_poc",
  "needs_human_design",
  "needs_author_input",
  "bug_report",
  "feature_request",
  "question",
  "documentation",
  "ready_for_maintainer_review",
  "agent_ready",
  "not_agent_ready",
];

const CLASSIFICATION_SIGNALS: Record<
  IssueTriageModelResult["classification"],
  readonly IssueTriageSignal[]
> = {
  possibly_spam: ["possibly_spam"],
  possible_duplicate: ["possible_duplicate"],
  not_actionable: ["not_actionable", "needs_author_input"],
  needs_author_input: [
    "needs_author_input",
    "missing_reproduction",
    "missing_expected_actual",
    "missing_environment",
    "security_claim_needs_poc",
  ],
  needs_human_design: ["needs_human_design"],
  ready_for_maintainer_review: [
    "ready_for_maintainer_review",
    "bug_report",
    "feature_request",
    "question",
    "documentation",
    "agent_ready",
  ],
};

const SIGNAL_CONFLICTS: Array<readonly [IssueTriageSignal, IssueTriageSignal]> =
  [
    ["agent_ready", "not_agent_ready"],
    ["ready_for_maintainer_review", "needs_author_input"],
    ["ready_for_maintainer_review", "possibly_spam"],
    ["ready_for_maintainer_review", "not_actionable"],
    ["bug_report", "feature_request"],
    ["possibly_spam", "needs_human_design"],
  ];

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
    "qualityScore",
    "spamRisk",
    "agentReadiness",
    "signals",
    "confidence",
    "evidence",
    "missingInfo",
    "possibleDuplicates",
    "maintainerSummary",
    "suggestedAuthorRequest",
  ],
  properties: {
    classification: {
      type: "string",
      enum: [
        "ready_for_maintainer_review",
        "needs_author_input",
        "needs_human_design",
        "not_actionable",
        "possible_duplicate",
        "possibly_spam",
      ],
    },
    qualityScore: { type: "integer", minimum: 0, maximum: 100 },
    spamRisk: { type: "string", enum: ["low", "medium", "high"] },
    agentReadiness: {
      type: "string",
      enum: ["agent_ready", "not_agent_ready", "needs_human_design"],
    },
    signals: {
      type: "array",
      items: { type: "string", enum: ISSUE_TRIAGE_SIGNALS },
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    evidence: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["signal", "issueTextQuote", "reason"],
        properties: {
          signal: { type: "string", enum: ISSUE_TRIAGE_SIGNALS },
          issueTextQuote: { type: ["string", "null"] },
          reason: { type: "string" },
        },
      },
    },
    missingInfo: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "reproduction_steps",
          "expected_behavior",
          "actual_behavior",
          "environment",
          "logs_or_error",
          "affected_version",
          "acceptance_criteria",
          "affected_files_or_commands",
          "proof_of_concept",
        ],
      },
    },
    possibleDuplicates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["issueNumber", "reason"],
        properties: {
          issueNumber: { type: "integer", minimum: 1 },
          reason: { type: "string" },
        },
      },
    },
    maintainerSummary: { type: "string" },
    suggestedAuthorRequest: { type: ["string", "null"] },
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
  return normalizeIssueTriageModelResult(result.data);
}

export function buildIssueTriageModelPrompt(input: IssueTriageInput): {
  system: string;
  user: string;
} {
  return {
    system: [
      "You are OpenMaintainer Issue Triage.",
      "",
      "Your job is to help OSS maintainers batch-triage GitHub issues.",
      "",
      "Do not determine whether the author used AI.",
      "Do not accuse the author of using AI.",
      "Evaluate only observable issue quality: specificity, evidence, reproduction, scope, repo relevance, duplicate risk, spam risk, and actionability.",
      "",
      "Return JSON that satisfies the supplied schema.",
      "",
      "You must choose only from the supplied enum values.",
      "You must not invent labels.",
      "You must not output GitHub label names.",
      "You must not create new categories.",
      "",
      "Every signal must be supported by issue content, repo context, similar issue evidence, or missing required fields.",
      "",
      "Classify as possibly_spam only when the issue is promotional, irrelevant, nonsensical, malicious-looking, link-farm-like, or clearly unrelated to the repository.",
      "",
      "Classify as not_actionable when the issue may be sincere but lacks enough concrete information for maintainers to act.",
      "",
      "Classify as needs_author_input when the issue is potentially valid but needs missing information such as reproduction steps, expected/actual behavior, logs, environment, version, or acceptance criteria.",
      "",
      "Classify as needs_human_design when the issue is a broad product/design request that requires maintainer decision before implementation.",
      "",
      "Classify as ready_for_maintainer_review only when the issue has enough context for a maintainer to decide next steps.",
      "",
      "Keep summaries concise and neutral.",
      "Do not be hostile.",
      "",
      "Return only valid JSON.",
      "Do not include markdown fences.",
      "Do not include text outside JSON.",
    ].join("\n"),
    user: JSON.stringify(
      {
        task: "Classify this GitHub issue for deterministic maintainer triage.",
        allowedSignals: ISSUE_TRIAGE_SIGNALS,
        repo: {
          owner: input.owner,
          name: input.repo,
          defaultBranch: input.evidence.repo,
          languages: [],
          frameworks: [],
          importantDocs: [],
          issueTemplates: input.evidence.templateHints,
          knownCommands: [],
          knownPaths: input.evidence.referencedSurfaces,
        },
        issue: {
          number: input.issueNumber,
          title: input.evidence.issue.title,
          body: input.evidence.issue.body,
          authorAssociation: input.evidence.issue.author ?? "unknown",
          createdAt: input.evidence.issue.createdAt,
          updatedAt: input.evidence.issue.updatedAt,
          currentLabels: input.evidence.issue.labels,
        },
        similarIssues: input.evidence.relatedIssues.map((issue) => ({
          number: issue.number,
          title: issue.title,
          state: "open",
          labels: [],
          similarityReason: issue.reason,
        })),
        repoContext: {
          issueTemplateHints: input.evidence.templateHints,
        },
        evidence: input.evidence.citations,
        outputRules: {
          noLabelNames: true,
          allowedSignalsOnly: true,
          doNotDetectAiAuthorship: true,
          evidenceRequired: true,
          maxSignals: 4,
        },
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
    result.missingInfo.length > 0
      ? result.missingInfo.map((item) => `- ${humanizeTriageValue(item)}`)
      : ["- No missing information was identified."];
  const actionLines = result.suggestedAuthorRequest
    ? [`- ${result.suggestedAuthorRequest}`]
    : ["- No author action is required before maintainer review."];
  const body = [
    ISSUE_TRIAGE_COMMENT_MARKER,
    "## Open Maintainer Issue Triage",
    "",
    `Status: **${title}**`,
    "",
    result.maintainerSummary,
    "",
    "### Missing Information",
    ...missingLines,
    "",
    "### Requested Author Actions",
    ...actionLines,
    "",
    "### Signals",
    ...result.signals.map((signal) => `- ${humanizeTriageValue(signal)}`),
  ].join("\n");

  return {
    marker: ISSUE_TRIAGE_COMMENT_MARKER,
    summary: title,
    body,
    artifactPath,
  };
}

export function mapIssueTriageLabelIntents(
  intents: readonly IssueTriageSignal[],
  mappings: IssueTriageLabelMapping = {},
): MappedIssueTriageLabel[] {
  return intents.map((intent) => {
    const parsedIntent = IssueTriageSignalSchema.parse(intent);
    return {
      signal: parsedIntent,
      label:
        mappings[parsedIntent] ?? DefaultIssueTriageLabelMappings[parsedIntent],
    };
  });
}

export function resolveIssueTriageLabels(input: {
  signals: readonly IssueTriageSignal[];
  repoLabels: readonly GitHubLabel[];
  config?: IssueTriageLabelResolutionConfig;
  maxLabelsPerIssue?: number;
}): IssueTriageResolvedLabel[] {
  const maxLabels = input.maxLabelsPerIssue ?? 3;
  const repoLabels = input.repoLabels.filter((label) => label.name.trim());
  const normalizedToLabel = new Map(
    repoLabels.map((label) => [normalizeLabelName(label.name), label]),
  );
  const configMappings = input.config?.mappings ?? {};
  const preferUpstream = input.config?.preferUpstream ?? true;
  const createMissingPresetLabels =
    input.config?.createMissingPresetLabels ?? false;
  const signals = pruneIssueTriageSignals(input.signals).slice(0, maxLabels);
  const resolved: IssueTriageResolvedLabel[] = [];

  for (const signal of signals) {
    const configured = configMappings[signal];
    if (configured) {
      resolved.push({
        signal,
        label: configured,
        source: "config",
        shouldCreate: false,
      });
      continue;
    }

    const preset = DefaultIssueTriageLabelDefinitions[signal];
    const exact = normalizedToLabel.get(normalizeLabelName(preset.name));
    if (preferUpstream && exact) {
      resolved.push({
        signal,
        label: exact.name,
        source: "upstream_exact",
        shouldCreate: false,
      });
      continue;
    }

    const alias = preferUpstream
      ? findAliasLabel(signal, normalizedToLabel)
      : null;
    if (alias) {
      resolved.push({
        signal,
        label: alias.name,
        source: "upstream_alias",
        shouldCreate: false,
      });
      continue;
    }

    resolved.push({
      signal,
      label: preset.name,
      source: "preset",
      shouldCreate: createMissingPresetLabels,
      color: preset.color,
      description: preset.description,
    });
  }

  return dedupeResolvedLabels(resolved).slice(0, maxLabels);
}

export function normalizeLabelName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[_/]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^type[:-]/, "type-");
}

export function pruneIssueTriageSignals(
  signals: readonly IssueTriageSignal[],
  maxSignals = 4,
): IssueTriageSignal[] {
  const parsed = unique(
    signals.map((signal) => IssueTriageSignalSchema.parse(signal)),
  ) as IssueTriageSignal[];
  const sorted = parsed.sort(
    (left, right) =>
      SIGNAL_PRIORITY.indexOf(left) - SIGNAL_PRIORITY.indexOf(right),
  );
  const kept: IssueTriageSignal[] = [];
  for (const signal of sorted) {
    if (
      SIGNAL_CONFLICTS.some(
        ([left, right]) =>
          (signal === left && kept.includes(right)) ||
          (signal === right && kept.includes(left)),
      )
    ) {
      continue;
    }
    if (
      signal === "agent_ready" &&
      (kept.includes("needs_author_input") ||
        kept.includes("not_actionable") ||
        kept.includes("possibly_spam"))
    ) {
      continue;
    }
    kept.push(signal);
    if (kept.length >= maxSignals) {
      break;
    }
  }
  return kept;
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
      : [input.result.maintainerSummary];
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
    ...(input.result.suggestedAuthorRequest
      ? [
          `Do not proceed past missing author input: ${input.result.suggestedAuthorRequest}`,
        ]
      : []),
  ]);
  const safetyNotes = unique([
    `Model summary: ${input.result.maintainerSummary}`,
    ...input.result.signals.map(
      (signal) => `Triage signal: ${humanizeTriageValue(signal)}.`,
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
    ...input.result.missingInfo.map((item) => `Missing information: ${item}`),
    ...(input.result.signals.includes("security_claim_needs_poc")
      ? ["Escalate if implementation touches security-sensitive areas."]
      : []),
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

function normalizeIssueTriageModelResult(
  result: IssueTriageModelResult,
): IssueTriageModelResult {
  const allowed = new Set(CLASSIFICATION_SIGNALS[result.classification]);
  const evidenceSignals = new Set(result.evidence.map((item) => item.signal));
  const constrained = result.signals.filter(
    (signal) => allowed.has(signal) && evidenceSignals.has(signal),
  );
  const requiredSignal =
    CLASSIFICATION_SIGNALS[result.classification][0] ?? result.signals[0];
  const signals = pruneIssueTriageSignals(
    constrained.length > 0 || !requiredSignal ? constrained : [requiredSignal],
  );

  return {
    ...result,
    signals,
    evidence: result.evidence.filter((item) => signals.includes(item.signal))
      .length
      ? result.evidence.filter((item) => signals.includes(item.signal))
      : result.evidence,
  };
}

const LABEL_ALIASES: Record<IssueTriageSignal, readonly string[]> = {
  needs_author_input: [
    "needs-author-input",
    "needs author input",
    "needs-info",
    "needs info",
    "needs-information",
    "needs information",
    "more-info-needed",
    "awaiting response",
    "waiting for author",
    "needs clarification",
  ],
  missing_reproduction: [
    "needs-reproduction",
    "needs reproduction",
    "reproduction needed",
    "needs repro",
    "missing reproduction",
    "can't reproduce",
    "cannot reproduce",
  ],
  missing_expected_actual: [
    "needs-expected-actual",
    "expected actual",
    "expected behavior",
    "actual behavior",
  ],
  missing_environment: [
    "needs-environment",
    "environment needed",
    "needs version",
    "needs platform",
  ],
  possible_duplicate: [
    "duplicate",
    "possibly-duplicate",
    "possible duplicate",
    "dupe",
  ],
  possibly_spam: [
    "spam",
    "possibly-spam",
    "possible spam",
    "invalid",
    "off-topic",
  ],
  not_actionable: [
    "not-actionable",
    "not actionable",
    "invalid",
    "wontfix",
    "wont-fix",
    "won't fix",
  ],
  needs_human_design: [
    "needs-design",
    "needs design",
    "needs-discussion",
    "needs discussion",
    "needs maintainer input",
    "needs product input",
  ],
  ready_for_maintainer_review: [
    "ready-for-review",
    "ready for review",
    "triaged",
    "accepted",
    "confirmed",
  ],
  agent_ready: ["agent-ready", "agent ready"],
  not_agent_ready: ["not-agent-ready", "not agent ready"],
  bug_report: ["bug", "type: bug", "kind/bug", "defect"],
  feature_request: [
    "enhancement",
    "feature",
    "feature request",
    "type: enhancement",
    "type: feature",
  ],
  question: ["question", "support", "help wanted"],
  documentation: ["documentation", "docs", "doc"],
  security_claim_needs_poc: [
    "security-claim-needs-poc",
    "security",
    "needs security details",
  ],
};

function findAliasLabel(
  signal: IssueTriageSignal,
  normalizedToLabel: Map<string, GitHubLabel>,
): GitHubLabel | null {
  for (const alias of LABEL_ALIASES[signal]) {
    const label = normalizedToLabel.get(normalizeLabelName(alias));
    if (label) {
      return label;
    }
  }
  return null;
}

function dedupeResolvedLabels(
  labels: readonly IssueTriageResolvedLabel[],
): IssueTriageResolvedLabel[] {
  const seen = new Set<string>();
  const resolved: IssueTriageResolvedLabel[] = [];
  for (const label of labels) {
    const normalized = normalizeLabelName(label.label);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    resolved.push(label);
  }
  return resolved;
}

export type IssueTriageRepoContextPort = {
  repoId: string;
  owner: string;
  repo: string;
  sourceProfileVersion?: number | null;
  contextArtifactVersion?: number | null;
  labels?: IssueTriageLabelResolutionConfig;
  closure?: IssueTriageClosurePolicy | null;
  batch?: IssueTriageBatchPolicy | null;
  validationCommands?: readonly DetectedCommand[];
  readFirstPaths?: readonly string[];
};

export type IssueTriageClosurePolicy = {
  allowPossibleSpam: boolean;
  allowStaleAuthorInput: boolean;
  staleAuthorInputDays: number;
  requireCommentBeforeClose: boolean;
  maxClosuresPerRun: number;
};

export type IssueTriageBatchPolicy = {
  defaultState?: "open" | "closed" | "all";
  maxIssues?: number;
  includeLabels?: readonly string[];
  excludeLabels?: readonly string[];
};

export type IssueTriageModelPort = {
  provider: string;
  model: string;
  complete(
    prompt: { system: string; user: string },
    options: { outputSchema: typeof issueTriageModelOutputJsonSchema },
  ): Promise<{ text: string; model?: string }>;
};

export type IssueTriageListedIssue = {
  number: number;
  title: string;
  labels: readonly string[];
};

export type IssueTriageGitHubPort = {
  fetchEvidence(input: {
    repoId: string;
    owner: string;
    repo: string;
    issueNumber: number;
    sourceProfileVersion?: number | null;
    contextArtifactVersion?: number | null;
  }): Promise<IssueTriageEvidence>;
  listRepoLabels(): Promise<readonly GitHubLabel[]>;
  listRepoLabelNames(): Promise<ReadonlySet<string>>;
  listIssueLabelNames(issueNumber: number): Promise<ReadonlySet<string>>;
  createLabel(label: IssueTriageResolvedLabel): Promise<void>;
  applyLabel(issueNumber: number, label: string): Promise<void>;
  listTriageComments(
    issueNumber: number,
  ): Promise<readonly { id: string | number; body: string | null }[]>;
  postComment(issueNumber: number, body: string): Promise<void>;
  updateComment(commentId: string | number, body: string): Promise<void>;
  closeIssue(issueNumber: number): Promise<void>;
  listIssues(input: {
    state: "open" | "closed" | "all";
    limit: number;
    includeLabels: readonly string[];
    excludeLabels: readonly string[];
  }): Promise<readonly IssueTriageListedIssue[]>;
};

export type IssueTriageArtifactPort = {
  writeIssue(
    artifactPath: string,
    artifact: { input: IssueTriageInput; result: IssueTriageResult },
  ): Promise<void>;
  readIssue(
    artifactPath: string,
  ): Promise<{ input: IssueTriageInput; result: IssueTriageResult }>;
  writeBatchReport?(input: {
    jsonPath: string;
    markdownPath: string;
    report: IssueTriageBatchReport;
    markdown: string;
  }): Promise<void>;
  writeBriefMarkdown?(outputPath: string, markdown: string): Promise<void>;
};

export type IssueTriageIdPort = {
  triageResult(): string;
  batchRun(): string;
};

export type IssueTriagePreviewOptions = {
  createMissingLabels?: boolean;
};

export type IssueTriageApplyOptions = {
  labels?: boolean;
  createMissingLabels?: boolean;
  comment?: boolean;
  close?: boolean;
  onlySignals?: readonly string[];
  minConfidence?: number | null;
  dryRun?: boolean;
  artifact?: "write" | "skip";
};

export type IssueTriageBatchOptions = IssueTriageApplyOptions & {
  state?: "open" | "closed" | "all";
  limit?: number | null;
  label?: string | null;
  includeLabels?: readonly string[];
  excludeLabels?: readonly string[];
  format?: "table" | "json" | "markdown" | null;
};

export type IssueTriageBriefOptions = {
  allowNonAgentReady?: boolean;
  dryRun?: boolean;
  outputPath?: string | null;
};

export type IssueTriagePreviewResult = {
  input: IssueTriageInput;
  evidence: IssueTriageEvidence;
  result: IssueTriageResult;
  artifactPath: string;
  writePlan: IssueTriageWritePlan;
};

export type IssueTriageWritePlan = {
  input: IssueTriageInput;
  evidence: IssueTriageEvidence;
  result: IssueTriageResult;
  artifactPath: string;
};

export type IssueTriageApplyResult = {
  input: IssueTriageInput;
  evidence: IssueTriageEvidence;
  result: IssueTriageResult;
  artifactPath: string;
};

export type IssueTriageBatchRecord =
  | {
      status: "succeeded";
      issueNumber: number;
      title: string;
      artifactPath: string;
      classification: IssueTriageResult["classification"];
      agentReadiness: IssueTriageResult["agentReadiness"];
      qualityScore: number;
      confidence: number;
      signals: IssueTriageResult["signals"];
      resolvedLabels: string[];
      nextAction: string;
      writeActions: IssueTriageResult["writeActions"];
    }
  | {
      status: "failed";
      issueNumber: number;
      title: string;
      error: string;
    };

export type IssueTriageBatchReport = {
  runId: string;
  owner: string;
  repo: string;
  state: "open" | "closed" | "all";
  limit: number;
  label: string | null;
  excludedLabels: string[];
  issueCount: number;
  provider: string;
  model: string;
  consentMode: "explicit_repository_content_transfer";
  issues: IssueTriageBatchRecord[];
  createdAt: string;
};

export type IssueTriageBatchResult = {
  report: IssueTriageBatchReport;
  jsonPath: string;
  markdownPath: string;
  markdown: string;
};

export type IssueTriageBriefResult = {
  artifactPath: string;
  artifact: { input: IssueTriageInput; result: IssueTriageResult };
  brief: IssueTriageTaskBrief;
};

export type IssueTriageWorkflow = {
  preview(
    issueNumber: number,
    options?: IssueTriagePreviewOptions,
  ): Promise<IssueTriagePreviewResult>;
  apply(
    plan: IssueTriageWritePlan,
    options?: IssueTriageApplyOptions,
  ): Promise<IssueTriageApplyResult>;
  batch(options?: IssueTriageBatchOptions): Promise<IssueTriageBatchResult>;
  brief(
    issueNumber: number,
    options?: IssueTriageBriefOptions,
  ): Promise<IssueTriageBriefResult>;
};

export function createIssueTriageWorkflow(deps: {
  repo: IssueTriageRepoContextPort;
  github: IssueTriageGitHubPort;
  model: IssueTriageModelPort;
  artifacts?: IssueTriageArtifactPort;
  clock?: () => string;
  ids?: IssueTriageIdPort;
}): IssueTriageWorkflow {
  const clock = deps.clock ?? nowIso;
  const ids = deps.ids ?? {
    triageResult: () => newId("issue_triage"),
    batchRun: () => newId("triage_run"),
  };

  const preview = async (
    issueNumber: number,
    options: IssueTriagePreviewOptions = {},
  ): Promise<IssueTriagePreviewResult> => {
    const evidence = await deps.github.fetchEvidence({
      repoId: deps.repo.repoId,
      owner: deps.repo.owner,
      repo: deps.repo.repo,
      issueNumber,
      sourceProfileVersion: deps.repo.sourceProfileVersion ?? null,
      contextArtifactVersion: deps.repo.contextArtifactVersion ?? null,
    });
    const triageInput = IssueTriageInputSchema.parse({
      repoId: deps.repo.repoId,
      owner: deps.repo.owner,
      repo: deps.repo.repo,
      issueNumber,
      evidence,
      modelProvider: deps.model.provider,
      model: deps.model.model,
      consentMode: "explicit_repository_content_transfer",
      createdAt: clock(),
    } satisfies IssueTriageInput);
    const completion = await deps.model.complete(
      buildIssueTriageModelPrompt(triageInput),
      { outputSchema: issueTriageModelOutputJsonSchema },
    );
    const modelResult = parseIssueTriageModelCompletion(completion.text);
    const artifactPath = issueTriageArtifactPath(issueNumber);
    const commentPreview = renderIssueTriageCommentPreview(
      modelResult,
      artifactPath,
    );
    const repoLabels = await deps.github.listRepoLabels();
    const resolvedLabels = resolveIssueTriageLabels({
      signals: modelResult.signals,
      repoLabels,
      config: {
        ...deps.repo.labels,
        createMissingPresetLabels:
          deps.repo.labels?.createMissingPresetLabels ||
          options.createMissingLabels ||
          false,
      },
    });
    const result = IssueTriageResultSchema.parse({
      ...modelResult,
      commentPreview,
      resolvedLabels,
      id: ids.triageResult(),
      repoId: deps.repo.repoId,
      issueNumber,
      writeActions: [],
      modelProvider: deps.model.provider,
      model: completion.model ?? deps.model.model,
      consentMode: "explicit_repository_content_transfer",
      sourceProfileVersion: deps.repo.sourceProfileVersion ?? null,
      contextArtifactVersion: deps.repo.contextArtifactVersion ?? null,
      createdAt: clock(),
    } satisfies IssueTriageResult);
    const writePlan = { input: triageInput, evidence, result, artifactPath };
    return { input: triageInput, evidence, result, artifactPath, writePlan };
  };

  let closuresApplied = 0;

  const apply = async (
    plan: IssueTriageWritePlan,
    options: IssueTriageApplyOptions = {},
  ): Promise<IssueTriageApplyResult> => {
    const applyLabels =
      options.labels === true &&
      (options.minConfidence === null ||
        options.minConfidence === undefined ||
        plan.result.confidence >= options.minConfidence);
    const writeActions = await issueTriageWorkflowWriteActions(deps.github, {
      owner: deps.repo.owner,
      repo: deps.repo.repo,
      issueNumber: plan.result.issueNumber,
      issueUpdatedAt: plan.evidence.issue.updatedAt,
      classification: plan.result.classification,
      resolvedLabels: plan.result.resolvedLabels,
      commentPreview: plan.result.commentPreview,
      applyLabels,
      createLabels: options.createMissingLabels === true,
      postComment: options.comment === true,
      onlySignals: options.onlySignals ?? [],
      closeAllowed: options.close === true,
      closureConfig: deps.repo.closure ?? null,
      closuresApplied,
      dryRun: options.dryRun === true,
      now: clock(),
    });
    if (
      writeActions.some(
        (action) =>
          action.type === "close_issue" && action.status === "applied",
      )
    ) {
      closuresApplied += 1;
    }
    const result = IssueTriageResultSchema.parse({
      ...plan.result,
      writeActions,
    } satisfies IssueTriageResult);
    if (options.artifact !== "skip" && !options.dryRun) {
      await deps.artifacts?.writeIssue(plan.artifactPath, {
        input: plan.input,
        result,
      });
    }
    return {
      input: plan.input,
      evidence: plan.evidence,
      result,
      artifactPath: plan.artifactPath,
    };
  };

  return {
    preview,
    apply,
    async batch(options: IssueTriageBatchOptions = {}) {
      const batchPolicy = deps.repo.batch ?? null;
      const limit = options.limit ?? batchPolicy?.maxIssues ?? 100;
      const excludeLabels =
        options.excludeLabels && options.excludeLabels.length > 0
          ? [...options.excludeLabels]
          : [
              ...(batchPolicy?.excludeLabels ?? [
                "triaged",
                "duplicate",
                "wontfix",
                "invalid",
                "closed",
                "security",
              ]),
            ];
      const includeLabels = [
        ...(options.label ? [options.label] : []),
        ...(options.includeLabels ?? []),
        ...(batchPolicy?.includeLabels ?? []),
      ];
      const state = options.state ?? batchPolicy?.defaultState ?? "open";
      const listedIssues = await deps.github.listIssues({
        state,
        limit,
        includeLabels,
        excludeLabels,
      });
      const issues = filterIssueTriageBatchIssues(listedIssues, {
        limit,
        includeLabels,
        excludeLabels,
      });
      const records: IssueTriageBatchRecord[] = [];
      for (const issue of issues) {
        try {
          const previewOptions: IssueTriagePreviewOptions = {};
          if (options.createMissingLabels !== undefined) {
            previewOptions.createMissingLabels = options.createMissingLabels;
          }
          const previewResult = await preview(issue.number, previewOptions);
          const applied = await apply(previewResult.writePlan, options);
          records.push({
            status: "succeeded",
            issueNumber: issue.number,
            title: previewResult.evidence.issue.title,
            artifactPath: applied.artifactPath,
            classification: applied.result.classification,
            agentReadiness: applied.result.agentReadiness,
            qualityScore: applied.result.qualityScore,
            confidence: applied.result.confidence,
            signals: applied.result.signals,
            resolvedLabels: applied.result.resolvedLabels.map(
              (label) => label.label,
            ),
            nextAction: applied.result.maintainerSummary,
            writeActions: applied.result.writeActions,
          });
        } catch (error) {
          records.push({
            status: "failed",
            issueNumber: issue.number,
            title: issue.title,
            error: errorMessage(error),
          });
        }
      }
      const runId = ids.batchRun();
      const report: IssueTriageBatchReport = {
        runId,
        owner: deps.repo.owner,
        repo: deps.repo.repo,
        state,
        limit,
        label: includeLabels.join(",") || null,
        excludedLabels: excludeLabels,
        issueCount: issues.length,
        provider: deps.model.provider,
        model: deps.model.model,
        consentMode: "explicit_repository_content_transfer",
        issues: records,
        createdAt: clock(),
      };
      const jsonPath = `.open-maintainer/triage/runs/${runId}.json`;
      const markdownPath = `.open-maintainer/triage/runs/${runId}.md`;
      const markdown = renderIssueTriageBatchMarkdown(report);
      if (!options.dryRun) {
        await deps.artifacts?.writeBatchReport?.({
          jsonPath,
          markdownPath,
          report,
          markdown,
        });
      }
      return { report, jsonPath, markdownPath, markdown };
    },
    async brief(issueNumber: number, options: IssueTriageBriefOptions = {}) {
      const artifactPath = issueTriageArtifactPath(issueNumber);
      if (!deps.artifacts) {
        throw new Error("Issue triage artifact reads are unavailable.");
      }
      const artifact = await deps.artifacts.readIssue(artifactPath);
      const brief = buildIssueTriageTaskBrief({
        result: artifact.result,
        evidence: artifact.input.evidence,
        validationCommands: deps.repo.validationCommands ?? [],
        readFirstPaths: deps.repo.readFirstPaths ?? [],
        allowNonAgentReady: options.allowNonAgentReady === true,
      });
      const updated = {
        ...artifact,
        result: {
          ...artifact.result,
          taskBrief: brief,
        },
      };
      if (!options.dryRun) {
        await deps.artifacts.writeIssue(artifactPath, updated);
      }
      if (options.outputPath && brief.markdown && !options.dryRun) {
        await deps.artifacts.writeBriefMarkdown?.(
          options.outputPath,
          brief.markdown,
        );
      }
      return { artifactPath, artifact: updated, brief };
    },
  };
}

function filterIssueTriageBatchIssues(
  issues: readonly IssueTriageListedIssue[],
  input: {
    limit: number;
    includeLabels: readonly string[];
    excludeLabels: readonly string[];
  },
): IssueTriageListedIssue[] {
  const includeLabels = new Set(input.includeLabels.map(normalizeLabelName));
  const excludeLabels = new Set(input.excludeLabels.map(normalizeLabelName));
  const skipAlreadyLabelled = includeLabels.size === 0;
  const filtered: IssueTriageListedIssue[] = [];
  for (const issue of issues) {
    if (filtered.length >= input.limit) {
      break;
    }
    const labels = issue.labels.map(normalizeLabelName);
    if (labels.some((label) => excludeLabels.has(label))) {
      continue;
    }
    if (
      includeLabels.size > 0 &&
      !labels.some((label) => includeLabels.has(label))
    ) {
      continue;
    }
    if (skipAlreadyLabelled && labels.length > 0) {
      continue;
    }
    filtered.push(issue);
  }
  return filtered;
}

async function issueTriageWorkflowWriteActions(
  github: IssueTriageGitHubPort,
  input: {
    owner: string;
    repo: string;
    issueNumber: number;
    issueUpdatedAt: string;
    classification: IssueTriageResult["classification"];
    resolvedLabels: readonly IssueTriageResolvedLabel[];
    commentPreview: IssueTriageResult["commentPreview"];
    applyLabels: boolean;
    createLabels: boolean;
    postComment: boolean;
    onlySignals: readonly string[];
    closeAllowed: boolean;
    dryRun: boolean;
    closureConfig: IssueTriageClosurePolicy | null;
    closuresApplied: number;
    now: string;
  },
): Promise<IssueTriageResult["writeActions"]> {
  const labelActions = await issueTriageWorkflowLabelActions(github, input);
  const commentAction = await issueTriageWorkflowCommentAction(github, input);
  const closeAction = await issueTriageWorkflowCloseAction(github, {
    ...input,
    commentAction,
  });
  return [...labelActions, commentAction, closeAction];
}

async function issueTriageWorkflowCloseAction(
  github: IssueTriageGitHubPort,
  input: {
    issueNumber: number;
    issueUpdatedAt: string;
    classification: IssueTriageResult["classification"];
    closeAllowed: boolean;
    dryRun: boolean;
    closureConfig: IssueTriageClosurePolicy | null;
    closuresApplied: number;
    now: string;
    commentAction: IssueTriageResult["writeActions"][number];
  },
): Promise<IssueTriageResult["writeActions"][number]> {
  const skipped = (
    reason: string,
  ): IssueTriageResult["writeActions"][number] => ({
    type: "close_issue",
    status: "skipped",
    target: `issue:${input.issueNumber}`,
    reason,
  });
  if (!input.closeAllowed) {
    return skipped("Closure requires explicit --close-allowed.");
  }
  if (input.dryRun) {
    return skipped("Dry run: no issue closure applied.");
  }
  const config = input.closureConfig;
  if (!config) {
    return skipped(
      "Closure requires .open-maintainer.yml issueTriage.closure config.",
    );
  }
  if (input.closuresApplied >= config.maxClosuresPerRun) {
    return skipped(`Closure cap reached (${config.maxClosuresPerRun}).`);
  }
  if (
    config.requireCommentBeforeClose &&
    input.commentAction.status !== "applied"
  ) {
    return skipped(
      "Closure requires a posted or updated public triage comment.",
    );
  }
  if (input.classification === "possibly_spam") {
    if (!config.allowPossibleSpam) {
      return skipped("Config does not allow possibly_spam closure.");
    }
  } else if (input.classification === "needs_author_input") {
    if (!config.allowStaleAuthorInput) {
      return skipped("Config does not allow stale needs_author_input closure.");
    }
    const staleMs = config.staleAuthorInputDays * 24 * 60 * 60 * 1000;
    const updatedAt = new Date(input.issueUpdatedAt).getTime();
    const now = new Date(input.now).getTime();
    if (
      !Number.isFinite(updatedAt) ||
      !Number.isFinite(now) ||
      now - updatedAt < staleMs
    ) {
      return skipped("needs_author_input issue is not stale enough to close.");
    }
  } else {
    return skipped(`Closure is unsupported for ${input.classification}.`);
  }
  try {
    await github.closeIssue(input.issueNumber);
  } catch (error) {
    return {
      type: "close_issue",
      status: "failed",
      target: `issue:${input.issueNumber}`,
      reason: `Could not close issue: ${errorMessage(error)}`,
    };
  }
  return {
    type: "close_issue",
    status: "applied",
    target: `issue:${input.issueNumber}`,
    reason: `Closed ${input.classification} issue after config and CLI approval.`,
  };
}

async function issueTriageWorkflowCommentAction(
  github: IssueTriageGitHubPort,
  input: {
    issueNumber: number;
    commentPreview: IssueTriageResult["commentPreview"];
    postComment: boolean;
    dryRun: boolean;
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
  if (input.dryRun) {
    return {
      type: "post_comment",
      status: "skipped",
      target: `issue:${input.issueNumber}`,
      reason: "Dry run: no issue triage comment posted.",
    };
  }
  let comments: readonly { id: string | number; body: string | null }[];
  try {
    comments = await github.listTriageComments(input.issueNumber);
  } catch (error) {
    return {
      type: "post_comment",
      status: "failed",
      target: `issue:${input.issueNumber}`,
      reason: `Could not inspect existing issue triage comments: ${errorMessage(error)}`,
    };
  }
  const existing = comments.find((comment) =>
    comment.body?.includes(input.commentPreview.marker),
  );
  if (existing) {
    try {
      await github.updateComment(existing.id, input.commentPreview.body);
    } catch (error) {
      return {
        type: "update_comment",
        status: "failed",
        target: `comment:${existing.id}`,
        reason: `Could not update issue triage comment: ${errorMessage(error)}`,
      };
    }
    return {
      type: "update_comment",
      status: "applied",
      target: `comment:${existing.id}`,
      reason: "Updated existing marked issue triage comment.",
    };
  }
  try {
    await github.postComment(input.issueNumber, input.commentPreview.body);
  } catch (error) {
    return {
      type: "post_comment",
      status: "failed",
      target: `issue:${input.issueNumber}`,
      reason: `Could not post issue triage comment: ${errorMessage(error)}`,
    };
  }
  return {
    type: "post_comment",
    status: "applied",
    target: `issue:${input.issueNumber}`,
    reason:
      "Posted marked issue triage comment because --post-comment was set.",
  };
}

async function issueTriageWorkflowLabelActions(
  github: IssueTriageGitHubPort,
  input: {
    issueNumber: number;
    resolvedLabels: readonly IssueTriageResolvedLabel[];
    applyLabels: boolean;
    createLabels: boolean;
    dryRun: boolean;
    onlySignals?: readonly string[];
  },
): Promise<IssueTriageResult["writeActions"]> {
  const mappedLabels = input.resolvedLabels.filter(
    (label) =>
      label.source !== "none" &&
      (input.onlySignals?.length
        ? input.onlySignals.includes(label.signal)
        : true),
  );
  if (mappedLabels.length === 0) {
    return [
      {
        type: "apply_label",
        status: "skipped",
        target: `issue:${input.issueNumber}`,
        reason: "No issue triage signals resolved to allowed labels.",
      },
    ];
  }
  const repoLabels = new Set(await github.listRepoLabelNames());
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
  if (input.dryRun) {
    return mappedLabels.flatMap((label) => [
      ...(input.createLabels
        ? [
            {
              type: "create_label" as const,
              status: "skipped" as const,
              target: label.label,
              reason: "Dry run: no issue labels created.",
            },
          ]
        : []),
      {
        type: "apply_label" as const,
        status: "skipped" as const,
        target: label.label,
        reason: "Dry run: no issue labels applied.",
      },
    ]);
  }

  const actions: IssueTriageResult["writeActions"] = [];
  const missingLabels = mappedLabels.filter(
    (label) => !repoLabels.has(label.label),
  );
  if (missingLabels.length > 0 && input.createLabels) {
    for (const label of missingLabels) {
      if (!label.shouldCreate) {
        actions.push({
          type: "create_label",
          status: "skipped",
          target: label.label,
          reason:
            "Missing preset label creation is not enabled for this label.",
        });
        continue;
      }
      try {
        await github.createLabel(label);
        repoLabels.add(label.label);
        actions.push({
          type: "create_label",
          status: "applied",
          target: label.label,
          reason:
            "Created missing issue triage label because --create-labels was set.",
        });
      } catch (error) {
        actions.push({
          type: "create_label",
          status: "failed",
          target: label.label,
          reason: `Could not create issue triage label: ${errorMessage(error)}`,
        });
      }
    }
  } else {
    for (const label of missingLabels) {
      actions.push({
        type: "create_label",
        status: "skipped",
        target: label.label,
        reason:
          "Label is missing; pass --create-missing-preset-labels to create it.",
      });
    }
  }

  const issueLabels = new Set(
    await github.listIssueLabelNames(input.issueNumber),
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
  for (const label of labelsToApply) {
    try {
      await github.applyLabel(input.issueNumber, label.label);
      actions.push({
        type: "apply_label",
        status: "applied",
        target: label.label,
        reason: "Applied issue triage label because --apply-labels was set.",
      });
    } catch (error) {
      actions.push({
        type: "apply_label",
        status: "failed",
        target: label.label,
        reason: `Could not apply issue triage label: ${errorMessage(error)}`,
      });
    }
  }
  return actions;
}

function issueTriageArtifactPath(issueNumber: number): string {
  return `.open-maintainer/triage/issues/${issueNumber}.json`;
}

export function renderIssueTriageBatchMarkdown(
  report: IssueTriageBatchReport,
): string {
  return [
    `# Open Maintainer Issue Triage Run ${report.runId}`,
    "",
    `Repository: ${report.owner}/${report.repo}`,
    `Scanned: ${report.issueCount} ${report.state} issues`,
    `Provider: ${report.provider}`,
    `Model: ${report.model}`,
    `Consent: ${report.consentMode}`,
    "",
    "## Summary",
    "",
    renderIssueTriageBatchSummary(report),
    "",
    renderIssueTriageBatchGroups(report),
    "",
  ].join("\n");
}

export function renderIssueTriageBatchSummary(
  report: IssueTriageBatchReport,
): string {
  const counts = new Map<
    IssueTriageResult["classification"] | "failed",
    number
  >();
  for (const record of report.issues) {
    const key =
      record.status === "succeeded" ? record.classification : "failed";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [
    `Ready for maintainer review: ${counts.get("ready_for_maintainer_review") ?? 0}`,
    `Needs author input: ${counts.get("needs_author_input") ?? 0}`,
    `Possibly spam: ${counts.get("possibly_spam") ?? 0}`,
    `Likely duplicate: ${counts.get("possible_duplicate") ?? 0}`,
    `Needs human design: ${counts.get("needs_human_design") ?? 0}`,
    `Not actionable: ${counts.get("not_actionable") ?? 0}`,
    "Already labelled / unchanged: 0",
    `Errors: ${counts.get("failed") ?? 0}`,
  ].join("\n");
}

export function renderIssueTriageBatchGroups(
  report: IssueTriageBatchReport,
): string {
  const lines: string[] = [];
  for (const group of TRIAGE_WORKFLOW_BATCH_GROUPS) {
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
          `- #${record.issueNumber} ${record.title}: score ${record.qualityScore}, labels ${record.resolvedLabels.join(", ") || "none"}; ${record.nextAction} (${record.artifactPath})`,
        );
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

const TRIAGE_WORKFLOW_BATCH_GROUPS: Array<{
  title: string;
  classification: IssueTriageResult["classification"] | null;
}> = [
  {
    title: "Ready for maintainer review",
    classification: "ready_for_maintainer_review",
  },
  { title: "Needs author input", classification: "needs_author_input" },
  { title: "Needs human design", classification: "needs_human_design" },
  { title: "Not actionable", classification: "not_actionable" },
  { title: "Possible duplicate", classification: "possible_duplicate" },
  { title: "Possibly spam", classification: "possibly_spam" },
  { title: "Errors", classification: null },
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
