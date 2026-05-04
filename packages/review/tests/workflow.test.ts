import type { CompletionInput, ModelProvider } from "@open-maintainer/ai";
import type {
  ModelProviderConfig,
  RepoProfile,
  ReviewInput,
} from "@open-maintainer/shared";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type PullRequestReviewWorkflowDeps,
  createPullRequestReviewWorkflow,
} from "../src";

const providerConfig: ModelProviderConfig = {
  id: "model_provider_test",
  kind: "codex-cli",
  displayName: "Test Provider",
  baseUrl: "http://localhost",
  model: "gpt-test",
  encryptedApiKey: "test",
  repoContentConsent: true,
  createdAt: "2026-05-04T00:00:00.000Z",
  updatedAt: "2026-05-04T00:00:00.000Z",
};

const provider: ModelProvider = {
  async complete(input) {
    observedPrompts.push(input);
    return {
      model: "gpt-test",
      text: JSON.stringify({
        summary: {
          overview: "The PR changes one source file.",
          changedSurfaces: ["package:review"],
          riskLevel: "medium",
          validationSummary: "Validation evidence is present.",
          docsSummary: "No docs impact was found.",
        },
        findings: [
          {
            severity: "major",
            category: "tests",
            title: "Cover the changed behavior",
            file: "src/index.ts",
            line: 2,
            evidence: [
              {
                id: "patch:1",
                kind: "patch",
                summary: "Changed return value.",
              },
            ],
            impact: "The behavior can regress without focused coverage.",
            recommendation: "Add or adjust a focused regression test.",
          },
        ],
        contributionTriage: {
          category: "ready_for_review",
          recommendation: "Review the focused implementation.",
          evidence: [
            {
              id: "patch:1",
              kind: "patch",
              summary: "The diff is bounded to one file.",
            },
          ],
          missingInformation: [],
          requiredActions: [],
        },
        mergeReadiness: {
          status: "conditionally_ready",
          reason: "Review after validation is confirmed.",
          requiredActions: ["Confirm focused tests."],
        },
        residualRisk: [
          {
            risk: "Local fake checks do not prove CI behavior.",
            reason: "The test uses in-memory ports.",
            suggestedFollowUp: "Run repository validation.",
          },
        ],
      }),
    };
  },
};

const observedPrompts: CompletionInput[] = [];

describe("pull request review workflow", () => {
  beforeEach(() => {
    observedPrompts.length = 0;
  });

  it("publishes default PR review behavior through publisher ports", async () => {
    const published: unknown[] = [];
    const workflow = createPullRequestReviewWorkflow(
      createDeps({
        async publish(input) {
          published.push(input);
          return {
            summary: {
              action: "create",
              body: input.markdown,
              existingCommentId: null,
              commentId: 1,
              url: "https://github.com/acme/tool/pull/7#issuecomment-1",
            },
            inline: {
              comments: [
                {
                  findingId: "finding_1",
                  severity: "major",
                  path: "src/index.ts",
                  line: 2,
                  body: "inline",
                  fingerprint: "finding_1:src/index.ts:2",
                },
              ],
              skipped: [],
              reviewId: 2,
              url: "https://github.com/acme/tool/pull/7#pullrequestreview-2",
            },
            triageLabel: null,
          };
        },
      }),
    );

    const run = await workflow.reviewPullRequest({
      repoRoot: "/repo",
      pullNumber: 7,
      model: {
        provider: "codex",
        consent: { repositoryContentTransfer: true },
      },
      publication: { mode: "publish" },
    });

    expect(run.target).toEqual({
      owner: "acme",
      repo: "tool",
      pullNumber: 7,
      url: "https://github.com/acme/tool/pull/7",
      baseSha: "base-sha",
      headSha: "head-sha",
    });
    expect(run.publication.mode).toBe("published");
    expect(run.diagnostics.promptContextPaths).toEqual(["AGENTS.md"]);
    expect(run.diagnostics.changedFileCount).toBe(1);
    expect(run.diagnostics.skippedFiles).toEqual([
      { path: "dist/bundle.js", reason: "filtered" },
    ]);
    expect(published).toHaveLength(1);
    expect(published[0]).toEqual(
      expect.objectContaining({
        options: {
          summary: true,
          inline: { cap: 5 },
          triageLabel: false,
        },
      }),
    );
  });

  it("plans publication without GitHub writes", async () => {
    let publishCalled = false;
    const workflow = createPullRequestReviewWorkflow(
      createDeps({
        async plan(input) {
          return {
            summary: {
              action: "create",
              body: input.markdown,
              existingCommentId: null,
            },
            inline: {
              comments: [],
              skipped: [{ findingId: "finding", reason: "duplicate" }],
            },
            triageLabel: {
              label: "open-maintainer/ready-for-review",
              apply: true,
              createMissingLabels: false,
              labelsToCreate: [],
              labelsToRemove: [],
            },
          };
        },
        async publish() {
          publishCalled = true;
          throw new Error("publish should not be called");
        },
      }),
    );

    const run = await workflow.reviewPullRequest({
      repoRoot: "/repo",
      pullNumber: 7,
      model: {
        provider: "codex",
        consent: { repositoryContentTransfer: true },
      },
      publication: {
        mode: "plan",
        options: {
          summary: true,
          inline: { cap: 2 },
          triageLabel: { apply: true },
        },
      },
    });

    expect(publishCalled).toBe(false);
    expect(run.publication).toEqual(
      expect.objectContaining({
        mode: "planned",
        summary: expect.objectContaining({ action: "create" }),
        inline: expect.objectContaining({ comments: [] }),
        triageLabel: expect.objectContaining({
          label: "open-maintainer/ready-for-review",
        }),
      }),
    );
  });

  it.each([
    ["draft", { isDraft: true }, "PR is draft"],
    ["merge conflict", { mergeable: "CONFLICTING" }, "PR has merge conflicts"],
    [
      "dirty merge state",
      { mergeStateStatus: "DIRTY" },
      "merge state is dirty",
    ],
    [
      "requested changes",
      { reviewDecision: "CHANGES_REQUESTED" },
      "changes are requested",
    ],
    [
      "failing check",
      {
        checkStatuses: [
          {
            name: "Tests",
            status: "COMPLETED",
            conclusion: "FAILURE",
            url: "https://example.test/check",
          },
        ],
      },
      "blocking checks: Tests",
    ],
  ] as const)(
    "refuses ready-for-review label publication when PR state is blocked by %s",
    async (_name, blockedInput, expectedReason) => {
      let publisherCalled = false;
      const workflow = createPullRequestReviewWorkflow(
        createDeps({
          reviewInput: {
            ...reviewInput(),
            ...blockedInput,
          },
          async publish() {
            publisherCalled = true;
            throw new Error("publish should not be called");
          },
        }),
      );

      await expect(
        workflow.reviewPullRequest({
          repoRoot: "/repo",
          pullNumber: 7,
          model: {
            provider: "codex",
            consent: { repositoryContentTransfer: true },
          },
          publication: {
            mode: "publish",
            options: {
              triageLabel: {
                apply: true,
                createMissingLabels: true,
              },
            },
          },
        }),
      ).rejects.toThrow(expectedReason);
      expect(publisherCalled).toBe(false);
    },
  );

  it("passes prompt context into review generation", async () => {
    const workflow = createPullRequestReviewWorkflow(createDeps());

    const run = await workflow.reviewPullRequest({
      repoRoot: "/repo",
      pullNumber: 7,
      model: {
        provider: "codex",
        consent: { repositoryContentTransfer: true },
      },
      publication: {
        mode: "publish",
        options: {
          summary: false,
          inline: false,
        },
      },
    });

    expect(run.diagnostics.promptContextPaths).toEqual(["AGENTS.md"]);
    expect(observedPrompts).toHaveLength(1);
    expect(observedPrompts[0].user).toContain(
      "Run focused tests before finishing.",
    );
  });

  it("writes markdown output through the output port except in plan mode", async () => {
    const writes: Array<{ repoRoot: string; path: string; markdown: string }> =
      [];
    const workflow = createPullRequestReviewWorkflow(
      createDeps({
        output: {
          async writeMarkdown(input) {
            writes.push(input);
          },
        },
      }),
    );

    const published = await workflow.reviewPullRequest({
      repoRoot: "/repo",
      pullNumber: 7,
      model: {
        provider: "codex",
        consent: { repositoryContentTransfer: true },
      },
      publication: {
        mode: "publish",
        options: { summary: false, inline: false },
      },
      output: { markdownPath: ".open-maintainer/review.md" },
    });
    const planned = await workflow.reviewPullRequest({
      repoRoot: "/repo",
      pullNumber: 7,
      model: {
        provider: "codex",
        consent: { repositoryContentTransfer: true },
      },
      publication: {
        mode: "plan",
        options: { summary: false, inline: false },
      },
      output: { markdownPath: ".open-maintainer/review.md" },
    });

    expect(published.output).toEqual({
      markdownPath: ".open-maintainer/review.md",
      written: true,
    });
    expect(planned.output).toEqual({
      markdownPath: ".open-maintainer/review.md",
      written: false,
    });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual(
      expect.objectContaining({
        repoRoot: "/repo",
        path: ".open-maintainer/review.md",
      }),
    );
    expect(writes[0].markdown).toContain("## OpenMaintainer Review #7");
  });

  it("requires explicit repository-content transfer consent", async () => {
    const workflow = createPullRequestReviewWorkflow(createDeps());

    await expect(
      workflow.reviewPullRequest({
        repoRoot: "/repo",
        pullNumber: 7,
        model: {
          provider: "codex",
          consent: { repositoryContentTransfer: false },
        } as never,
      }),
    ).rejects.toThrow("explicit repository-content transfer consent");
  });
});

function createDeps(
  overrides: {
    reviewInput?: ReviewInput;
    plan?: PullRequestReviewWorkflowDeps["publisher"]["plan"];
    publish?: PullRequestReviewWorkflowDeps["publisher"]["publish"];
    output?: PullRequestReviewWorkflowDeps["output"];
  } = {},
): PullRequestReviewWorkflowDeps {
  return {
    repoProfile: {
      async load() {
        return repoProfile();
      },
    },
    pullRequests: {
      async fetchReviewInput() {
        return overrides.reviewInput ?? reviewInput();
      },
    },
    promptContext: {
      async load() {
        return {
          context: { agentsMd: "Run focused tests before finishing." },
          paths: ["AGENTS.md"],
        };
      },
    },
    modelProviders: {
      create() {
        return { providerConfig, provider };
      },
    },
    publisher: {
      async plan(input) {
        if (overrides.plan) {
          return overrides.plan(input);
        }
        return {
          summary: {
            action: "create",
            body: input.markdown,
            existingCommentId: null,
          },
          inline: { comments: [], skipped: [] },
          triageLabel: null,
        };
      },
      async publish(input) {
        if (overrides.publish) {
          return overrides.publish(input);
        }
        return {
          summary: null,
          inline: null,
          triageLabel: null,
        };
      },
    },
    ...(overrides.output ? { output: overrides.output } : {}),
  };
}

function repoProfile(): RepoProfile {
  return {
    id: "profile_1",
    repoId: "repo_1",
    version: 1,
    owner: "acme",
    name: "tool",
    defaultBranch: "main",
    primaryLanguages: ["TypeScript"],
    frameworks: [],
    packageManager: "bun",
    commands: [
      {
        name: "test",
        command: "bun test",
        source: "package.json",
      },
    ],
    ciWorkflows: [],
    importantDocs: ["AGENTS.md"],
    repoTemplates: [],
    architecturePathGroups: [],
    generatedFileHints: [],
    generatedFilePaths: [],
    existingContextFiles: ["AGENTS.md"],
    detectedRiskAreas: [],
    riskHintPaths: [],
    ownershipHints: [],
    environmentFiles: [],
    environmentVariables: [],
    ignoreFiles: [],
    testFilePaths: [],
    reviewRuleCandidates: ["Run `bun test`."],
    evidence: [],
    workspaceManifests: ["package.json"],
    lockfiles: [],
    configFiles: [],
    trackedFileHashes: [],
    contextArtifactHashes: [],
    agentReadiness: {
      score: 80,
      categories: [],
      missingItems: [],
      generatedAt: "2026-05-04T00:00:00.000Z",
    },
    createdAt: "2026-05-04T00:00:00.000Z",
  };
}

function reviewInput(): ReviewInput {
  return {
    repoId: "repo_1",
    owner: "acme",
    repo: "tool",
    prNumber: 7,
    title: "Change value",
    body: "Validation: bun test",
    url: "https://github.com/acme/tool/pull/7",
    author: "author",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "REVIEW_REQUIRED",
    baseRef: "main",
    headRef: "feature",
    baseSha: "base-sha",
    headSha: "head-sha",
    changedFiles: [
      {
        path: "src/index.ts",
        status: "modified",
        additions: 1,
        deletions: 1,
        patch: "@@ -1 +1\n-export const value = 1;\n+export const value = 2;",
        previousPath: null,
      },
    ],
    commits: ["head-sha"],
    checkStatuses: [
      {
        name: "Tests",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        url: "https://example.test/check",
      },
    ],
    issueContext: [],
    existingComments: [],
    skippedFiles: [{ path: "dist/bundle.js", reason: "filtered" }],
    createdAt: "2026-05-04T00:00:00.000Z",
  };
}
