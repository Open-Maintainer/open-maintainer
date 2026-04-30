import { describe, expect, it } from "vitest";
import { RepoProfileSchema, nowIso } from "../src";

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
      existingContextFiles: [],
      detectedRiskAreas: [],
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
});
