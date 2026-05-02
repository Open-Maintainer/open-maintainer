import type {
  ModelProviderConfig,
  RepoProfile,
  ReviewInput,
} from "@open-maintainer/shared";
import { describe, expect, it } from "vitest";
import {
  buildReviewPrompt,
  generateDeterministicReview,
  generateReview,
  modelReviewOutputJsonSchema,
  parseModelReviewOutput,
} from "../src";

const profile: RepoProfile = {
  id: "profile_1",
  repoId: "repo_1",
  version: 1,
  owner: "Open-Maintainer",
  name: "open-maintainer",
  defaultBranch: "main",
  primaryLanguages: ["TypeScript"],
  frameworks: ["vitest"],
  packageManager: "bun",
  commands: [
    { name: "test", command: "vitest run", source: "package.json" },
    { name: "typecheck", command: "tsc -b", source: "package.json" },
  ],
  ciWorkflows: [".github/workflows/ci.yml"],
  importantDocs: ["README.md"],
  repoTemplates: [],
  architecturePathGroups: ["packages/review"],
  generatedFileHints: ["AGENTS.md"],
  generatedFilePaths: [],
  existingContextFiles: ["AGENTS.md"],
  detectedRiskAreas: [],
  riskHintPaths: ["packages/review/src"],
  ownershipHints: [],
  environmentFiles: [],
  environmentVariables: [],
  ignoreFiles: [],
  testFilePaths: ["packages/review/tests/model.test.ts"],
  reviewRuleCandidates: [
    "Run `vitest run` before finishing changes that affect test.",
  ],
  evidence: [{ path: "package.json", reason: "package manifest" }],
  workspaceManifests: ["package.json"],
  lockfiles: ["bun.lock"],
  configFiles: ["tsconfig.json"],
  trackedFileHashes: [],
  contextArtifactHashes: [],
  agentReadiness: {
    score: 100,
    categories: [],
    missingItems: [],
    generatedAt: "2026-05-02T00:00:00.000Z",
  },
  createdAt: "2026-05-02T00:00:00.000Z",
};

const reviewInput: ReviewInput = {
  repoId: "repo_1",
  owner: "Open-Maintainer",
  repo: "open-maintainer",
  prNumber: 43,
  title: "Add review prompt",
  body: "Validation: vitest run",
  url: "https://github.com/Open-Maintainer/open-maintainer/pull/43",
  author: "maintainer",
  baseRef: "main",
  headRef: "feature",
  baseSha: "base-sha",
  headSha: "head-sha",
  changedFiles: [
    {
      path: "packages/review/src/model.ts",
      status: "added",
      additions: 80,
      deletions: 0,
      patch: "@@ model",
      previousPath: null,
    },
  ],
  commits: ["commit-1"],
  checkStatuses: [
    {
      name: "test",
      status: "completed",
      conclusion: "success",
      url: "https://github.com/Open-Maintainer/open-maintainer/actions/1",
    },
  ],
  issueContext: [
    {
      number: 43,
      title: "Add model-backed PR review",
      body: "## Acceptance criteria\n\n- Provider output must cite evidence.",
      acceptanceCriteria: ["Provider output must cite evidence."],
      url: "https://github.com/Open-Maintainer/open-maintainer/issues/43",
    },
  ],
  existingComments: [],
  skippedFiles: [],
  createdAt: "2026-05-02T00:00:00.000Z",
};

const consentedProvider: ModelProviderConfig = {
  id: "model_provider_1",
  kind: "local-openai-compatible",
  displayName: "Mock Provider",
  baseUrl: "http://localhost/v1",
  model: "mock-model",
  encryptedApiKey: "encrypted",
  repoContentConsent: true,
  createdAt: "2026-05-02T00:00:00.000Z",
  updatedAt: "2026-05-02T00:00:00.000Z",
};

describe("model-backed review", () => {
  it("uses an OpenAI strict-compatible output schema", () => {
    const invalidPaths = collectObjectsMissingRequiredProperties(
      modelReviewOutputJsonSchema,
    );

    expect(invalidPaths).toEqual([]);
  });

  it("builds a prompt from deterministic review, repo context, and PR evidence", () => {
    const deterministicReview = generateDeterministicReview({
      profile,
      input: reviewInput,
      rules: profile.reviewRuleCandidates,
    });

    const prompt = buildReviewPrompt({
      profile,
      input: reviewInput,
      deterministicReview,
      rules: profile.reviewRuleCandidates,
      promptContext: {
        openMaintainerConfig: "qualityRules:\n  - Run vitest",
        generatedContext: "AGENTS.md says run validation.",
        repoSkill: "PR review skill content.",
      },
    });

    expect(prompt.system).toContain("Only produce findings grounded");
    expect(prompt.user).toContain("packages/review/src/model.ts");
    expect(prompt.user).toContain("Provider output must cite evidence.");
    expect(prompt.user).toContain("repoPrReviewSkill");
  });

  it("rejects malformed provider output before it is used", () => {
    expect(() => parseModelReviewOutput("{not json")).toThrow();
    expect(() =>
      parseModelReviewOutput(JSON.stringify({ findings: "bad" })),
    ).toThrow();
  });

  it("falls back to deterministic review when no provider is configured", async () => {
    const review = await generateReview({
      profile,
      input: reviewInput,
      rules: profile.reviewRuleCandidates,
    });

    expect(review.modelProvider).toBeNull();
    expect(review.changedSurface).toEqual(["package:review", "risk"]);
  });

  it("requires repo-content consent before provider review", async () => {
    const provider = {
      complete: async () => {
        throw new Error("provider should not be called");
      },
    };

    await expect(
      generateReview({
        profile,
        input: reviewInput,
        provider,
        providerConfig: { ...consentedProvider, repoContentConsent: false },
      }),
    ).rejects.toThrow(/consent/);
  });

  it("keeps cited model findings and records provider metadata", async () => {
    const review = await generateReview({
      profile,
      input: reviewInput,
      rules: profile.reviewRuleCandidates,
      providerConfig: consentedProvider,
      provider: {
        complete: async (_input, options) => {
          expect(options?.outputSchema).toBeTruthy();
          return {
            model: "mock-review-model",
            text: JSON.stringify({
              summary: "Model-backed review summary.",
              findings: [
                {
                  title: "Review source needs focused coverage",
                  severity: "minor",
                  body: "The new review source should stay covered by focused tests.",
                  path: "packages/review/src/model.ts",
                  line: null,
                  citations: [
                    {
                      source: "changed_file",
                      path: "packages/review/src/model.ts",
                      excerpt: "@@ model",
                      reason: "Changed review model source.",
                    },
                    {
                      source: "issue_acceptance_criteria",
                      path: "#43",
                      excerpt: "Provider output must cite evidence.",
                      reason: "Linked issue acceptance criteria.",
                    },
                  ],
                },
              ],
              mergeReadiness: {
                status: "needs_attention",
                reason: "Model finding needs maintainer review.",
                evidence: ["#43"],
              },
              residualRisk: ["Provider output is bounded by cited evidence."],
            }),
          };
        },
      },
    });

    expect(review.modelProvider).toBe("Mock Provider");
    expect(review.model).toBe("mock-review-model");
    expect(review.summary).toBe("Model-backed review summary.");
    expect(review.findings.some((item) => item.title.includes("focused"))).toBe(
      true,
    );
    expect(review.residualRisk).toContain(
      "Provider output is bounded by cited evidence.",
    );
  });

  it("moves findings with unknown citations into residual risk", async () => {
    const review = await generateReview({
      profile,
      input: reviewInput,
      providerConfig: consentedProvider,
      provider: {
        complete: async () => ({
          model: "mock-review-model",
          text: JSON.stringify({
            findings: [
              {
                title: "Generic concern",
                severity: "major",
                body: "This cites a file outside the known review input.",
                path: null,
                line: null,
                citations: [
                  {
                    source: "changed_file",
                    path: "apps/api/src/app.ts",
                    excerpt: null,
                    reason: "Unknown file.",
                  },
                ],
              },
            ],
            residualRisk: [],
          }),
        }),
      },
    });

    expect(review.findings.map((item) => item.title)).not.toContain(
      "Generic concern",
    );
    expect(review.residualRisk).toContain(
      'Model finding "Generic concern" was not rendered because it cited unknown evidence.',
    );
  });
});

function collectObjectsMissingRequiredProperties(
  schema: unknown,
  path = "$",
): string[] {
  if (!schema || typeof schema !== "object") {
    return [];
  }
  const objectSchema = schema as {
    type?: unknown;
    properties?: Record<string, unknown>;
    required?: unknown;
    items?: unknown;
    anyOf?: unknown[];
  };
  const failures: string[] = [];
  if (
    objectSchema.type === "object" &&
    objectSchema.properties &&
    Array.isArray(objectSchema.required)
  ) {
    const required = new Set(objectSchema.required);
    const missing = Object.keys(objectSchema.properties).filter(
      (property) => !required.has(property),
    );
    if (missing.length > 0) {
      failures.push(`${path}: ${missing.join(", ")}`);
    }
  }
  if (objectSchema.properties) {
    for (const [key, childSchema] of Object.entries(objectSchema.properties)) {
      failures.push(
        ...collectObjectsMissingRequiredProperties(
          childSchema,
          `${path}.properties.${key}`,
        ),
      );
    }
  }
  if (objectSchema.items) {
    failures.push(
      ...collectObjectsMissingRequiredProperties(
        objectSchema.items,
        `${path}.items`,
      ),
    );
  }
  if (Array.isArray(objectSchema.anyOf)) {
    objectSchema.anyOf.forEach((childSchema, index) => {
      failures.push(
        ...collectObjectsMissingRequiredProperties(
          childSchema,
          `${path}.anyOf.${index}`,
        ),
      );
    });
  }
  return failures;
}
