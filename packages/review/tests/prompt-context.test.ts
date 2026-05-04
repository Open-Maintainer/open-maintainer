import type { GeneratedArtifact } from "@open-maintainer/shared";
import { describe, expect, it } from "vitest";
import { loadReviewPromptContext } from "../src";

describe("review prompt context loader", () => {
  it("loads the common local review prompt context from a repository reader", async () => {
    const files = new Map([
      [".open-maintainer.yml", "config"],
      ["AGENTS.md", "agents"],
      [".open-maintainer/report.md", "report"],
      [".agents/skills/tool-pr-review/SKILL.md", "review skill"],
      [".agents/skills/tool-testing-workflow/SKILL.md", "testing workflow"],
      [".agents/skills/tool-start-task/SKILL.md", "start task"],
    ]);

    const result = await loadReviewPromptContext({
      profile: { name: "tool" },
      readRepoFile: async (repoPath) => files.get(repoPath),
    });

    expect(result.context).toEqual({
      openMaintainerConfig: "config",
      agentsMd: "agents",
      generatedContext: "report",
      repoPrReviewSkill: "review skill",
      repoTestingWorkflowSkill: "testing workflow",
      repoOverviewSkill: "start task",
    });
    expect(result.paths).toEqual([
      ".open-maintainer.yml",
      "AGENTS.md",
      ".agents/skills/tool-pr-review/SKILL.md",
      ".agents/skills/tool-testing-workflow/SKILL.md",
      ".agents/skills/tool-start-task/SKILL.md",
      ".open-maintainer/report.md",
    ]);
  });

  it("loads dashboard review context from generated artifacts with generic skill fallbacks", async () => {
    const result = await loadReviewPromptContext({
      profile: { name: "tool" },
      artifacts: [
        artifact("AGENTS.md", "agents"),
        artifact(".agents/skills/pr-review/SKILL.md", "generic review skill"),
        artifact(
          ".agents/skills/testing-workflow/SKILL.md",
          "generic testing workflow",
        ),
        artifact(
          ".agents/skills/repo-overview/SKILL.md",
          "generic overview skill",
        ),
        artifact(".open-maintainer/report.md", "report"),
        artifact("CLAUDE.md", "claude"),
        artifact(".github/copilot-instructions.md", "copilot"),
      ],
      includeGenericSkillFallbacks: true,
      includeGeneratedInstructionArtifacts: true,
      generatedContextPaths: [
        ".open-maintainer/report.md",
        "CLAUDE.md",
        ".github/copilot-instructions.md",
      ],
      generatedContextSource: "artifacts",
    });

    expect(result.context).toEqual({
      agentsMd: "agents",
      repoPrReviewSkill: "generic review skill",
      repoTestingWorkflowSkill: "generic testing workflow",
      repoOverviewSkill: "generic overview skill",
      copilotInstructions: "copilot",
      generatedContext: ["report", "claude", "copilot"].join("\n\n---\n\n"),
    });
    expect(result.paths).toContain(".agents/skills/pr-review/SKILL.md");
    expect(result.paths).toContain(".open-maintainer/report.md");
    expect(result.paths).toContain("CLAUDE.md");
  });

  it("prefers the latest generated artifact version", async () => {
    const result = await loadReviewPromptContext({
      profile: { name: "tool" },
      artifacts: [
        artifact("AGENTS.md", "old agents", 1),
        artifact("AGENTS.md", "new agents", 2),
      ],
    });

    expect(result.context.agentsMd).toBe("new agents");
  });
});

function artifact(
  type: GeneratedArtifact["type"],
  content: string,
  version = 1,
): GeneratedArtifact {
  return {
    id: `artifact_${version}_${type}`,
    repoId: "repo_1",
    type,
    version,
    content,
    sourceProfileVersion: 1,
    modelProvider: null,
    model: null,
    createdAt: "2026-05-05T00:00:00.000Z",
  };
}
