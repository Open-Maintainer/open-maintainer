import type { ModelProvider } from "@open-maintainer/ai";
import { assertProviderConsent } from "@open-maintainer/ai";
import type {
  ModelProviderConfig,
  RepoProfile,
  ReviewEvidenceCitation,
  ReviewFinding,
  ReviewInput,
  ReviewMergeReadiness,
  ReviewResult,
  ReviewSeverity,
} from "@open-maintainer/shared";
import {
  ReviewFindingSchema,
  ReviewResultSchema,
  newId,
  nowIso,
} from "@open-maintainer/shared";
import { z } from "zod";
import type { ReviewEvidencePrecheck } from "./index";

const ModelReviewFindingSchema = ReviewFindingSchema.omit({ id: true }).extend({
  id: z.string().min(1).optional(),
});

export const ModelReviewOutputSchema = z.object({
  summary: z.string().min(1).optional(),
  findings: z.array(ModelReviewFindingSchema).default([]),
  mergeReadiness: z
    .object({
      status: z.enum(["ready", "needs_attention", "blocked", "unknown"]),
      reason: z.string().min(1),
      evidence: z.array(z.string().min(1)).default([]),
    })
    .optional(),
  residualRisk: z.array(z.string().min(1)).default([]),
});
export type ModelReviewOutput = z.infer<typeof ModelReviewOutputSchema>;

export const modelReviewOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", minLength: 1 },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "title",
          "severity",
          "body",
          "path",
          "line",
          "citations",
        ],
        properties: {
          id: { type: "string", minLength: 1 },
          title: { type: "string", minLength: 1 },
          severity: {
            type: "string",
            enum: ["blocker", "major", "minor", "note"],
          },
          body: { type: "string", minLength: 1 },
          path: { anyOf: [{ type: "string" }, { type: "null" }] },
          line: { anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }] },
          citations: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["source", "path", "excerpt", "reason"],
              properties: {
                source: {
                  type: "string",
                  enum: [
                    "repo_profile",
                    "open_maintainer_config",
                    "generated_context",
                    "repo_skill",
                    "changed_file",
                    "ci_status",
                    "issue_acceptance_criteria",
                    "user_input",
                  ],
                },
                path: { anyOf: [{ type: "string" }, { type: "null" }] },
                excerpt: { anyOf: [{ type: "string" }, { type: "null" }] },
                reason: { type: "string", minLength: 1 },
              },
            },
          },
        },
      },
    },
    mergeReadiness: {
      type: "object",
      additionalProperties: false,
      required: ["status", "reason", "evidence"],
      properties: {
        status: {
          type: "string",
          enum: ["ready", "needs_attention", "blocked", "unknown"],
        },
        reason: { type: "string", minLength: 1 },
        evidence: { type: "array", items: { type: "string", minLength: 1 } },
      },
    },
    residualRisk: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
  },
  required: ["summary", "findings", "mergeReadiness", "residualRisk"],
} as const;

export type ReviewPromptContext = {
  openMaintainerConfig?: string;
  generatedContext?: string;
  repoSkill?: string;
};

export type ModelBackedReviewOptions = {
  repoId?: string;
  profile: RepoProfile;
  input: ReviewInput;
  rules?: string[];
  precheck: ReviewEvidencePrecheck;
  providerConfig: ModelProviderConfig;
  provider: ModelProvider;
  promptContext?: ReviewPromptContext;
};

export async function generateModelBackedReview(
  options: ModelBackedReviewOptions,
): Promise<ReviewResult> {
  assertProviderConsent(options.providerConfig);
  const prompt = buildReviewPrompt(options);
  const completion = await options.provider.complete(prompt, {
    outputSchema: modelReviewOutputJsonSchema,
  });
  const parsed = parseModelReviewOutput(completion.text);
  const validation = validateModelFindings({
    input: options.input,
    profile: options.profile,
    findings: parsed.findings,
  });
  const mergeReadiness = modelMergeReadiness(parsed.mergeReadiness);

  return ReviewResultSchema.parse({
    id: newId("review"),
    repoId: options.repoId ?? options.input.repoId,
    prNumber: options.input.prNumber,
    baseRef: options.input.baseRef,
    headRef: options.input.headRef,
    baseSha: options.input.baseSha,
    headSha: options.input.headSha,
    summary:
      parsed.summary ??
      `Model-backed review for ${options.profile.owner}/${options.profile.name}.`,
    walkthrough: options.precheck.walkthrough,
    changedSurface: options.precheck.changedSurface,
    riskAnalysis: options.precheck.riskAnalysis,
    expectedValidation: options.precheck.expectedValidation,
    validationEvidence: options.precheck.validationEvidence,
    docsImpact: options.precheck.docsImpact,
    findings: validation.findings.sort(compareFindingSeverity),
    mergeReadiness,
    residualRisk: [
      ...options.precheck.residualRisk,
      ...parsed.residualRisk,
      ...validation.residualRisk,
    ],
    changedFiles: options.input.changedFiles,
    feedback: [],
    modelProvider: options.providerConfig.displayName,
    model: completion.model || options.providerConfig.model,
    createdAt: nowIso(),
  });
}

export function buildReviewPrompt(input: {
  profile: RepoProfile;
  input: ReviewInput;
  precheck: ReviewEvidencePrecheck;
  rules?: string[];
  promptContext?: ReviewPromptContext;
}) {
  const changedFiles = input.input.changedFiles.map((file) => ({
    path: file.path,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    patch: file.patch,
  }));
  const issueContext = input.input.issueContext.map((issue) => ({
    number: issue.number,
    title: issue.title,
    acceptanceCriteria: issue.acceptanceCriteria,
  }));
  const profileSummary = {
    owner: input.profile.owner,
    name: input.profile.name,
    defaultBranch: input.profile.defaultBranch,
    commands: input.profile.commands,
    importantDocs: input.profile.importantDocs,
    riskHintPaths: input.profile.riskHintPaths,
    reviewRuleCandidates: input.profile.reviewRuleCandidates,
  };
  const precheck = {
    changedSurface: input.precheck.changedSurface,
    expectedValidation: input.precheck.expectedValidation,
    validationEvidence: input.precheck.validationEvidence,
    docsImpact: input.precheck.docsImpact,
    riskAnalysis: input.precheck.riskAnalysis,
    residualRisk: input.precheck.residualRisk,
  };

  return {
    system: [
      "You are Open Maintainer PR Review.",
      "Return JSON that satisfies the supplied schema.",
      "Only produce findings grounded in concrete repository evidence.",
      "Every finding must cite one or more known evidence items.",
      "Do not emit generic style, maintainability, or best-practice critique.",
      "If evidence is weak, put it in residualRisk instead of findings.",
    ].join("\n"),
    user: JSON.stringify(
      {
        task: "Review this pull request against approved repo context and precomputed repository evidence.",
        citationRules: [
          "changed_file citations must use a changed file path.",
          "repo_profile citations must use a profile evidence, command, config, workflow, doc, or lockfile path.",
          "open_maintainer_config citations must use .open-maintainer.yml.",
          "generated_context citations must use a generated context artifact path.",
          "repo_skill citations must use a repo-local skill path.",
          "ci_status citations must use an observed check name.",
          "issue_acceptance_criteria citations must use #<issue-number>.",
          "user_input citations must use pull_request_body.",
        ],
        pullRequest: {
          number: input.input.prNumber,
          title: input.input.title,
          body: input.input.body,
          author: input.input.author,
          baseRef: input.input.baseRef,
          headRef: input.input.headRef,
        },
        profile: profileSummary,
        openMaintainerRules: input.rules ?? [],
        openMaintainerConfig: input.promptContext?.openMaintainerConfig ?? null,
        generatedContext: input.promptContext?.generatedContext ?? null,
        repoPrReviewSkill: input.promptContext?.repoSkill ?? null,
        changedFiles,
        checkStatuses: input.input.checkStatuses,
        issueContext,
        precheck,
        outputRequirements: {
          maxFindings: 10,
          severities: ["blocker", "major", "minor", "note"],
          invalidFindings: "Move uncited or generic concerns to residualRisk.",
        },
      },
      null,
      2,
    ),
  };
}

export function parseModelReviewOutput(text: string): ModelReviewOutput {
  const parsed = JSON.parse(text) as unknown;
  return ModelReviewOutputSchema.parse(parsed);
}

function validateModelFindings(input: {
  input: ReviewInput;
  profile: RepoProfile;
  findings: ModelReviewOutput["findings"];
}): { findings: ReviewFinding[]; residualRisk: string[] } {
  const findings: ReviewFinding[] = [];
  const residualRisk: string[] = [];
  input.findings.forEach((finding, index) => {
    const unknown = finding.citations.filter(
      (citation) =>
        !isKnownCitation({
          citation,
          input: input.input,
          profile: input.profile,
        }),
    );
    if (unknown.length > 0) {
      residualRisk.push(
        `Model finding "${finding.title}" was not rendered because it cited unknown evidence.`,
      );
      return;
    }
    findings.push(
      ReviewFindingSchema.parse({
        ...finding,
        id: finding.id ?? `model-${slugify(finding.title)}-${index + 1}`,
      }),
    );
  });
  return { findings, residualRisk };
}

function isKnownCitation(input: {
  citation: ReviewEvidenceCitation;
  input: ReviewInput;
  profile: RepoProfile;
}): boolean {
  const path = input.citation.path;
  switch (input.citation.source) {
    case "changed_file":
      return (
        path !== null &&
        input.input.changedFiles.some(
          (file) => file.path === path || file.previousPath === path,
        )
      );
    case "repo_profile":
      return path !== null && knownProfilePaths(input.profile).has(path);
    case "open_maintainer_config":
      return path === ".open-maintainer.yml";
    case "generated_context":
      return path !== null && isKnownGeneratedContextPath(path, input.profile);
    case "repo_skill":
      return path?.startsWith(".agents/skills/") ?? false;
    case "ci_status":
      return (
        path !== null &&
        input.input.checkStatuses.some((check) => check.name === path)
      );
    case "issue_acceptance_criteria":
      return (
        path !== null &&
        input.input.issueContext.some((issue) => path === `#${issue.number}`)
      );
    case "user_input":
      return path === "pull_request_body";
  }
}

function knownProfilePaths(profile: RepoProfile): Set<string> {
  return new Set([
    ...profile.evidence.map((item) => item.path),
    ...profile.commands.map((item) => item.source),
    ...profile.ciWorkflows,
    ...profile.importantDocs,
    ...profile.generatedFilePaths,
    ...profile.existingContextFiles,
    ...profile.workspaceManifests,
    ...profile.lockfiles,
    ...profile.configFiles,
    ".open-maintainer/profile.json",
  ]);
}

function isKnownGeneratedContextPath(path: string, profile: RepoProfile) {
  return (
    path === "AGENTS.md" ||
    path.startsWith(".open-maintainer/") ||
    profile.generatedFilePaths.includes(path) ||
    profile.generatedFileHints.includes(path)
  );
}

function compareFindingSeverity(a: ReviewFinding, b: ReviewFinding): number {
  const severityOrder: Record<ReviewSeverity, number> = {
    blocker: 0,
    major: 1,
    minor: 2,
    note: 3,
  };
  return severityOrder[a.severity] - severityOrder[b.severity];
}

function modelMergeReadiness(
  model?: ModelReviewOutput["mergeReadiness"],
): ReviewMergeReadiness {
  if (!model) {
    return {
      status: "unknown",
      reason: "Model output did not include merge readiness.",
      evidence: [],
    };
  }
  return {
    status: model.status,
    reason: model.reason,
    evidence: [],
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
