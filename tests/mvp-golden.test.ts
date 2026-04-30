import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeRepo, scanRepository } from "@open-maintainer/analyzer";
import {
  createContextArtifacts,
  defaultArtifactTargets,
  deterministicContextOutput,
} from "@open-maintainer/context";
import { describe, expect, it } from "vitest";

const fixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/low-context-ts",
);

describe("MVP fixture golden output", () => {
  it("keeps profile, readiness, and artifact markers repo-specific", async () => {
    const files = await scanRepository(fixtureRoot);
    const profile = analyzeRepo({
      repoId: "fixture",
      owner: "demo",
      name: "widget-api",
      defaultBranch: "main",
      version: 1,
      files,
    });
    const artifacts = createContextArtifacts({
      repoId: "fixture",
      profile,
      output: deterministicContextOutput(profile),
      modelProvider: null,
      model: null,
      nextVersion: 1,
      targets: defaultArtifactTargets,
    });
    const improvedProfile = analyzeRepo({
      repoId: "fixture",
      owner: "demo",
      name: "widget-api",
      defaultBranch: "main",
      version: 2,
      files: [
        ...files,
        ...artifacts.map((artifact) => ({
          path: artifact.type,
          content: artifact.content,
        })),
      ],
    });

    expect(profile.agentReadiness.score).toBeLessThan(
      improvedProfile.agentReadiness.score,
    );
    expect(artifacts.map((artifact) => artifact.type)).toEqual([
      "AGENTS.md",
      ".open-maintainer.yml",
      ".agents/skills/repo-overview/SKILL.md",
      ".agents/skills/testing-workflow/SKILL.md",
      ".agents/skills/pr-review/SKILL.md",
      ".open-maintainer/profile.json",
      ".open-maintainer/report.md",
    ]);
    expect(
      artifacts.find((artifact) => artifact.type === "AGENTS.md")?.content,
    ).toContain("widget-api");
    expect(
      artifacts.find((artifact) => artifact.type === "AGENTS.md")?.content,
    ).toContain("test: vitest run");
    expect(
      artifacts.find(
        (artifact) => artifact.type === ".open-maintainer/report.md",
      )?.content,
    ).toContain("Agent Readiness:");
  });
});
