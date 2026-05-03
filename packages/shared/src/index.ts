import { z } from "zod";

export const RunStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const EvidenceReferenceSchema = z.object({
  path: z.string(),
  reason: z.string(),
});
export type EvidenceReference = z.infer<typeof EvidenceReferenceSchema>;

export const DetectedCommandSchema = z.object({
  name: z.string(),
  command: z.string(),
  source: z.string(),
});
export type DetectedCommand = z.infer<typeof DetectedCommandSchema>;

export const TrackedFileHashSchema = z.object({
  path: z.string(),
  hash: z.string(),
});
export type TrackedFileHash = z.infer<typeof TrackedFileHashSchema>;

export const RepoProfileSchema = z.object({
  id: z.string(),
  repoId: z.string(),
  version: z.number().int().positive(),
  owner: z.string(),
  name: z.string(),
  defaultBranch: z.string(),
  primaryLanguages: z.array(z.string()),
  frameworks: z.array(z.string()),
  packageManager: z.string().nullable(),
  commands: z.array(DetectedCommandSchema),
  ciWorkflows: z.array(z.string()),
  importantDocs: z.array(z.string()),
  repoTemplates: z.array(z.string()).default([]),
  architecturePathGroups: z.array(z.string()),
  generatedFileHints: z.array(z.string()),
  generatedFilePaths: z.array(z.string()).default([]),
  existingContextFiles: z.array(z.string()),
  detectedRiskAreas: z.array(z.string()),
  riskHintPaths: z.array(z.string()).default([]),
  ownershipHints: z.array(z.string()).default([]),
  environmentFiles: z.array(z.string()).default([]),
  environmentVariables: z.array(z.string()).default([]),
  ignoreFiles: z.array(z.string()).default([]),
  testFilePaths: z.array(z.string()).default([]),
  reviewRuleCandidates: z.array(z.string()),
  evidence: z.array(EvidenceReferenceSchema),
  workspaceManifests: z.array(z.string()),
  lockfiles: z.array(z.string()),
  configFiles: z.array(z.string()),
  trackedFileHashes: z.array(TrackedFileHashSchema).default([]),
  contextArtifactHashes: z.array(TrackedFileHashSchema).default([]),
  agentReadiness: z.object({
    score: z.number().int().min(0).max(100),
    categories: z.array(
      z.object({
        name: z.enum([
          "setup clarity",
          "architecture clarity",
          "testing",
          "CI",
          "docs",
          "risk handling",
          "generated-file handling",
          "agent instructions",
        ]),
        score: z.number().int().min(0).max(100),
        maxScore: z.number().int().min(1).max(100),
        missing: z.array(z.string()),
        evidence: z.array(EvidenceReferenceSchema),
      }),
    ),
    missingItems: z.array(z.string()),
    generatedAt: z.string(),
  }),
  createdAt: z.string(),
});
export type RepoProfile = z.infer<typeof RepoProfileSchema>;

const StaticArtifactTypeSchema = z.enum([
  "repo_profile",
  "AGENTS.md",
  "CLAUDE.md",
  ".open-maintainer.yml",
  ".github/copilot-instructions.md",
  ".cursor/rules/open-maintainer.md",
  ".agents/skills/repo-overview/SKILL.md",
  ".agents/skills/testing-workflow/SKILL.md",
  ".agents/skills/pr-review/SKILL.md",
  ".claude/skills/repo-overview/SKILL.md",
  ".claude/skills/testing-workflow/SKILL.md",
  ".claude/skills/pr-review/SKILL.md",
  ".open-maintainer/profile.json",
  ".open-maintainer/report.md",
]);
const SkillArtifactTypeSchema = z
  .string()
  .regex(/^\.(agents|claude)\/skills\/[a-z0-9][a-z0-9-]*\/SKILL\.md$/);
export const ArtifactTypeSchema = z.union([
  StaticArtifactTypeSchema,
  SkillArtifactTypeSchema,
]);
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;

export const GeneratedArtifactSchema = z.object({
  id: z.string(),
  repoId: z.string(),
  type: ArtifactTypeSchema,
  version: z.number().int().positive(),
  content: z.string(),
  sourceProfileVersion: z.number().int().positive(),
  modelProvider: z.string().nullable(),
  model: z.string().nullable(),
  createdAt: z.string(),
});
export type GeneratedArtifact = z.infer<typeof GeneratedArtifactSchema>;

export const RunRecordSchema = z.object({
  id: z.string(),
  repoId: z.string().nullable(),
  type: z.enum([
    "analysis",
    "generation",
    "ai",
    "webhook",
    "context_pr",
    "review",
    "worker",
  ]),
  status: RunStatusSchema,
  inputSummary: z.string(),
  safeMessage: z.string().nullable(),
  artifactVersions: z.array(z.number()),
  repoProfileVersion: z.number().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  externalId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RunRecord = z.infer<typeof RunRecordSchema>;

export const InstallationSchema = z.object({
  id: z.string(),
  accountLogin: z.string(),
  accountType: z.string(),
  repositorySelection: z.string(),
  permissions: z.record(z.string()),
  createdAt: z.string(),
});
export type Installation = z.infer<typeof InstallationSchema>;

export const RepoSchema = z.object({
  id: z.string(),
  installationId: z.string(),
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
  defaultBranch: z.string(),
  private: z.boolean(),
  permissions: z.record(z.boolean()).default({}),
});
export type Repo = z.infer<typeof RepoSchema>;

export const ModelProviderKindSchema = z.enum([
  "openai-compatible",
  "anthropic",
  "local-openai-compatible",
  "codex-cli",
  "claude-cli",
]);
export type ModelProviderKind = z.infer<typeof ModelProviderKindSchema>;

export const ModelProviderConfigSchema = z.object({
  id: z.string(),
  kind: ModelProviderKindSchema,
  displayName: z.string().min(1),
  baseUrl: z.string().url(),
  model: z.string().min(1),
  encryptedApiKey: z.string(),
  repoContentConsent: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ModelProviderConfig = z.infer<typeof ModelProviderConfigSchema>;

export const ContextPrSchema = z.object({
  id: z.string(),
  repoId: z.string(),
  branchName: z.string(),
  commitSha: z.string().nullable(),
  prNumber: z.number().nullable(),
  prUrl: z.string().url().nullable(),
  artifactVersions: z.array(z.number()),
  status: RunStatusSchema,
  createdAt: z.string(),
});
export type ContextPr = z.infer<typeof ContextPrSchema>;

export const ReviewSeveritySchema = z.enum([
  "blocker",
  "major",
  "minor",
  "note",
]);
export type ReviewSeverity = z.infer<typeof ReviewSeveritySchema>;

export const ReviewEvidenceSourceSchema = z.enum([
  "repo_profile",
  "open_maintainer_config",
  "generated_context",
  "repo_skill",
  "changed_file",
  "ci_status",
  "issue_acceptance_criteria",
  "user_input",
]);
export type ReviewEvidenceSource = z.infer<typeof ReviewEvidenceSourceSchema>;

export const ReviewEvidenceCitationSchema = z.object({
  source: ReviewEvidenceSourceSchema,
  path: z.string().nullable(),
  excerpt: z.string().nullable(),
  reason: z.string().min(1),
});
export type ReviewEvidenceCitation = z.infer<
  typeof ReviewEvidenceCitationSchema
>;

export const ReviewChangedFileSchema = z.object({
  path: z.string().min(1),
  status: z.enum(["added", "modified", "removed", "renamed", "copied"]),
  additions: z.number().int().min(0),
  deletions: z.number().int().min(0),
  patch: z.string().nullable(),
  previousPath: z.string().nullable(),
});
export type ReviewChangedFile = z.infer<typeof ReviewChangedFileSchema>;

export const ReviewSkippedFileSchema = z.object({
  path: z.string().min(1),
  reason: z.enum([
    "filtered",
    "max_files",
    "max_file_bytes",
    "max_total_bytes",
    "not_file",
    "not_found",
    "binary",
    "unavailable",
  ]),
});
export type ReviewSkippedFile = z.infer<typeof ReviewSkippedFileSchema>;

export const ReviewCheckStatusSchema = z.object({
  name: z.string().min(1),
  status: z.string().min(1),
  conclusion: z.string().nullable(),
  url: z.string().url().nullable(),
});
export type ReviewCheckStatus = z.infer<typeof ReviewCheckStatusSchema>;

export const ReviewIssueContextSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  body: z.string(),
  acceptanceCriteria: z.array(z.string().min(1)),
  url: z.string().url().nullable(),
});
export type ReviewIssueContext = z.infer<typeof ReviewIssueContextSchema>;

export const ReviewExistingCommentSchema = z.object({
  id: z.number().int().positive(),
  kind: z.enum(["summary", "inline"]),
  body: z.string(),
  path: z.string().nullable(),
  line: z.number().int().positive().nullable(),
});
export type ReviewExistingComment = z.infer<typeof ReviewExistingCommentSchema>;

export const ReviewValidationExpectationSchema = z.object({
  command: z.string().min(1),
  reason: z.string().min(1),
  evidence: z.array(ReviewEvidenceCitationSchema).min(1),
});
export type ReviewValidationExpectation = z.infer<
  typeof ReviewValidationExpectationSchema
>;

export const ReviewDocsImpactSchema = z.object({
  path: z.string().min(1),
  reason: z.string().min(1),
  required: z.boolean(),
  evidence: z.array(ReviewEvidenceCitationSchema).min(1),
});
export type ReviewDocsImpact = z.infer<typeof ReviewDocsImpactSchema>;

export const ReviewFindingSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  severity: ReviewSeveritySchema,
  body: z.string().min(1),
  path: z.string().nullable(),
  line: z.number().int().positive().nullable(),
  citations: z.array(ReviewEvidenceCitationSchema).min(1),
});
export type ReviewFinding = z.infer<typeof ReviewFindingSchema>;

export const ReviewMergeReadinessSchema = z.object({
  status: z.enum(["ready", "needs_attention", "blocked", "unknown"]),
  reason: z.string().min(1),
  evidence: z.array(ReviewEvidenceCitationSchema).default([]),
});
export type ReviewMergeReadiness = z.infer<typeof ReviewMergeReadinessSchema>;

export const ReviewContributionTriageCategorySchema = z.enum([
  "ready_for_review",
  "needs_author_input",
  "needs_maintainer_design",
  "not_agent_ready",
  "possible_spam",
]);
export type ReviewContributionTriageCategory = z.infer<
  typeof ReviewContributionTriageCategorySchema
>;

export const ReviewContributionTriageSchema = z
  .object({
    status: z.enum(["evaluated", "not_evaluated"]),
    category: ReviewContributionTriageCategorySchema.nullable(),
    recommendation: z.string().min(1),
    evidence: z.array(ReviewEvidenceCitationSchema),
    missingInformation: z.array(z.string().min(1)),
    requiredActions: z.array(z.string().min(1)),
  })
  .superRefine((value, context) => {
    if (value.status === "evaluated") {
      if (!value.category) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["category"],
          message: "evaluated contribution triage requires a category",
        });
      }
      if (value.evidence.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["evidence"],
          message: "evaluated contribution triage requires cited evidence",
        });
      }
    }
    if (value.status === "not_evaluated" && value.category !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: "not_evaluated contribution triage cannot include a category",
      });
    }
  });
export type ReviewContributionTriage = z.infer<
  typeof ReviewContributionTriageSchema
>;

export const NotEvaluatedContributionTriage: ReviewContributionTriage = {
  status: "not_evaluated",
  category: null,
  recommendation: "Contribution triage was not evaluated.",
  evidence: [],
  missingInformation: [],
  requiredActions: [],
};

export const ReviewFeedbackSchema = z.object({
  findingId: z.string().min(1),
  verdict: z.enum([
    "false_positive",
    "accepted",
    "needs_more_context",
    "unclear",
  ]),
  reason: z.string().nullable(),
  actor: z.string().nullable(),
  createdAt: z.string(),
});
export type ReviewFeedback = z.infer<typeof ReviewFeedbackSchema>;

export const ReviewResultSchema = z.object({
  id: z.string(),
  repoId: z.string(),
  prNumber: z.number().int().positive().nullable(),
  baseRef: z.string().min(1),
  headRef: z.string().min(1),
  baseSha: z.string().nullable(),
  headSha: z.string().nullable(),
  summary: z.string().min(1),
  walkthrough: z.array(z.string().min(1)),
  changedSurface: z.array(z.string().min(1)),
  riskAnalysis: z.array(z.string().min(1)),
  expectedValidation: z.array(ReviewValidationExpectationSchema),
  validationEvidence: z.array(z.string().min(1)),
  docsImpact: z.array(ReviewDocsImpactSchema),
  contributionTriage: ReviewContributionTriageSchema.default(
    NotEvaluatedContributionTriage,
  ),
  findings: z.array(ReviewFindingSchema),
  mergeReadiness: ReviewMergeReadinessSchema,
  residualRisk: z.array(z.string().min(1)),
  changedFiles: z.array(ReviewChangedFileSchema),
  feedback: z.array(ReviewFeedbackSchema).default([]),
  modelProvider: z.string().nullable(),
  model: z.string().nullable(),
  createdAt: z.string(),
});
export type ReviewResult = z.infer<typeof ReviewResultSchema>;

export const ReviewInputSchema = z.object({
  repoId: z.string(),
  owner: z.string(),
  repo: z.string(),
  prNumber: z.number().int().positive().nullable(),
  title: z.string().nullable(),
  body: z.string(),
  url: z.string().url().nullable(),
  author: z.string().nullable(),
  isDraft: z.boolean().nullable().default(null),
  mergeable: z.string().nullable().default(null),
  mergeStateStatus: z.string().nullable().default(null),
  reviewDecision: z.string().nullable().default(null),
  baseRef: z.string().min(1),
  headRef: z.string().min(1),
  baseSha: z.string().nullable(),
  headSha: z.string().nullable(),
  changedFiles: z.array(ReviewChangedFileSchema),
  commits: z.array(z.string().min(1)),
  checkStatuses: z.array(ReviewCheckStatusSchema),
  issueContext: z.array(ReviewIssueContextSchema),
  existingComments: z.array(ReviewExistingCommentSchema),
  skippedFiles: z.array(ReviewSkippedFileSchema),
  createdAt: z.string(),
});
export type ReviewInput = z.infer<typeof ReviewInputSchema>;

export const IssueTriageClassificationSchema = z.enum([
  "ready_for_review",
  "needs_author_input",
  "needs_maintainer_design",
  "not_agent_ready",
  "possible_spam",
]);
export type IssueTriageClassification = z.infer<
  typeof IssueTriageClassificationSchema
>;

export const IssueTriageAgentReadinessSchema = z.enum([
  "agent_ready",
  "not_agent_ready",
  "needs_human_design",
]);
export type IssueTriageAgentReadiness = z.infer<
  typeof IssueTriageAgentReadinessSchema
>;

export const IssueTriageRiskFlagSchema = z.enum([
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
]);
export type IssueTriageRiskFlag = z.infer<typeof IssueTriageRiskFlagSchema>;

export const IssueTriageLabelIntentSchema = z.enum([
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
]);
export type IssueTriageLabelIntent = z.infer<
  typeof IssueTriageLabelIntentSchema
>;

export const DefaultIssueTriageLabelMappings = {
  ready_for_review: "open-maintainer/ready-for-review",
  needs_author_input: "open-maintainer/needs-author-input",
  needs_maintainer_design: "open-maintainer/needs-maintainer-design",
  not_agent_ready: "open-maintainer/not-agent-ready",
  possible_spam: "open-maintainer/possible-spam",
  agent_ready: "open-maintainer/agent-ready",
  needs_human_design: "open-maintainer/needs-human-design",
  security_sensitive: "open-maintainer/security-sensitive",
  high_risk_path: "open-maintainer/high-risk-path",
  needs_reproduction: "open-maintainer/needs-reproduction",
  needs_validation: "open-maintainer/needs-validation",
  duplicate_candidate: "open-maintainer/duplicate-candidate",
} as const satisfies Record<IssueTriageLabelIntent, string>;

export const IssueTriageEvidenceSourceSchema = z.enum([
  "github_issue",
  "github_comment",
  "issue_template",
  "repo_profile",
  "open_maintainer_config",
  "generated_context",
  "related_issue",
  "referenced_file",
  "maintainer_input",
]);
export type IssueTriageEvidenceSource = z.infer<
  typeof IssueTriageEvidenceSourceSchema
>;

export const IssueTriageEvidenceCitationSchema = z.object({
  source: IssueTriageEvidenceSourceSchema,
  path: z.string().min(1).nullable(),
  url: z.string().url().nullable(),
  excerpt: z.string().min(1).nullable(),
  reason: z.string().min(1),
});
export type IssueTriageEvidenceCitation = z.infer<
  typeof IssueTriageEvidenceCitationSchema
>;

export const IssueTriageSkippedEvidenceSchema = z.object({
  source: IssueTriageEvidenceSourceSchema,
  reason: z.string().min(1),
});
export type IssueTriageSkippedEvidence = z.infer<
  typeof IssueTriageSkippedEvidenceSchema
>;

export const IssueTriageIssueMetadataSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  body: z.string(),
  author: z.string().nullable(),
  labels: z.array(z.string().min(1)),
  state: z.enum(["open", "closed"]),
  url: z.string().url().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type IssueTriageIssueMetadata = z.infer<
  typeof IssueTriageIssueMetadataSchema
>;

export const IssueTriageRelatedIssueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  url: z.string().url().nullable(),
  reason: z.string().min(1),
});
export type IssueTriageRelatedIssue = z.infer<
  typeof IssueTriageRelatedIssueSchema
>;

export const IssueTriageEvidenceSchema = z.object({
  issue: IssueTriageIssueMetadataSchema,
  repoId: z.string().min(1),
  owner: z.string().min(1),
  repo: z.string().min(1),
  sourceProfileVersion: z.number().int().positive().nullable(),
  contextArtifactVersion: z.number().int().positive().nullable(),
  templateHints: z.array(z.string().min(1)),
  acceptanceCriteriaCandidates: z.array(z.string().min(1)),
  referencedSurfaces: z.array(z.string().min(1)),
  relatedIssues: z.array(IssueTriageRelatedIssueSchema),
  citations: z.array(IssueTriageEvidenceCitationSchema),
  skippedEvidence: z.array(IssueTriageSkippedEvidenceSchema),
});
export type IssueTriageEvidence = z.infer<typeof IssueTriageEvidenceSchema>;

export const IssueTriageInputSchema = z.object({
  repoId: z.string().min(1),
  owner: z.string().min(1),
  repo: z.string().min(1),
  issueNumber: z.number().int().positive(),
  evidence: IssueTriageEvidenceSchema,
  modelProvider: z.string().min(1),
  model: z.string().min(1),
  consentMode: z.literal("explicit_repository_content_transfer"),
  createdAt: z.string(),
});
export type IssueTriageInput = z.infer<typeof IssueTriageInputSchema>;

export const IssueTriageCommentPreviewSchema = z.object({
  marker: z.string().min(1),
  summary: z.string().min(1),
  body: z.string().min(1),
  artifactPath: z.string().min(1).nullable(),
});
export type IssueTriageCommentPreview = z.infer<
  typeof IssueTriageCommentPreviewSchema
>;

export const IssueTriageWriteActionSchema = z.object({
  type: z.enum([
    "apply_label",
    "create_label",
    "post_comment",
    "update_comment",
    "close_issue",
  ]),
  status: z.enum(["skipped", "planned", "applied", "failed"]),
  target: z.string().min(1).nullable(),
  reason: z.string().min(1),
});
export type IssueTriageWriteAction = z.infer<
  typeof IssueTriageWriteActionSchema
>;

export const IssueTriageTaskBriefSchema = z.object({
  status: z.enum(["not_generated", "generated", "skipped"]),
  goal: z.string().min(1).nullable(),
  userVisibleBehavior: z.array(z.string().min(1)),
  readFirst: z.array(z.string().min(1)),
  likelyFiles: z.array(z.string().min(1)),
  constraints: z.array(z.string().min(1)),
  safetyNotes: z.array(z.string().min(1)),
  validationCommands: z.array(DetectedCommandSchema),
  doneCriteria: z.array(z.string().min(1)),
  escalationRisks: z.array(z.string().min(1)),
  markdown: z.string().min(1).nullable(),
});
export type IssueTriageTaskBrief = z.infer<typeof IssueTriageTaskBriefSchema>;

export const IssueTriageModelResultSchema = z.object({
  classification: IssueTriageClassificationSchema,
  agentReadiness: IssueTriageAgentReadinessSchema,
  confidence: z.number().min(0).max(1),
  riskFlags: z.array(IssueTriageRiskFlagSchema),
  labelIntents: z.array(IssueTriageLabelIntentSchema),
  recommendation: z.string().min(1),
  rationale: z.string().min(1),
  evidence: z.array(IssueTriageEvidenceCitationSchema).min(1),
  missingInformation: z.array(z.string().min(1)),
  requiredAuthorActions: z.array(z.string().min(1)),
  nextAction: z.string().min(1),
  commentPreview: IssueTriageCommentPreviewSchema,
  taskBrief: IssueTriageTaskBriefSchema.default({
    status: "not_generated",
    goal: null,
    userVisibleBehavior: [],
    readFirst: [],
    likelyFiles: [],
    constraints: [],
    safetyNotes: [],
    validationCommands: [],
    doneCriteria: [],
    escalationRisks: [],
    markdown: null,
  }),
});
export type IssueTriageModelResult = z.infer<
  typeof IssueTriageModelResultSchema
>;

export const IssueTriageResultSchema = IssueTriageModelResultSchema.extend({
  id: z.string().min(1),
  repoId: z.string().min(1),
  issueNumber: z.number().int().positive(),
  writeActions: z.array(IssueTriageWriteActionSchema),
  modelProvider: z.string().min(1),
  model: z.string().min(1),
  consentMode: z.literal("explicit_repository_content_transfer"),
  sourceProfileVersion: z.number().int().positive().nullable(),
  contextArtifactVersion: z.number().int().positive().nullable(),
  createdAt: z.string(),
});
export type IssueTriageResult = z.infer<typeof IssueTriageResultSchema>;

export const HealthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  api: z.literal("ok"),
  database: z.enum(["ok", "error"]),
  redis: z.enum(["ok", "error"]),
  worker: z.enum(["ok", "missing"]),
  workerHeartbeatAt: z.string().nullable(),
  checkedAt: z.string(),
});
export type Health = z.infer<typeof HealthSchema>;

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
