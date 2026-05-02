import type { RepoProfile, ReviewInput } from "@open-maintainer/shared";
import { describe, expect, it } from "vitest";
import {
  buildReviewEvidencePrecheck,
  classifyChangedSurface,
  detectValidationEvidence,
  inferExpectedValidation,
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
    {
      name: "build",
      command: "cd apps/cli && tsc -p tsconfig.json",
      source: "apps/cli/package.json",
    },
    {
      name: "smoke:compose",
      command: "bun run tests/smoke/compose-smoke.ts",
      source: "package.json",
    },
  ],
  ciWorkflows: [".github/workflows/ci.yml"],
  importantDocs: ["README.md", "docs/DEMO_RUNBOOK.md"],
  repoTemplates: [],
  architecturePathGroups: ["apps/cli", "packages/review"],
  generatedFileHints: ["AGENTS.md"],
  generatedFilePaths: [],
  existingContextFiles: ["AGENTS.md"],
  detectedRiskAreas: [],
  riskHintPaths: ["apps/api/src/auth"],
  ownershipHints: [],
  environmentFiles: [],
  environmentVariables: [],
  ignoreFiles: [],
  testFilePaths: ["packages/review/tests/precheck.test.ts"],
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
  prNumber: 42,
  title: "Add CLI review mode",
  body: "This changes CLI behavior.",
  url: "https://github.com/Open-Maintainer/open-maintainer/pull/42",
  author: "maintainer",
  baseRef: "main",
  headRef: "feature",
  baseSha: "base-sha",
  headSha: "head-sha",
  changedFiles: [
    {
      path: "apps/cli/src/index.ts",
      status: "modified",
      additions: 12,
      deletions: 4,
      patch: "@@ cli",
      previousPath: null,
    },
    {
      path: "packages/review/src/index.ts",
      status: "modified",
      additions: 40,
      deletions: 2,
      patch: "@@ review",
      previousPath: null,
    },
  ],
  commits: ["commit-1"],
  checkStatuses: [],
  issueContext: [],
  existingComments: [],
  skippedFiles: [],
  createdAt: "2026-05-02T00:00:00.000Z",
};

describe("review evidence precheck", () => {
  it("classifies changed surfaces from paths", () => {
    expect(classifyChangedSurface(reviewInput, profile)).toEqual([
      "cli",
      "package:review",
    ]);
  });

  it("infers expected validation from profile commands and rules", () => {
    const expected = inferExpectedValidation({
      profile,
      input: reviewInput,
      changedSurface: ["cli", "package:review"],
      rules: profile.reviewRuleCandidates,
    });

    expect(expected.map((item) => item.command)).toEqual([
      "vitest run",
      "tsc -b",
      "cd apps/cli && tsc -p tsconfig.json",
    ]);
    expect(expected.every((item) => item.evidence.length > 0)).toBe(true);
  });

  it("detects validation evidence from PR body and check names", () => {
    const expected = inferExpectedValidation({
      profile,
      input: {
        ...reviewInput,
        body: "Validation: vitest run",
        checkStatuses: [
          {
            name: "typecheck",
            status: "completed",
            conclusion: "success",
            url: null,
          },
        ],
      },
      changedSurface: ["package:review"],
    });

    const evidence = detectValidationEvidence(
      {
        ...reviewInput,
        body: "Validation: vitest run",
        checkStatuses: [
          {
            name: "typecheck",
            status: "completed",
            conclusion: "success",
            url: null,
          },
        ],
      },
      expected,
    );

    expect(evidence).toContain("PR body mentions `vitest run`.");
    expect(evidence).toContain("Check `typecheck` reported success.");
  });

  it("computes prompt evidence for validation, docs impact, and risk", () => {
    const precheck = buildReviewEvidencePrecheck({
      profile,
      input: reviewInput,
      rules: profile.reviewRuleCandidates,
    });

    expect(precheck.expectedValidation.length).toBeGreaterThan(0);
    expect(precheck.validationEvidence).toEqual([]);
    expect(precheck.docsImpact.map((item) => item.path)).toEqual([
      "README.md",
      "docs/DEMO_RUNBOOK.md",
    ]);
    expect(
      precheck.expectedValidation.every((item) => item.evidence.length > 0),
    ).toBe(true);
    expect(precheck.riskAnalysis).toEqual([
      "No risk path or skipped-file risk was detected before model review.",
    ]);
  });

  it("classifies docs-only changes without generating review findings", () => {
    const precheck = buildReviewEvidencePrecheck({
      profile,
      input: {
        ...reviewInput,
        body: "Docs only",
        changedFiles: [
          {
            path: "docs/ROADMAP.md",
            status: "modified",
            additions: 1,
            deletions: 1,
            patch: "@@ docs",
            previousPath: null,
          },
        ],
      },
    });

    expect(precheck.changedSurface).toEqual(["docs"]);
    expect(precheck.expectedValidation).toEqual([]);
    expect(precheck.docsImpact).toEqual([]);
  });
});
