import { describe, expect, it } from "vitest";
import {
  DefaultIssueTriageLabelMappings,
  IssueTriageAgentReadinessSchema,
  IssueTriageLabelIntentSchema,
  IssueTriageModelResultSchema,
  IssueTriageResultSchema,
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

  it("validates issue triage model results and rejects unknown categories", () => {
    const result = IssueTriageModelResultSchema.parse({
      classification: "needs_author_input",
      agentReadiness: "not_agent_ready",
      confidence: 0.76,
      riskFlags: ["unclear_scope", "missing_validation"],
      labelIntents: ["needs_author_input", "needs_validation"],
      recommendation: "Ask the author for a reproduction and validation plan.",
      rationale: "The issue states the symptom but omits a reproducible path.",
      evidence: [
        {
          source: "github_issue",
          path: null,
          url: "https://github.com/Open-Maintainer/open-maintainer/issues/1",
          excerpt: "It fails sometimes.",
          reason: "Issue body is too vague for implementation.",
        },
      ],
      missingInformation: ["Minimal reproduction"],
      requiredAuthorActions: ["Add steps to reproduce."],
      nextAction: "Request author input before agent handoff.",
      commentPreview: {
        marker: "<!-- open-maintainer:issue-triage -->",
        summary: "Needs author input.",
        body: "Please add a minimal reproduction.",
        artifactPath: ".open-maintainer/triage/issues/1.json",
      },
    });

    expect(result.classification).toBe("needs_author_input");
    expect(result.taskBrief.status).toBe("not_generated");

    expect(() =>
      IssueTriageModelResultSchema.parse({
        ...result,
        classification: "authorship_detection",
      }),
    ).toThrow();
    expect(() =>
      IssueTriageModelResultSchema.parse({
        ...result,
        agentReadiness: "bot_ready",
      }),
    ).toThrow();
  });

  it("requires model-backed issue triage results to cite evidence", () => {
    expect(() =>
      IssueTriageModelResultSchema.parse({
        classification: "ready_for_review",
        agentReadiness: "agent_ready",
        confidence: 0.92,
        riskFlags: [],
        labelIntents: ["ready_for_review", "agent_ready"],
        recommendation: "Ready for maintainer review.",
        rationale: "The issue has scope, acceptance criteria, and validation.",
        evidence: [],
        missingInformation: [],
        requiredAuthorActions: [],
        nextAction: "Prepare an agent task brief.",
        commentPreview: {
          marker: "<!-- open-maintainer:issue-triage -->",
          summary: "Ready for review.",
          body: "This issue appears ready for review.",
          artifactPath: ".open-maintainer/triage/issues/2.json",
        },
      }),
    ).toThrow();
  });

  it("defines default issue triage label mappings and rejects unknown intents", () => {
    expect(DefaultIssueTriageLabelMappings.needs_author_input).toBe(
      "open-maintainer/needs-author-input",
    );
    expect(IssueTriageLabelIntentSchema.parse("duplicate_candidate")).toBe(
      "duplicate_candidate",
    );
    expect(() =>
      IssueTriageLabelIntentSchema.parse("please_merge_fast"),
    ).toThrow();
  });

  it("keeps issue classification separate from agent readiness", () => {
    expect(IssueTriageAgentReadinessSchema.parse("needs_human_design")).toBe(
      "needs_human_design",
    );
    expect(() =>
      IssueTriageResultSchema.parse({
        id: "triage_1",
        repoId: "repo_1",
        issueNumber: 3,
        classification: "ready_for_review",
        confidence: 0.9,
        riskFlags: [],
        labelIntents: ["ready_for_review"],
        recommendation: "Ready for review.",
        rationale: "The issue is bounded.",
        evidence: [
          {
            source: "github_issue",
            path: null,
            url: null,
            excerpt: "Add batch issue triage.",
            reason: "Issue body supplies the requested behavior.",
          },
        ],
        missingInformation: [],
        requiredAuthorActions: [],
        nextAction: "Generate a task brief.",
        commentPreview: {
          marker: "<!-- open-maintainer:issue-triage -->",
          summary: "Ready for review.",
          body: "This issue appears ready for review.",
          artifactPath: null,
        },
        writeActions: [],
        modelProvider: "codex-cli",
        model: "codex",
        consentMode: "explicit_repository_content_transfer",
        sourceProfileVersion: 1,
        contextArtifactVersion: null,
        createdAt: nowIso(),
      }),
    ).toThrow();
  });
});
