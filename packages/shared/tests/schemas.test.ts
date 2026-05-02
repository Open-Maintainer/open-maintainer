import { describe, expect, it } from "vitest";
import {
  NotEvaluatedContributionTriage,
  RepoProfileSchema,
  ReviewContributionTriageSchema,
  ReviewFeedbackSchema,
  nowIso,
} from "../src";

describe("shared schemas", () => {
  it("validates a versioned repo profile", () => {
    const profile = RepoProfileSchema.parse({
      id: "profile_1",
      repoId: "repo_1",
      version: 1,
      owner: "ametel01",
      name: "open-maintainer",
      defaultBranch: "main",
      primaryLanguages: ["TypeScript"],
      frameworks: ["Next.js"],
      packageManager: "bun",
      commands: [],
      ciWorkflows: [],
      importantDocs: ["README.md"],
      architecturePathGroups: ["apps"],
      generatedFileHints: ["AGENTS.md"],
      generatedFilePaths: [],
      existingContextFiles: [],
      detectedRiskAreas: [],
      riskHintPaths: [],
      ownershipHints: [],
      environmentFiles: [],
      environmentVariables: [],
      ignoreFiles: [".gitignore"],
      testFilePaths: ["tests/index.test.ts"],
      reviewRuleCandidates: [],
      evidence: [{ path: "README.md", reason: "project overview" }],
      workspaceManifests: ["package.json"],
      lockfiles: ["bun.lock"],
      configFiles: ["tsconfig.json"],
      agentReadiness: {
        score: 40,
        categories: [
          {
            name: "setup clarity",
            score: 20,
            maxScore: 20,
            missing: [],
            evidence: [{ path: "README.md", reason: "project overview" }],
          },
        ],
        missingItems: [],
        generatedAt: nowIso(),
      },
      createdAt: nowIso(),
    });

    expect(profile.version).toBe(1);
  });

  it("validates PR review feedback verdicts", () => {
    for (const verdict of [
      "false_positive",
      "accepted",
      "needs_more_context",
      "unclear",
    ]) {
      const feedback = ReviewFeedbackSchema.parse({
        findingId: "missing-validation-evidence",
        verdict,
        reason: verdict === "false_positive" ? "Covered by CI." : null,
        actor: "maintainer",
        createdAt: nowIso(),
      });

      expect(feedback.verdict).toBe(verdict);
    }

    expect(() =>
      ReviewFeedbackSchema.parse({
        findingId: "missing-validation-evidence",
        verdict: "ignored",
        reason: null,
        actor: null,
        createdAt: nowIso(),
      }),
    ).toThrow();
  });

  it("validates contribution triage category boundaries", () => {
    const evaluated = ReviewContributionTriageSchema.parse({
      status: "evaluated",
      category: "needs_author_input",
      recommendation: "Ask the author for validation evidence.",
      evidence: [
        {
          source: "user_input",
          path: null,
          excerpt: "No validation listed.",
          reason: "PR body lacks validation evidence.",
        },
      ],
      missingInformation: ["Validation command output"],
      requiredActions: ["Add validation evidence to the PR description."],
    });

    expect(evaluated.category).toBe("needs_author_input");
    expect(
      ReviewContributionTriageSchema.parse(NotEvaluatedContributionTriage)
        .status,
    ).toBe("not_evaluated");
    expect(() =>
      ReviewContributionTriageSchema.parse({
        status: "evaluated",
        category: "authorship_detection",
        recommendation: "Guess whether AI wrote this.",
        evidence: [],
        missingInformation: [],
        requiredActions: [],
      }),
    ).toThrow();
    expect(() =>
      ReviewContributionTriageSchema.parse({
        ...NotEvaluatedContributionTriage,
        category: "ready_for_review",
      }),
    ).toThrow();
  });
});
