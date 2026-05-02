import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeRepo, scanRepository } from "@open-maintainer/analyzer";
import {
  createContextArtifacts,
  defaultArtifactTargets,
  parseModelArtifactContent,
  parseModelSkillContent,
} from "@open-maintainer/context";
import { describe, expect, it } from "vitest";

const fixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/low-context-ts",
);

const modelArtifacts = parseModelArtifactContent(
  JSON.stringify({
    agentsMd:
      "# AGENTS.md instructions for demo/widget-api\n\nUse vitest run, inspect source files before editing, and keep widget-api changes scoped to repository evidence.",
    claudeMd:
      "# CLAUDE.md instructions for demo/widget-api\n\nUse vitest run, inspect source files before editing, and keep widget-api changes scoped to repository evidence.",
    copilotInstructions:
      "# Copilot instructions for demo/widget-api\n\nUse vitest run, inspect source files before editing, and keep widget-api changes scoped.",
    cursorRule:
      "---\ndescription: widget api rules\nalwaysApply: true\n---\n\nUse vitest run, inspect source files before editing, and keep widget-api changes scoped.",
  }),
);

const modelSkills = parseModelSkillContent(
  JSON.stringify({
    skills: [
      {
        path: ".agents/skills/widget-api-start-task/SKILL.md",
        name: "widget-api-start-task",
        description: "Use before making bounded changes in demo/widget-api.",
        markdown:
          "---\nname: widget-api-start-task\ndescription: Use before making bounded changes in demo/widget-api.\n---\n\n# Start Task\n\n## Use when\n- Starting a change.\n\n## Do not use when\n- Reviewing only.\n\n## Read first\n- README.md\n\n## Workflow\n- Read target files.\n\n## Validation\n- Run vitest run.\n\n## Documentation\n- Check README.md.\n\n## Risk checks\n- Keep edits scoped.\n\n## Done when\n- Validation is reported.",
      },
      {
        path: ".agents/skills/widget-api-testing-workflow/SKILL.md",
        name: "widget-api-testing-workflow",
        description: "Use when validating changes in demo/widget-api.",
        markdown:
          "---\nname: widget-api-testing-workflow\ndescription: Use when validating changes in demo/widget-api.\n---\n\n# Testing Workflow\n\n## Use when\n- Running checks.\n\n## Do not use when\n- Implementing unrelated features.\n\n## Read first\n- package.json\n\n## Workflow\n- Match changes to tests.\n\n## Validation\n- Run vitest run.\n\n## Documentation\n- Check README.md.\n\n## Risk checks\n- Keep tests deterministic.\n\n## Done when\n- Test evidence is reported.",
      },
      {
        path: ".agents/skills/widget-api-pr-review/SKILL.md",
        name: "widget-api-pr-review",
        description: "Use when reviewing pull requests in demo/widget-api.",
        markdown:
          "---\nname: widget-api-pr-review\ndescription: Use when reviewing pull requests in demo/widget-api.\n---\n\n# PR Review\n\n## Use when\n- Reviewing a PR.\n\n## Do not use when\n- Making code changes.\n\n## Read first\n- PR diff\n\n## Workflow\n- Cite evidence.\n\n## Validation\n- Check vitest run evidence.\n\n## Documentation\n- Check README.md.\n\n## Risk checks\n- Avoid uncited concerns.\n\n## Done when\n- Findings are grounded.",
      },
    ],
  }),
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
      output: {
        summary: "demo/widget-api fixture context.",
        qualityRules: ["Run vitest run before finishing test changes."],
        commands: ["test: vitest run"],
        notes: [],
      },
      modelArtifacts,
      modelSkills,
      modelProvider: "Codex CLI",
      model: "fake-model",
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
      ".agents/skills/widget-api-start-task/SKILL.md",
      ".agents/skills/widget-api-testing-workflow/SKILL.md",
      ".agents/skills/widget-api-pr-review/SKILL.md",
      ".open-maintainer/profile.json",
      ".open-maintainer/report.md",
    ]);
    expect(
      artifacts.find((artifact) => artifact.type === "AGENTS.md")?.content,
    ).toContain("widget-api");
    expect(
      artifacts.find((artifact) => artifact.type === "AGENTS.md")?.content,
    ).toContain("vitest run");
    expect(
      artifacts.find(
        (artifact) => artifact.type === ".open-maintainer/report.md",
      )?.content,
    ).toContain("Agent Readiness:");
  });
});
