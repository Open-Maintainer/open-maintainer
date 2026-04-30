import { parseOpenMaintainerConfig } from "@open-maintainer/config";
import type { RepoProfile } from "@open-maintainer/shared";
import { describe, expect, it } from "vitest";
import {
  createContextArtifacts,
  renderAgentsMd,
  renderOpenMaintainerYaml,
} from "../src";

const profile: RepoProfile = {
  id: "profile_1",
  repoId: "repo_1",
  version: 2,
  owner: "acme",
  name: "tool",
  defaultBranch: "main",
  primaryLanguages: ["TypeScript"],
  frameworks: ["Next.js"],
  packageManager: "bun",
  commands: [{ name: "test", command: "bun test", source: "package.json" }],
  ciWorkflows: [],
  importantDocs: ["README.md"],
  architecturePathGroups: ["apps"],
  generatedFileHints: ["AGENTS.md"],
  existingContextFiles: [],
  detectedRiskAreas: [],
  reviewRuleCandidates: [
    "Run `bun test` before finishing changes that affect test.",
  ],
  evidence: [{ path: "README.md", reason: "overview" }],
  createdAt: "2026-04-30T00:00:00.000Z",
};

describe("context renderers", () => {
  it("renders AGENTS.md from structured output", () => {
    const rendered = renderAgentsMd(profile, {
      summary: "A repo.",
      qualityRules: ["Use Bun."],
      commands: ["test: bun test"],
      notes: [],
    });

    expect(rendered).toContain("# AGENTS.md instructions for acme/tool");
    expect(rendered).toContain("- Use Bun.");
  });

  it("renders valid .open-maintainer.yml", () => {
    const rendered = renderOpenMaintainerYaml(profile, 5, ["Use Bun."]);

    expect(parseOpenMaintainerConfig(rendered).repo.profileVersion).toBe(2);
  });

  it("creates immutable artifact records with source profile linkage", () => {
    const artifacts = createContextArtifacts({
      repoId: "repo_1",
      profile,
      output: {
        summary: "A repo.",
        qualityRules: ["Use Bun."],
        commands: ["test: bun test"],
        notes: [],
      },
      modelProvider: "local",
      model: "llama",
      nextVersion: 1,
    });

    expect(artifacts).toHaveLength(2);
    expect(
      artifacts.every((artifact) => artifact.sourceProfileVersion === 2),
    ).toBe(true);
  });
});
