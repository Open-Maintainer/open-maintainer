import { parseOpenMaintainerConfig } from "@open-maintainer/config";
import type { RepoProfile } from "@open-maintainer/shared";
import { describe, expect, it } from "vitest";
import {
  buildArtifactSynthesisPrompt,
  createContextArtifacts,
  parseModelArtifactContent,
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
  workspaceManifests: ["package.json"],
  lockfiles: ["bun.lock"],
  configFiles: ["tsconfig.json"],
  agentReadiness: {
    score: 47,
    categories: [
      {
        name: "setup clarity",
        score: 20,
        maxScore: 20,
        missing: [],
        evidence: [{ path: "README.md", reason: "overview" }],
      },
      {
        name: "agent instructions",
        score: 0,
        maxScore: 20,
        missing: ["AGENTS.md is missing."],
        evidence: [],
      },
    ],
    missingItems: ["agent instructions: AGENTS.md is missing."],
    generatedAt: "2026-04-30T00:00:00.000Z",
  },
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

    expect(artifacts).toHaveLength(9);
    expect(
      artifacts.every((artifact) => artifact.sourceProfileVersion === 2),
    ).toBe(true);
    expect(artifacts.map((artifact) => artifact.type)).toContain(
      ".open-maintainer/report.md",
    );
  });

  it("uses model-generated artifact bodies when provided", () => {
    const modelArtifacts = parseModelArtifactContent(
      JSON.stringify({
        agentsMd:
          "# AGENTS.md instructions for acme/tool\n\nUse the real app router, Vitest tests, and Bun workspace scripts before changing code.",
        copilotInstructions:
          "# Copilot instructions for acme/tool\n\nPrefer Bun commands and keep Next.js app-router code under apps/.",
        cursorRule:
          "---\ndescription: acme tool repo rules\nalwaysApply: true\n---\n\nUse Bun scripts and inspect app routes before editing.",
        repoOverviewSkill:
          "---\nname: repo-overview\ndescription: Use when working in acme/tool.\n---\n\n# Repo Overview\n\nNext.js app with Bun tests.",
        testingWorkflowSkill:
          "---\nname: testing-workflow\ndescription: Use when testing acme/tool.\n---\n\n# Testing Workflow\n\nRun bun test for unit coverage.",
        prReviewSkill:
          "---\nname: pr-review\ndescription: Use when reviewing acme/tool PRs.\n---\n\n# PR Review\n\nCheck Bun quality gates.",
      }),
    );
    const artifacts = createContextArtifacts({
      repoId: "repo_1",
      profile,
      output: {
        summary: "Deterministic fallback.",
        qualityRules: ["Fallback rule."],
        commands: ["fallback"],
        notes: [],
      },
      modelArtifacts,
      modelProvider: "local",
      model: "llama",
      nextVersion: 1,
      targets: ["agents", "skills"],
    });

    expect(artifacts[0]?.content).toContain("real app router");
    expect(artifacts[1]?.content).toContain("Next.js app with Bun tests");
    expect(artifacts.map((artifact) => artifact.type)).not.toContain(
      ".claude/skills/repo-overview/SKILL.md",
    );
  });

  it("emits Claude Code skills only when the claude-skills target is requested", () => {
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
      targets: ["claude-skills"],
    });

    expect(artifacts.map((artifact) => artifact.type)).toEqual([
      ".claude/skills/repo-overview/SKILL.md",
      ".claude/skills/testing-workflow/SKILL.md",
      ".claude/skills/pr-review/SKILL.md",
    ]);
  });

  it("builds artifact synthesis prompts with source excerpts", () => {
    const prompt = buildArtifactSynthesisPrompt({
      profile,
      files: [
        { path: "README.md", content: "# Tool\n\nImportant domain details." },
        { path: "src/index.ts", content: "export const ok = true;" },
      ],
    });

    expect(prompt.system).toContain("repo-specific");
    expect(prompt.user).toContain("README.md");
    expect(prompt.user).toContain("Important domain details.");
  });
});
