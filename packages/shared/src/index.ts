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
  architecturePathGroups: z.array(z.string()),
  generatedFileHints: z.array(z.string()),
  existingContextFiles: z.array(z.string()),
  detectedRiskAreas: z.array(z.string()),
  reviewRuleCandidates: z.array(z.string()),
  evidence: z.array(EvidenceReferenceSchema),
  workspaceManifests: z.array(z.string()),
  lockfiles: z.array(z.string()),
  configFiles: z.array(z.string()),
  agentReadiness: z.object({
    score: z.number().int().min(0).max(100),
    categories: z.array(
      z.object({
        name: z.enum([
          "setup clarity",
          "architecture clarity",
          "testing and CI",
          "agent instructions",
          "safety and review rules",
        ]),
        score: z.number().int().min(0).max(20),
        maxScore: z.literal(20),
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

export const ArtifactTypeSchema = z.enum([
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
