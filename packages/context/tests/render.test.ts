import { parseOpenMaintainerConfig } from "@open-maintainer/config";
import type { RepoProfile } from "@open-maintainer/shared";
import { describe, expect, it } from "vitest";
import {
  buildArtifactSynthesisPrompt,
  buildRepoFactsSynthesisPrompt,
  buildSkillSynthesisPrompt,
  createContextArtifacts,
  parseModelArtifactContent,
  parseModelSkillContent,
  parseStructuredRepoFacts,
  renderAgentsMd,
  renderOpenMaintainerYaml,
  structuredContextOutputFromRepoFacts,
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

const repoFacts = parseStructuredRepoFacts(
  JSON.stringify({
    summary:
      "acme/tool is a TypeScript repository using Bun and Next.js based on package metadata.",
    evidenceMap: [
      {
        claim: "Bun is used for test commands.",
        evidence: ["package.json"],
        confidence: "observed",
      },
    ],
    repositoryMap: [
      {
        path: "apps",
        purpose: "Application workspace paths.",
        evidence: ["architecturePathGroups"],
        confidence: "observed",
      },
    ],
    commands: [
      {
        name: "test",
        command: "bun test",
        scope: "tests",
        source: "package.json",
        purpose: "Run test suite.",
        confidence: "observed",
      },
    ],
    setup: {
      requirements: [
        {
          claim: "Install dependencies with Bun.",
          evidence: ["packageManager", "bun.lock"],
          confidence: "inferred",
        },
      ],
      unknowns: ["No environment example was detected."],
    },
    architecture: {
      observed: [
        {
          claim: "Application code appears under apps.",
          evidence: ["architecturePathGroups"],
          confidence: "observed",
        },
      ],
      inferred: [],
      unknowns: ["Detailed data flow was not detected."],
    },
    changeRules: {
      safeEditZones: [
        {
          claim: "Application source paths are normal edit zones.",
          evidence: ["architecturePathGroups"],
          confidence: "inferred",
        },
      ],
      carefulEditZones: [
        {
          claim: "Lockfiles require dependency-change justification.",
          evidence: ["bun.lock"],
          confidence: "observed",
        },
      ],
      doNotEditWithoutExplicitInstruction: [],
      unknowns: ["Ownership boundaries were not detected."],
    },
    testingStrategy: {
      locations: [],
      commands: [
        {
          name: "test",
          command: "bun test",
          scope: "tests",
          source: "package.json",
          purpose: "Run test suite.",
          confidence: "observed",
        },
      ],
      namingConventions: [],
      regressionExpectations: [
        "Add focused regression coverage when changing behavior.",
      ],
      unknowns: ["Test file naming conventions were not detected."],
    },
    validation: {
      canonicalCommand: {
        name: "test",
        command: "bun test",
        scope: "tests",
        source: "package.json",
        purpose: "Run test suite.",
        confidence: "observed",
      },
      scopedCommands: [],
      unknowns: [],
    },
    prRules: ["Include test evidence in PR notes."],
    knownPitfalls: [
      {
        claim: "Do not edit lockfiles unless dependencies changed.",
        evidence: ["bun.lock"],
        confidence: "observed",
      },
    ],
    generatedFiles: [],
    highRiskAreas: [],
    documentationAlignment: [
      {
        claim: "Update README.md when user-facing behavior changes.",
        evidence: ["README.md"],
        confidence: "inferred",
      },
    ],
    unknowns: ["No PR template was detected."],
  }),
);

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

    expect(artifacts).toHaveLength(7);
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
        claudeMd:
          "# CLAUDE.md instructions for acme/tool\n\nUse the real app router, Vitest tests, and Bun workspace scripts before changing code.",
        copilotInstructions:
          "# Copilot instructions for acme/tool\n\nPrefer Bun commands and keep Next.js app-router code under apps/.",
        cursorRule:
          "---\ndescription: acme tool repo rules\nalwaysApply: true\n---\n\nUse Bun scripts and inspect app routes before editing.",
      }),
    );
    const modelSkills = parseModelSkillContent(
      JSON.stringify({
        skills: [
          {
            path: ".agents/skills/tool-start-task/SKILL.md",
            name: "tool-start-task",
            description: "Use before making bounded changes in acme/tool.",
            markdown:
              "---\nname: tool-start-task\ndescription: Use before making bounded changes in acme/tool.\n---\n\n# Tool Start Task\n\n## Use when\n- Starting work.\n\n## Do not use when\n- Reviewing PRs.\n\n## Read first\n- README.md\n\n## Workflow\n- Inspect the real app router.\n\n## Validation\n- Run bun test.\n\n## Documentation\n- Check README.md.\n\n## Risk checks\n- Keep changes scoped.\n\n## Done when\n- Evidence is reported.",
          },
        ],
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
      modelSkills,
      modelProvider: "local",
      model: "llama",
      nextVersion: 1,
      targets: ["agents", "skills"],
    });

    expect(artifacts[0]?.content).toContain("real app router");
    expect(artifacts[1]?.content).toContain("real app router");
    expect(artifacts[1]?.type).toBe(".agents/skills/tool-start-task/SKILL.md");
    expect(artifacts.map((artifact) => artifact.type)).not.toContain(
      ".claude/skills/repo-overview/SKILL.md",
    );
  });

  it("parses fenced model JSON with large trailing whitespace", () => {
    const modelArtifacts = parseModelArtifactContent(
      `\`\`\`json
${JSON.stringify({
  agentsMd:
    "# AGENTS.md instructions for acme/tool\n\nUse Bun workspace scripts and inspect repository evidence before changing generated context files.",
  claudeMd:
    "# CLAUDE.md instructions for acme/tool\n\nUse Bun workspace scripts and inspect repository evidence before changing generated context files.",
  copilotInstructions:
    "# Copilot instructions for acme/tool\n\nUse Bun workspace scripts and inspect repository evidence before changing generated context files.",
  cursorRule:
    "---\ndescription: acme tool repo rules\nalwaysApply: true\n---\n\nUse Bun workspace scripts and inspect repository evidence before changing generated context files.",
})}${" ".repeat(1024)}
\`\`\``,
    );

    expect(modelArtifacts.agentsMd).toContain("Use Bun workspace scripts");
  });

  it("slugifies repeated separators without regex backtracking", () => {
    const artifacts = createContextArtifacts({
      repoId: "repo_1",
      profile: {
        ...profile,
        name: `---Open    Maintainer---${"-".repeat(1024)}Agent---`,
      },
      output: {
        summary: "A repo.",
        qualityRules: ["Use Bun."],
        commands: ["test: bun test"],
        notes: [],
      },
      modelProvider: "local",
      model: "llama",
      nextVersion: 1,
      targets: ["skills"],
    });

    expect(artifacts[0]?.type).toBe(
      ".agents/skills/open-maintainer-agent-start-task/SKILL.md",
    );
  });

  it("uses model-generated Claude instructions when requested", () => {
    const modelArtifacts = parseModelArtifactContent(
      JSON.stringify({
        agentsMd:
          "# AGENTS.md instructions for acme/tool\n\nUse the real app router, Vitest tests, and Bun workspace scripts before changing code.",
        claudeMd:
          "# CLAUDE.md instructions for acme/tool\n\nUse Claude project guidance, Bun scripts, and app-router evidence before changing code.",
        copilotInstructions:
          "# Copilot instructions for acme/tool\n\nPrefer Bun commands and keep Next.js app-router code under apps/.",
        cursorRule:
          "---\ndescription: acme tool repo rules\nalwaysApply: true\n---\n\nUse Bun scripts and inspect app routes before editing.",
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
      model: "claude",
      nextVersion: 1,
      targets: ["claude", "claude-skills"],
    });

    expect(artifacts[0]?.type).toBe("CLAUDE.md");
    expect(artifacts[0]?.content).toContain("Claude project guidance");
    expect(artifacts.map((artifact) => artifact.type)).toContain(
      ".claude/skills/tool-start-task/SKILL.md",
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
      ".claude/skills/tool-start-task/SKILL.md",
      ".claude/skills/tool-testing-workflow/SKILL.md",
      ".claude/skills/tool-pr-review/SKILL.md",
    ]);
  });

  it("builds repo facts synthesis prompts with source excerpts", () => {
    const prompt = buildRepoFactsSynthesisPrompt({
      profile,
      files: [
        { path: "README.md", content: "# Tool\n\nImportant domain details." },
        { path: "src/index.ts", content: "export const ok = true;" },
      ],
    });

    expect(prompt.system).toContain("pass 1 of a two-pass pipeline");
    expect(prompt.system).toContain("Evidence policy");
    expect(prompt.system).toContain("Unknowns beat hallucinated confidence");
    expect(prompt.user).toContain("README.md");
    expect(prompt.user).toContain("Important domain details.");
    expect(prompt.user).toContain('"labelInferences":true');
  });

  it("builds artifact synthesis prompts from structured repo facts", () => {
    const prompt = buildArtifactSynthesisPrompt({
      profile,
      repoFacts,
    });

    expect(prompt.system).toContain("repository-specific");
    expect(prompt.system).toContain("Evidence policy");
    expect(prompt.system).toContain("Unknowns and missing evidence");
    expect(prompt.system).toContain(
      "Optimize AGENTS.md for coding-agent execution",
    );
    expect(prompt.system).toContain("Agent workflow");
    expect(prompt.system).toContain("Scope control");
    expect(prompt.system).toContain("validation routing table");
    expect(prompt.system).toContain("documentation routing table");
    expect(prompt.system).toContain("Do not repeat the same command list");
    expect(prompt.system).toContain(
      "Do not fabricate a combined command such as 'make check' or 'npm run check'",
    );
    expect(prompt.user).toContain("repoFacts");
    expect(prompt.user).toContain("No PR template was detected.");
    expect(prompt.user).toContain('"sourceOfTruth":"AGENTS.md"');
    expect(prompt.user).toContain('"labelInferences":true');
    expect(prompt.user).toContain('"includeScopeControl":true');
    expect(prompt.user).toContain(
      '"targetAgentsMdLineCount":"180-250 unless unusually complex"',
    );
  });

  it("builds dedicated skill synthesis prompts from AGENTS.md and repo facts", () => {
    const prompt = buildSkillSynthesisPrompt({
      profile,
      repoFacts,
      agentsMd: "# AGENTS.md instructions for acme/tool\n\nUse Bun.",
      files: [
        { path: "README.md", content: "# Tool\n\nImportant domain details." },
      ],
    });

    expect(prompt.system).toContain(
      "A skill is not a general documentation summary",
    );
    expect(prompt.system).toContain(
      "Always generate a start-task/orientation skill",
    );
    expect(prompt.system).toContain(
      "Additionally generate up to 5 repo-specific workflow skills",
    );
    expect(prompt.system).toContain("## Do not use when");
    expect(prompt.system).toContain("## Done when");
    expect(prompt.user).toContain("AGENTS.md instructions for acme/tool");
    expect(prompt.user).toContain('"preferFewerBetterSkills":true');
    expect(prompt.user).toContain('"maxSkills":8');
  });

  it("derives deterministic fallback output from structured repo facts", () => {
    const output = structuredContextOutputFromRepoFacts(profile, repoFacts);

    expect(output.summary).toContain("acme/tool");
    expect(output.commands).toContain(
      "tests test: bun test (package.json; observed)",
    );
    expect(output.qualityRules).toContain("Include test evidence in PR notes.");
    expect(output.notes).toContain("Unknown: No PR template was detected.");
  });
});
