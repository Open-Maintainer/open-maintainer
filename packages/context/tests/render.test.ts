import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseOpenMaintainerConfig } from "@open-maintainer/config";
import type { GeneratedArtifact, RepoProfile } from "@open-maintainer/shared";
import { describe, expect, it } from "vitest";
import {
  buildArtifactSynthesisPrompt,
  buildRepoFactsSynthesisPrompt,
  buildSkillSynthesisPrompt,
  compareProfileDrift,
  contextArtifactInventoryFromFiles,
  contextArtifactTargetsForSelection,
  contributionQualityRequirementsSection,
  createContextArtifacts,
  createContextGenerationOrchestrator,
  createContextGenerationWorkflow,
  createFilesystemContextArtifactSink,
  expectedArtifactTypes,
  parseModelArtifactContent,
  parseModelSkillContent,
  parseStructuredRepoFacts,
  planArtifactWrites,
  profileFingerprint,
  renderOpenMaintainerYaml,
  structuredContextOutputFromRepoFacts,
} from "../src";
import type {
  ContextArtifactTarget,
  ContextGenerationArtifactSinkPort,
  ContextGenerationModelPort,
  ContextGenerationRepositoryPort,
  ContextGenerationStage,
  ContextGenerationWritePlan,
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
  repoTemplates: [],
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
  testFilePaths: ["tests/tool.test.ts"],
  reviewRuleCandidates: [
    "Run `bun test` before finishing changes that affect test.",
  ],
  evidence: [{ path: "README.md", reason: "overview" }],
  workspaceManifests: ["package.json"],
  lockfiles: ["bun.lock"],
  configFiles: ["tsconfig.json"],
  trackedFileHashes: [
    { path: "README.md", hash: "readme-hash" },
    { path: "package.json", hash: "package-hash" },
  ],
  contextArtifactHashes: [],
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
        maxScore: 12,
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
      {
        path: ".agents/skills/tool-testing-workflow/SKILL.md",
        name: "tool-testing-workflow",
        description: "Use when validating changes in acme/tool.",
        markdown:
          "---\nname: tool-testing-workflow\ndescription: Use when validating changes in acme/tool.\n---\n\n# Testing Workflow\n\n## Use when\n- Running validation.\n\n## Do not use when\n- Starting unrelated work.\n\n## Read first\n- package.json\n\n## Workflow\n- Match changed files to commands.\n\n## Validation\n- Run bun test.\n\n## Documentation\n- Check README.md.\n\n## Risk checks\n- Keep tests deterministic.\n\n## Done when\n- Validation evidence is reported.",
      },
      {
        path: ".agents/skills/tool-pr-review/SKILL.md",
        name: "tool-pr-review",
        description: "Use when reviewing pull requests in acme/tool.",
        markdown:
          "---\nname: tool-pr-review\ndescription: Use when reviewing pull requests in acme/tool.\n---\n\n# PR Review\n\n## Use when\n- Reviewing pull requests.\n\n## Do not use when\n- Implementing the change.\n\n## Read first\n- PR diff\n\n## Workflow\n- Ground findings in evidence.\n\n## Validation\n- Check reported commands.\n\n## Documentation\n- Check README.md.\n\n## Risk checks\n- Avoid uncited findings.\n\n## Done when\n- Findings cite concrete evidence.",
      },
    ],
  }),
);

function fakeContextGenerationModel(
  outputByStage: Partial<Record<ContextGenerationStage, string>> = {},
): ContextGenerationModelPort {
  return {
    providerLabel: "Fake model",
    model: "fake-context",
    async complete(_prompt, options) {
      const text =
        outputByStage[options.stage] ??
        {
          "repo-facts": JSON.stringify(repoFacts),
          "artifact-content": JSON.stringify(modelArtifacts),
          "skill-content": JSON.stringify(modelSkills),
        }[options.stage];
      return { text, model: `fake-${options.stage}` };
    },
  };
}

function fakeContextGenerationRepository(
  files: Array<{ path: string; content: string }>,
): ContextGenerationRepositoryPort {
  return {
    async scan(_repoRoot, options) {
      expect(options?.maxFiles).toBe(800);
      return files;
    },
    async profile() {
      return profile;
    },
  };
}

describe("context renderers", () => {
  it("requires model content for instruction artifacts", () => {
    expect(() =>
      createContextArtifacts({
        repoId: "repo_1",
        profile,
        output: structuredContextOutputFromRepoFacts(profile, repoFacts),
        modelProvider: "local",
        model: "llama",
        nextVersion: 1,
        targets: ["agents"],
      }),
    ).toThrow(/model artifact content/);
  });

  it("fingerprints profile fields that feed generated artifacts", () => {
    const withRisk = {
      ...profile,
      detectedRiskAreas: ["Do not edit lockfiles."],
    };
    const afterGeneratedContext = {
      ...profile,
      existingContextFiles: [
        "AGENTS.md",
        ".agents/skills/tool-start-task/SKILL.md",
        ".open-maintainer.yml",
      ],
      detectedRiskAreas: ["No repo-local agent context files detected."],
      evidence: [
        ...profile.evidence,
        { path: "AGENTS.md", reason: "detected repository context" },
        {
          path: ".agents/skills/tool-start-task/SKILL.md",
          reason: "detected repository context",
        },
        {
          path: ".open-maintainer.yml",
          reason: "detected repository context",
        },
      ],
      trackedFileHashes: [
        ...profile.trackedFileHashes,
        { path: "AGENTS.md", hash: "agents-hash" },
        {
          path: ".agents/skills/tool-start-task/SKILL.md",
          hash: "skill-hash",
        },
        { path: ".open-maintainer.yml", hash: "config-hash" },
      ],
      agentReadiness: {
        ...profile.agentReadiness,
        score: 79,
        categories: [
          ...profile.agentReadiness.categories,
          {
            name: "generated-file handling" as const,
            score: 12,
            maxScore: 12,
            missing: [],
            evidence: [
              {
                path: ".open-maintainer.yml",
                reason: "detected repository context",
              },
            ],
          },
        ],
        missingItems: profile.agentReadiness.missingItems.filter(
          (item) => !item.startsWith("agent instructions:"),
        ),
      },
    };
    const withDifferentTimestamp = {
      ...profile,
      createdAt: "2026-05-01T00:00:00.000Z",
      agentReadiness: {
        ...profile.agentReadiness,
        generatedAt: "2026-05-01T00:00:00.000Z",
      },
    };

    expect(profileFingerprint(withRisk)).not.toBe(profileFingerprint(profile));
    expect(profileFingerprint(afterGeneratedContext)).toBe(
      profileFingerprint(profile),
    );
    expect(profileFingerprint(withDifferentTimestamp)).toBe(
      profileFingerprint(profile),
    );
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
      modelArtifacts,
      modelSkills,
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

  it("adds deterministic contribution quality requirements to agent context", () => {
    const artifacts = createContextArtifacts({
      repoId: "repo_1",
      profile,
      output: {
        summary: "A repo.",
        qualityRules: ["Use Bun."],
        commands: ["test: bun test"],
        notes: [],
      },
      modelArtifacts,
      modelProvider: "local",
      model: "llama",
      nextVersion: 1,
      targets: ["agents", "claude"],
    });

    expect(artifacts.map((artifact) => artifact.type)).toEqual([
      "AGENTS.md",
      "CLAUDE.md",
    ]);
    expect(artifacts[0]?.content).toContain(
      contributionQualityRequirementsSection,
    );
    expect(artifacts[1]?.content).toContain(
      contributionQualityRequirementsSection,
    );
    expect(artifacts[0]?.content).toContain(
      "does not evaluate whether the author used AI",
    );
  });

  it("plans safe refreshes for generated files without overwriting maintainer-owned files", () => {
    const [agentsArtifact, configArtifact] = createContextArtifacts({
      repoId: "repo_1",
      profile,
      output: {
        summary: "A repo.",
        qualityRules: ["Use Bun."],
        commands: ["test: bun test"],
        notes: [],
      },
      modelArtifacts,
      modelProvider: "local",
      model: "llama",
      nextVersion: 1,
      targets: ["agents", "config"],
    });

    const plan = planArtifactWrites({
      artifacts: [agentsArtifact, configArtifact],
      existingPaths: new Set(["AGENTS.md", ".open-maintainer.yml"]),
      existingGeneratedPaths: new Set([".open-maintainer.yml"]),
    });

    expect(plan.map((item) => [item.path, item.action, item.reason])).toEqual([
      [
        "AGENTS.md",
        "skip",
        "existing maintainer-owned file preserved; rerun with --force to overwrite",
      ],
      [".open-maintainer.yml", "overwrite", "existing generated file"],
    ]);
  });

  it("previews context generation through the workflow boundary", async () => {
    const workflow = createContextGenerationWorkflow({
      model: fakeContextGenerationModel(),
      inventory: contextArtifactInventoryFromFiles({
        files: [
          { path: "README.md", content: "# Tool" },
          {
            path: "AGENTS.md",
            content: "# Maintainer-owned instructions",
          },
          {
            path: ".open-maintainer.yml",
            content: "generated:\n  by: open-maintainer\n",
          },
        ],
        nextArtifactVersion: 4,
      }),
    });

    const preview = await workflow.preview({
      repoId: "repo_1",
      profile,
      files: [{ path: "README.md", content: "# Tool" }],
      targets: ["agents", "skills", "profile", "report", "config"],
      writePolicy: { refreshGenerated: true },
    });

    expect(preview.modelProvider).toBe("Fake model");
    expect(preview.model).toBe("fake-artifact-content");
    expect(preview.artifacts.map((artifact) => artifact.type)).toEqual([
      "AGENTS.md",
      ".open-maintainer.yml",
      ".agents/skills/tool-start-task/SKILL.md",
      ".agents/skills/tool-testing-workflow/SKILL.md",
      ".agents/skills/tool-pr-review/SKILL.md",
      ".open-maintainer/profile.json",
      ".open-maintainer/report.md",
    ]);
    expect(preview.artifacts[0]?.version).toBe(4);
    expect(
      preview.plan.rows.map((item) => [item.action, item.target, item.reason]),
    ).toEqual([
      [
        "skip",
        "AGENTS.md",
        "existing maintainer-owned file preserved; rerun with --force to overwrite",
      ],
      ["overwrite", ".open-maintainer.yml", "existing generated file"],
      ["write", ".agents/skills/tool-start-task/SKILL.md", "file is absent"],
      [
        "write",
        ".agents/skills/tool-testing-workflow/SKILL.md",
        "file is absent",
      ],
      ["write", ".agents/skills/tool-pr-review/SKILL.md", "file is absent"],
      ["write", ".open-maintainer/profile.json", "file is absent"],
      ["write", ".open-maintainer/report.md", "file is absent"],
    ]);
  });

  it("plans obsolete generated skill removals only when requested", async () => {
    const inventory = contextArtifactInventoryFromFiles({
      files: [
        {
          path: ".agents/skills/tool-obsolete/SKILL.md",
          content: "generated by open-maintainer",
        },
      ],
      nextArtifactVersion: 1,
    });
    const workflow = createContextGenerationWorkflow({
      model: fakeContextGenerationModel(),
      inventory,
    });
    const request = {
      repoId: "repo_1",
      profile,
      files: [{ path: "README.md", content: "# Tool" }],
      targets: [
        "skills",
        "profile",
        "report",
        "config",
      ] as ContextArtifactTarget[],
    };

    const preserved = await workflow.preview(request);
    const removed = await workflow.preview({
      ...request,
      writePolicy: { removeObsoleteGenerated: true },
    });

    expect(preserved.plan.obsoleteGeneratedPaths).toEqual([]);
    expect(removed.plan.obsoleteGeneratedPaths).toEqual([
      {
        path: ".agents/skills/tool-obsolete/SKILL.md",
        reason: "obsolete generated artifact",
      },
    ]);
    expect(removed.plan.rows[0]).toEqual({
      action: "remove",
      target: ".agents/skills/tool-obsolete/SKILL.md",
      reason: "obsolete generated artifact",
    });
  });

  it("executes context generation through an injected sink", async () => {
    let applied: ContextGenerationWritePlan | null = null;
    const workflow = createContextGenerationWorkflow({
      model: fakeContextGenerationModel(),
      inventory: contextArtifactInventoryFromFiles({
        files: [],
        nextArtifactVersion: 1,
      }),
    });

    const result = await workflow.execute(
      {
        repoId: "repo_1",
        profile,
        files: [{ path: "README.md", content: "# Tool" }],
        targets: ["agents", "profile", "report", "config"],
      },
      {
        async apply(plan) {
          applied = plan;
          return plan.writes
            .filter((item) => item.action !== "skip")
            .map((item) => item.path);
        },
      },
    );

    expect(applied?.writes.map((item) => item.path)).toEqual(
      result.plan.writes.map((item) => item.path),
    );
    expect(result.appliedPaths).toEqual([
      "AGENTS.md",
      ".open-maintainer.yml",
      ".open-maintainer/profile.json",
      ".open-maintainer/report.md",
    ]);
  });

  it("applies filesystem context artifacts and obsolete generated removals through one sink", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "context-sink-"));
    const obsoletePath = ".agents/skills/tool-obsolete/SKILL.md";
    await mkdir(path.dirname(path.join(repoRoot, obsoletePath)), {
      recursive: true,
    });
    await writeFile(path.join(repoRoot, obsoletePath), "# Obsolete\n");
    const sink = createFilesystemContextArtifactSink();
    const plan: ContextGenerationWritePlan = {
      obsoleteGeneratedPaths: [
        { path: obsoletePath, reason: "obsolete generated artifact" },
      ],
      writes: [
        {
          artifact: generatedArtifact("AGENTS.md", "# Agents\n"),
          path: "AGENTS.md",
          action: "write",
          reason: "missing artifact",
        },
        {
          artifact: generatedArtifact(".open-maintainer/report.md", "# Report"),
          path: ".open-maintainer/report.md",
          action: "skip",
          reason: "maintainer-owned file exists",
        },
      ],
      rows: [],
    };

    try {
      await expect(sink.apply(repoRoot, plan)).resolves.toEqual([
        obsoletePath,
        "AGENTS.md",
      ]);
      await expect(
        readFile(path.join(repoRoot, "AGENTS.md"), "utf8"),
      ).resolves.toBe("# Agents\n");
      await expect(
        readFile(path.join(repoRoot, obsoletePath), "utf8"),
      ).rejects.toThrow();
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("previews worktree context generation without applying the sink", async () => {
    const sink: ContextGenerationArtifactSinkPort = {
      async apply() {
        throw new Error("sink should not run in preview mode");
      },
    };
    const orchestrator = createContextGenerationOrchestrator({
      repository: fakeContextGenerationRepository([
        { path: "README.md", content: "# Tool" },
      ]),
      defaultSink: sink,
    });

    const result = await orchestrator.generateForWorktree({
      repoRoot: "/repo",
      model: fakeContextGenerationModel(),
      selection: { context: "codex" },
      writeMode: { kind: "preview" },
    });

    expect(result.targets).toEqual(["agents", "profile", "report", "config"]);
    expect(result.wrote).toBe(false);
    expect(result.appliedPaths).toEqual([]);
    expect(result.plan.rows.map((row) => row.action)).toEqual([
      "write",
      "write",
      "write",
      "write",
    ]);
  });

  it("writes worktree context artifacts through the orchestrator sink", async () => {
    let appliedRoot: string | null = null;
    let appliedPlan: ContextGenerationWritePlan | null = null;
    const sink: ContextGenerationArtifactSinkPort = {
      async apply(repoRoot, plan) {
        appliedRoot = repoRoot;
        appliedPlan = plan;
        return plan.writes
          .filter((item) => item.action !== "skip")
          .map((item) => item.path);
      },
    };
    const orchestrator = createContextGenerationOrchestrator({
      repository: fakeContextGenerationRepository([
        {
          path: "AGENTS.md",
          content: "# Maintainer-owned instructions",
        },
        {
          path: ".open-maintainer.yml",
          content: "generated:\n  by: open-maintainer\n",
        },
      ]),
      defaultSink: sink,
    });

    const result = await orchestrator.generateForWorktree({
      repoRoot: "/repo",
      model: fakeContextGenerationModel(),
      selection: { context: "both", skills: "codex" },
      writeMode: { kind: "write", refreshGenerated: true },
    });

    expect(appliedRoot).toBe("/repo");
    expect(appliedPlan?.rows).toEqual(result.plan.rows);
    expect(result.wrote).toBe(true);
    expect(result.appliedPaths).toContain(".open-maintainer.yml");
    expect(result.plan.rows.map((row) => [row.action, row.target])).toEqual([
      ["skip", "AGENTS.md"],
      ["write", "CLAUDE.md"],
      ["overwrite", ".open-maintainer.yml"],
      ["write", ".agents/skills/tool-start-task/SKILL.md"],
      ["write", ".agents/skills/tool-testing-workflow/SKILL.md"],
      ["write", ".agents/skills/tool-pr-review/SKILL.md"],
      ["write", ".open-maintainer/profile.json"],
      ["write", ".open-maintainer/report.md"],
    ]);
  });

  it("generates from an existing profile with provider default targets and supplied artifact version", async () => {
    const orchestrator = createContextGenerationOrchestrator({});

    const result = await orchestrator.generateFromProfile({
      repoId: "repo_1",
      profile,
      files: [{ path: "README.md", content: "# Tool" }],
      model: fakeContextGenerationModel(),
      providerKind: "claude-cli",
      nextArtifactVersion: 7,
    });

    expect(result.targets).toEqual([
      "claude",
      "claude-skills",
      "profile",
      "report",
      "config",
    ]);
    expect(result.artifacts[0]?.version).toBe(7);
    expect(result.wrote).toBe(false);
  });

  it("defaults omitted dashboard target groups from the provider kind", async () => {
    const orchestrator = createContextGenerationOrchestrator({});

    const result = await orchestrator.generateFromProfile({
      repoId: "repo_1",
      profile,
      files: [{ path: "README.md", content: "# Tool" }],
      model: fakeContextGenerationModel(),
      providerKind: "claude-cli",
      selection: { context: "codex" },
      nextArtifactVersion: 7,
    });

    expect(result.targets).toEqual([
      "agents",
      "claude-skills",
      "profile",
      "report",
      "config",
    ]);
  });

  it("emits stage-specific failures through orchestrator events", async () => {
    const failures: unknown[] = [];
    const orchestrator = createContextGenerationOrchestrator({
      events: {
        failed(error) {
          failures.push(error);
        },
      },
    });

    await expect(
      orchestrator.generateFromProfile({
        repoId: "repo_1",
        profile,
        files: [{ path: "README.md", content: "# Tool" }],
        model: {
          providerLabel: "Fake model",
          model: "fake-context",
          async complete(_prompt, options) {
            if (options.stage === "artifact-content") {
              throw new Error("model unavailable");
            }
            return {
              text: JSON.stringify(repoFacts),
              model: `fake-${options.stage}`,
            };
          },
        },
        selection: { context: "codex" },
        nextArtifactVersion: 1,
      }),
    ).rejects.toThrow(
      "Context generation artifact-content failed: model unavailable",
    );

    expect(failures).toHaveLength(1);
    expect(failures[0]).toBeInstanceOf(Error);
    expect((failures[0] as Error).message).toBe(
      "Context generation artifact-content failed: model unavailable",
    );
  });

  it("shares dashboard target selection with context generation callers", () => {
    expect(
      contextArtifactTargetsForSelection({
        context: "both",
        skills: "claude",
      }),
    ).toEqual([
      "agents",
      "claude",
      "claude-skills",
      "profile",
      "report",
      "config",
    ]);
  });

  it("reports the failing generation stage before sink writes", async () => {
    const workflow = createContextGenerationWorkflow({
      model: fakeContextGenerationModel({
        "artifact-content": '{"agentsMd": 42}',
      }),
      inventory: contextArtifactInventoryFromFiles({
        files: [],
        nextArtifactVersion: 1,
      }),
    });

    await expect(
      workflow.execute(
        {
          repoId: "repo_1",
          profile,
          files: [{ path: "README.md", content: "# Tool" }],
          targets: ["agents", "profile", "report", "config"],
        },
        {
          async apply() {
            throw new Error("sink should not run");
          },
        },
      ),
    ).rejects.toThrow(/artifact-content/);
  });

  it("ignores context artifacts that were not fingerprinted in the stored profile", () => {
    const stored = {
      ...profile,
      existingContextFiles: ["AGENTS.md"],
      contextArtifactHashes: [{ path: "AGENTS.md", hash: "agents-hash" }],
    };
    const current = {
      ...profile,
      existingContextFiles: [
        "AGENTS.md",
        ".open-maintainer/profile.json",
        ".open-maintainer/report.md",
        ".agents/skills/tool-extra/SKILL.md",
      ],
      trackedFileHashes: [
        { path: "AGENTS.md", hash: "agents-hash" },
        { path: ".open-maintainer/profile.json", hash: "profile-hash" },
        { path: ".open-maintainer/report.md", hash: "report-hash" },
        { path: ".agents/skills/tool-extra/SKILL.md", hash: "extra-hash" },
      ],
    };

    expect(compareProfileDrift({ stored, current })).toEqual([]);
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
        summary: "Model facts.",
        qualityRules: ["Model rule."],
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
    const types = expectedArtifactTypes({
      profile: {
        ...profile,
        name: `---Open    Maintainer---${"-".repeat(1024)}Agent---`,
      },
      targets: ["skills"],
    });

    expect(types[0]).toBe(
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
        summary: "Model facts.",
        qualityRules: ["Model rule."],
        commands: ["fallback"],
        notes: [],
      },
      modelArtifacts,
      modelSkills,
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
      modelSkills,
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

  it("derives structured output from model repo facts", () => {
    const output = structuredContextOutputFromRepoFacts(profile, repoFacts);

    expect(output.summary).toContain("acme/tool");
    expect(output.commands).toContain(
      "tests test: bun test (package.json; observed)",
    );
    expect(output.qualityRules).toContain("Include test evidence in PR notes.");
    expect(output.notes).toContain("Unknown: No PR template was detected.");
  });
});

function generatedArtifact(
  type: GeneratedArtifact["type"],
  content: string,
): GeneratedArtifact {
  return {
    id: `artifact_${type}`,
    repoId: "repo_1",
    type,
    version: 1,
    content,
    sourceProfileVersion: profile.version,
    modelProvider: null,
    model: null,
    createdAt: "2026-05-05T00:00:00.000Z",
  };
}
