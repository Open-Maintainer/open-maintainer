import { createHash } from "node:crypto";
import { stringifyOpenMaintainerConfig } from "@open-maintainer/config";
import type {
  ArtifactType,
  GeneratedArtifact,
  RepoProfile,
} from "@open-maintainer/shared";
import {
  ArtifactTypeSchema,
  RepoProfileSchema,
  newId,
  nowIso,
} from "@open-maintainer/shared";
import { z } from "zod";

export const StructuredContextOutputSchema = z.object({
  summary: z.string().min(1),
  qualityRules: z.array(z.string().min(1)),
  commands: z.array(z.string().min(1)),
  notes: z.array(z.string().min(1)),
});
export type StructuredContextOutput = z.infer<
  typeof StructuredContextOutputSchema
>;

const EvidenceLevelSchema = z.enum(["observed", "inferred", "not_detected"]);
const EvidenceClaimSchema = z.object({
  claim: z.string().min(1),
  evidence: z.array(z.string().min(1)),
  confidence: EvidenceLevelSchema,
});
const CommandFactSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  scope: z.string().min(1),
  source: z.string().min(1),
  purpose: z.string().min(1),
  confidence: EvidenceLevelSchema,
});

export const StructuredRepoFactsSchema = z.object({
  summary: z.string().min(1),
  evidenceMap: z.array(EvidenceClaimSchema),
  repositoryMap: z.array(
    z.object({
      path: z.string().min(1),
      purpose: z.string().min(1),
      evidence: z.array(z.string().min(1)),
      confidence: EvidenceLevelSchema,
    }),
  ),
  commands: z.array(CommandFactSchema),
  setup: z.object({
    requirements: z.array(EvidenceClaimSchema),
    unknowns: z.array(z.string().min(1)),
  }),
  architecture: z.object({
    observed: z.array(EvidenceClaimSchema),
    inferred: z.array(EvidenceClaimSchema),
    unknowns: z.array(z.string().min(1)),
  }),
  changeRules: z.object({
    safeEditZones: z.array(EvidenceClaimSchema),
    carefulEditZones: z.array(EvidenceClaimSchema),
    doNotEditWithoutExplicitInstruction: z.array(EvidenceClaimSchema),
    unknowns: z.array(z.string().min(1)),
  }),
  testingStrategy: z.object({
    locations: z.array(EvidenceClaimSchema),
    commands: z.array(CommandFactSchema),
    namingConventions: z.array(EvidenceClaimSchema),
    regressionExpectations: z.array(z.string().min(1)),
    unknowns: z.array(z.string().min(1)),
  }),
  validation: z.object({
    canonicalCommand: CommandFactSchema.nullable(),
    scopedCommands: z.array(CommandFactSchema),
    unknowns: z.array(z.string().min(1)),
  }),
  prRules: z.array(z.string().min(1)),
  knownPitfalls: z.array(EvidenceClaimSchema),
  generatedFiles: z.array(EvidenceClaimSchema),
  highRiskAreas: z.array(EvidenceClaimSchema),
  documentationAlignment: z.array(EvidenceClaimSchema),
  unknowns: z.array(z.string().min(1)),
});
export type StructuredRepoFacts = z.infer<typeof StructuredRepoFactsSchema>;

export const ModelArtifactContentSchema = z.object({
  agentsMd: z.string().min(80),
  claudeMd: z.string().min(80),
  copilotInstructions: z.string().min(80),
  cursorRule: z.string().min(80),
});
export type ModelArtifactContent = z.infer<typeof ModelArtifactContentSchema>;

const ModelSkillSchema = z.object({
  path: z
    .string()
    .regex(/^\.(agents|claude)\/skills\/[a-z0-9][a-z0-9-]*\/SKILL\.md$/),
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  description: z.string().min(20),
  markdown: z.string().min(120),
});
export const ModelSkillContentSchema = z.object({
  skills: z.array(ModelSkillSchema).min(1).max(8),
});
export type ModelSkillContent = z.infer<typeof ModelSkillContentSchema>;

const evidenceClaimJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["claim", "evidence", "confidence"],
  properties: {
    claim: { type: "string", minLength: 1 },
    evidence: { type: "array", items: { type: "string", minLength: 1 } },
    confidence: {
      type: "string",
      enum: ["observed", "inferred", "not_detected"],
    },
  },
} as const;

const commandFactJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "command", "scope", "source", "purpose", "confidence"],
  properties: {
    name: { type: "string", minLength: 1 },
    command: { type: "string", minLength: 1 },
    scope: { type: "string", minLength: 1 },
    source: { type: "string", minLength: 1 },
    purpose: { type: "string", minLength: 1 },
    confidence: {
      type: "string",
      enum: ["observed", "inferred", "not_detected"],
    },
  },
} as const;

export const structuredRepoFactsJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "evidenceMap",
    "repositoryMap",
    "commands",
    "setup",
    "architecture",
    "changeRules",
    "testingStrategy",
    "validation",
    "prRules",
    "knownPitfalls",
    "generatedFiles",
    "highRiskAreas",
    "documentationAlignment",
    "unknowns",
  ],
  properties: {
    summary: { type: "string", minLength: 1 },
    evidenceMap: { type: "array", items: evidenceClaimJsonSchema },
    repositoryMap: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "purpose", "evidence", "confidence"],
        properties: {
          path: { type: "string", minLength: 1 },
          purpose: { type: "string", minLength: 1 },
          evidence: {
            type: "array",
            items: { type: "string", minLength: 1 },
          },
          confidence: {
            type: "string",
            enum: ["observed", "inferred", "not_detected"],
          },
        },
      },
    },
    commands: { type: "array", items: commandFactJsonSchema },
    setup: {
      type: "object",
      additionalProperties: false,
      required: ["requirements", "unknowns"],
      properties: {
        requirements: { type: "array", items: evidenceClaimJsonSchema },
        unknowns: { type: "array", items: { type: "string", minLength: 1 } },
      },
    },
    architecture: {
      type: "object",
      additionalProperties: false,
      required: ["observed", "inferred", "unknowns"],
      properties: {
        observed: { type: "array", items: evidenceClaimJsonSchema },
        inferred: { type: "array", items: evidenceClaimJsonSchema },
        unknowns: { type: "array", items: { type: "string", minLength: 1 } },
      },
    },
    changeRules: {
      type: "object",
      additionalProperties: false,
      required: [
        "safeEditZones",
        "carefulEditZones",
        "doNotEditWithoutExplicitInstruction",
        "unknowns",
      ],
      properties: {
        safeEditZones: { type: "array", items: evidenceClaimJsonSchema },
        carefulEditZones: { type: "array", items: evidenceClaimJsonSchema },
        doNotEditWithoutExplicitInstruction: {
          type: "array",
          items: evidenceClaimJsonSchema,
        },
        unknowns: { type: "array", items: { type: "string", minLength: 1 } },
      },
    },
    testingStrategy: {
      type: "object",
      additionalProperties: false,
      required: [
        "locations",
        "commands",
        "namingConventions",
        "regressionExpectations",
        "unknowns",
      ],
      properties: {
        locations: { type: "array", items: evidenceClaimJsonSchema },
        commands: { type: "array", items: commandFactJsonSchema },
        namingConventions: { type: "array", items: evidenceClaimJsonSchema },
        regressionExpectations: {
          type: "array",
          items: { type: "string", minLength: 1 },
        },
        unknowns: { type: "array", items: { type: "string", minLength: 1 } },
      },
    },
    validation: {
      type: "object",
      additionalProperties: false,
      required: ["canonicalCommand", "scopedCommands", "unknowns"],
      properties: {
        canonicalCommand: {
          anyOf: [commandFactJsonSchema, { type: "null" }],
        },
        scopedCommands: { type: "array", items: commandFactJsonSchema },
        unknowns: { type: "array", items: { type: "string", minLength: 1 } },
      },
    },
    prRules: { type: "array", items: { type: "string", minLength: 1 } },
    knownPitfalls: { type: "array", items: evidenceClaimJsonSchema },
    generatedFiles: { type: "array", items: evidenceClaimJsonSchema },
    highRiskAreas: { type: "array", items: evidenceClaimJsonSchema },
    documentationAlignment: { type: "array", items: evidenceClaimJsonSchema },
    unknowns: { type: "array", items: { type: "string", minLength: 1 } },
  },
} as const;

export const modelArtifactContentJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["agentsMd", "claudeMd", "copilotInstructions", "cursorRule"],
  properties: {
    agentsMd: { type: "string", minLength: 80 },
    claudeMd: { type: "string", minLength: 80 },
    copilotInstructions: { type: "string", minLength: 80 },
    cursorRule: { type: "string", minLength: 80 },
  },
} as const;

export const modelSkillContentJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["skills"],
  properties: {
    skills: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "name", "description", "markdown"],
        properties: {
          path: {
            type: "string",
            pattern:
              "^\\.(agents|claude)/skills/[a-z0-9][a-z0-9-]*/SKILL\\.md$",
          },
          name: {
            type: "string",
            pattern: "^[a-z0-9][a-z0-9-]*$",
          },
          description: { type: "string", minLength: 20 },
          markdown: { type: "string", minLength: 120 },
        },
      },
    },
  },
} as const;

export type ContextSourceFile = {
  path: string;
  content: string;
};

export type ContextArtifactTarget =
  | "agents"
  | "claude"
  | "copilot"
  | "cursor"
  | "skills"
  | "claude-skills"
  | "profile"
  | "report"
  | "config";

export const availableArtifactTargets: ContextArtifactTarget[] = [
  "agents",
  "claude",
  "copilot",
  "cursor",
  "skills",
  "claude-skills",
  "profile",
  "report",
  "config",
];

export const defaultArtifactTargets: ContextArtifactTarget[] = [
  "agents",
  "skills",
  "profile",
  "report",
  "config",
];

export type ArtifactModel = "codex" | "claude";

export type ArtifactWritePlanItem = {
  artifact: GeneratedArtifact;
  path: string;
  action: "write" | "skip" | "overwrite";
  reason: string;
};

const generatedMarker = "generated by open-maintainer";

export function renderAgentsMd(
  profile: RepoProfile,
  output: StructuredContextOutput,
): string {
  const commands =
    output.commands.length > 0 ? output.commands : commandLines(profile);
  return [
    `# AGENTS.md instructions for ${profile.owner}/${profile.name}`,
    "",
    `<!-- ${metadataComment(profile)} -->`,
    "",
    "## Repository Purpose",
    "",
    output.summary,
    "",
    "## Setup and Quality Commands",
    "",
    ...commands.map((command) => `- ${command}`),
    "",
    "## Architecture Map",
    "",
    ...listOrFallback(
      profile.architecturePathGroups.map(
        (group) => `${group}: detected subsystem path`,
      ),
      "No major subsystem paths were detected.",
    ),
    "",
    "## Generated and Sensitive Paths",
    "",
    ...profile.generatedFileHints.map((hint) => `- ${hint}`),
    "",
    "## Risk Areas",
    "",
    ...listOrFallback(
      output.notes,
      "No deterministic risk hints were detected.",
    ),
    "",
    "## Quality Rules",
    "",
    ...output.qualityRules.map((rule) => `- ${rule}`),
    "",
    "## PR Expectations",
    "",
    "- Read the target file and a related caller, test, or type before editing.",
    "- Keep generated artifacts scoped to the approved paths.",
    "- Run the relevant quality gates and include failures or skipped checks in the handoff.",
    "",
    "## Common Mistakes to Avoid",
    "",
    "- Do not overwrite maintainer-owned context files without an explicit force decision.",
    "- Do not send repository content to a model provider unless repo-content consent is enabled.",
    "- Do not commit directly to the default branch from automated PR flows.",
    "",
    "## Evidence",
    "",
    ...profile.evidence.map((item) => `- ${item.path}: ${item.reason}`),
    "",
    `<!-- ${generatedMarker}; edit through .open-maintainer.yml after merge -->`,
  ].join("\n");
}

export function renderClaudeMd(
  profile: RepoProfile,
  output: StructuredContextOutput,
): string {
  return renderAgentsMd(profile, output).replace(
    `# AGENTS.md instructions for ${profile.owner}/${profile.name}`,
    `# CLAUDE.md instructions for ${profile.owner}/${profile.name}`,
  );
}

export function renderOpenMaintainerYaml(
  profile: RepoProfile,
  artifactVersion: number,
  rules: string[],
): string {
  return stringifyOpenMaintainerConfig({
    version: 1,
    repo: {
      profileVersion: profile.version,
      defaultBranch: profile.defaultBranch,
    },
    rules,
    generated: {
      by: "open-maintainer",
      artifactVersion,
      generatedAt: nowIso(),
    },
  });
}

export function renderCopilotInstructions(
  profile: RepoProfile,
  output: StructuredContextOutput,
): string {
  return [
    `# Copilot instructions for ${profile.owner}/${profile.name}`,
    "",
    `<!-- ${metadataComment(profile)} -->`,
    "",
    output.summary,
    "",
    "## Commands",
    "",
    ...resolvedCommands(profile, output).map((command) => `- ${command}`),
    "",
    "## Review Rules",
    "",
    ...output.qualityRules.map((rule) => `- ${rule}`),
  ].join("\n");
}

export function renderCursorRule(
  profile: RepoProfile,
  output: StructuredContextOutput,
): string {
  return [
    "---",
    "description: Open Maintainer generated repository rules",
    "alwaysApply: true",
    "---",
    "",
    `# ${profile.owner}/${profile.name}`,
    "",
    `<!-- ${metadataComment(profile)} -->`,
    "",
    output.summary,
    "",
    "Use these commands when they apply:",
    "",
    ...resolvedCommands(profile, output).map((command) => `- ${command}`),
    "",
    "Follow these review rules:",
    "",
    ...output.qualityRules.map((rule) => `- ${rule}`),
  ].join("\n");
}

export function renderSkill(
  profile: RepoProfile,
  name: "start-task" | "testing-workflow" | "pr-review",
  output: StructuredContextOutput,
): string {
  const repoSkillName = `${slugify(profile.name)}-${name}`;
  const title = name
    .split("-")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
  const description =
    name === "start-task"
      ? `Orient inside ${profile.owner}/${profile.name} before making a bounded code, docs, workflow, or generated-artifact change.`
      : name === "testing-workflow"
        ? `Use when changing tests or running validation in ${profile.owner}/${profile.name}.`
        : `Use when preparing or reviewing pull requests in ${profile.owner}/${profile.name}.`;
  const commands = commandLines(profile);
  const docs = profile.importantDocs.length > 0 ? profile.importantDocs : [];
  const riskAreas =
    profile.detectedRiskAreas.length > 0
      ? profile.detectedRiskAreas
      : [
          "Not detected; treat auth, write paths, generated files, deployment, and lockfiles with caution.",
        ];
  const readFirst =
    name === "start-task"
      ? [
          "The target file.",
          "One related caller, test, type definition, route, command, or config.",
          "The nearest package manifest and tsconfig for app/package changes.",
        ]
      : name === "testing-workflow"
        ? [
            "The changed source file.",
            "Nearby tests or fixtures for the changed behavior.",
            "Package manifests, tsconfig, and CI workflow files that define validation.",
          ]
        : [
            "The PR diff.",
            "Changed tests, fixtures, docs, and generated artifacts.",
            "Relevant manifests, workflows, and high-risk files touched by the PR.",
          ];
  const workflow =
    name === "start-task"
      ? [
          "Classify the changed surface before editing.",
          "Confirm whether the change crosses app, package, docs, workflow, Docker, or generated-artifact boundaries.",
          "Keep the diff bounded: no unrelated formatting, broad refactors, dependency churn, or lockfile churn.",
          "Choose scoped validation before making the final change.",
        ]
      : name === "testing-workflow"
        ? [
            "Map the changed surface to the narrowest relevant validation command.",
            "Add or update regression coverage for behavior changes and bug fixes.",
            "Run focused tests first, then broader checks when the change crosses contracts or packages.",
            "If a command needs unavailable services, record the skipped command and reason.",
          ]
        : [
            "Review correctness, security, data loss, auth, generated artifacts, docs, and validation evidence before style.",
            "Separate blockers from non-blocking notes.",
            "Avoid requesting broad refactors unless the diff introduces a concrete risk.",
            "Ground every finding in a file path, command, or documented behavior.",
          ];
  const doNotUse =
    name === "start-task"
      ? [
          "Reviewing an existing PR; use the PR review skill.",
          "Selecting final validation only; use the testing workflow skill.",
        ]
      : name === "testing-workflow"
        ? [
            "Starting a broad implementation; use the start-task skill first.",
            "Reviewing another author's completed diff; use the PR review skill.",
          ]
        : [
            "Implementing the change yourself.",
            "Doing first-pass repo orientation; use the start-task skill.",
          ];
  return [
    "---",
    `name: ${repoSkillName}`,
    `description: ${description}`,
    "---",
    "",
    `# ${title}`,
    "",
    `<!-- ${metadataComment(profile)} -->`,
    "",
    "## Use when",
    "",
    `- ${description}`,
    "",
    "## Do not use when",
    "",
    ...doNotUse.map((item) => `- ${item}`),
    "",
    "## Read first",
    "",
    ...readFirst.map((item) => `- ${item}`),
    ...docs.slice(0, 8).map((item) => `- ${item}`),
    "",
    "## Workflow",
    "",
    ...workflow.map((item, index) => `${index + 1}. ${item}`),
    "",
    "## Validation",
    "",
    ...(commands.length > 0
      ? commands.map((command) => `- ${command}`)
      : [
          "- Not detected; inspect local manifests and CI workflows before selecting validation.",
        ]),
    "",
    "## Documentation",
    "",
    ...(docs.length > 0
      ? docs
          .slice(0, 8)
          .map((item) => `- Check or update ${item} when behavior changes.`)
      : [
          "- Not detected; update user-facing docs when commands, setup, public behavior, or generated outputs change.",
        ]),
    "",
    "## Risk checks",
    "",
    ...riskAreas.map((item) => `- ${item}`),
    ...output.qualityRules.slice(0, 8).map((rule) => `- ${rule}`),
    "",
    "## Done when",
    "",
    "- The changed surface is clear.",
    "- Required files were read before editing or reviewing.",
    "- Relevant tests, docs, and validation were updated or explicitly ruled out.",
    "- Final notes include commands run and any skipped checks.",
  ].join("\n");
}

export function renderReadinessReport(profile: RepoProfile): string {
  return [
    `# Open Maintainer Report: ${profile.owner}/${profile.name}`,
    "",
    `Agent Readiness: ${profile.agentReadiness.score}/100`,
    "",
    "## Category Scores",
    "",
    ...profile.agentReadiness.categories.flatMap((category) => [
      `### ${category.name}: ${category.score}/${category.maxScore}`,
      "",
      ...(category.missing.length > 0
        ? category.missing.map((item) => `- Missing: ${item}`)
        : ["- No missing items detected."]),
      ...category.evidence.map(
        (item) => `- Evidence: ${item.path} (${item.reason})`,
      ),
      "",
    ]),
    "## Commands",
    "",
    ...listOrFallback(commandLines(profile), "No commands detected."),
    "",
    "## Architecture",
    "",
    ...listOrFallback(
      profile.architecturePathGroups,
      "No architecture paths detected.",
    ),
    "",
    "## Risk Hints",
    "",
    ...listOrFallback(
      profile.detectedRiskAreas,
      "No deterministic risk hints detected.",
    ),
  ].join("\n");
}

export function createContextArtifacts(input: {
  repoId: string;
  profile: RepoProfile;
  output: StructuredContextOutput;
  modelArtifacts?: ModelArtifactContent;
  modelSkills?: ModelSkillContent;
  modelProvider: string | null;
  model: string | null;
  nextVersion: number;
  targets?: ContextArtifactTarget[];
}): GeneratedArtifact[] {
  const createdAt = nowIso();
  const targets = new Set(input.targets ?? defaultArtifactTargets);
  const definitions: Array<{ type: ArtifactType; content: string }> = [];
  if (targets.has("agents")) {
    definitions.push({
      type: "AGENTS.md",
      content:
        input.modelArtifacts?.agentsMd ??
        renderAgentsMd(input.profile, input.output),
    });
  }
  if (targets.has("claude")) {
    definitions.push({
      type: "CLAUDE.md",
      content:
        input.modelArtifacts?.claudeMd ??
        renderClaudeMd(input.profile, input.output),
    });
  }
  if (targets.has("config")) {
    definitions.push({
      type: ".open-maintainer.yml",
      content: renderOpenMaintainerYaml(
        input.profile,
        input.nextVersion + definitions.length,
        input.output.qualityRules,
      ),
    });
  }
  if (targets.has("copilot")) {
    definitions.push({
      type: ".github/copilot-instructions.md",
      content:
        input.modelArtifacts?.copilotInstructions ??
        renderCopilotInstructions(input.profile, input.output),
    });
  }
  if (targets.has("cursor")) {
    definitions.push({
      type: ".cursor/rules/open-maintainer.md",
      content:
        input.modelArtifacts?.cursorRule ??
        renderCursorRule(input.profile, input.output),
    });
  }
  if (targets.has("skills")) {
    definitions.push(
      ...skillDefinitionsForTarget(
        ".agents",
        input.profile,
        input.output,
        input.modelSkills,
      ),
    );
  }
  if (targets.has("claude-skills")) {
    definitions.push(
      ...skillDefinitionsForTarget(
        ".claude",
        input.profile,
        input.output,
        input.modelSkills,
      ),
    );
  }
  if (targets.has("profile")) {
    const contextArtifactHashes = definitions
      .filter((definition) => isContextArtifactPath(definition.type))
      .map((definition) => ({
        path: definition.type,
        hash: contentHash(definition.content),
      }));
    definitions.push({
      type: ".open-maintainer/profile.json",
      content: `${JSON.stringify(
        {
          ...input.profile,
          contextArtifactHashes,
          openMaintainerProfileHash: profileFingerprint(input.profile),
        },
        null,
        2,
      )}\n`,
    });
  }
  if (targets.has("report")) {
    definitions.push({
      type: ".open-maintainer/report.md",
      content: renderReadinessReport(input.profile),
    });
  }

  return definitions.map((definition, index) => ({
    id: newId("artifact"),
    repoId: input.repoId,
    type: definition.type,
    version: input.nextVersion + index,
    content: definition.content,
    sourceProfileVersion: input.profile.version,
    modelProvider: input.modelProvider,
    model: input.model,
    createdAt,
  }));
}

function skillDefinitionsForTarget(
  targetRoot: ".agents" | ".claude",
  profile: RepoProfile,
  output: StructuredContextOutput,
  modelSkills?: ModelSkillContent,
): Array<{ type: ArtifactType; content: string }> {
  if (modelSkills && modelSkills.skills.length > 0) {
    const seen = new Set<string>();
    return modelSkills.skills.flatMap((skill) => {
      const slug = skillSlugFromPath(skill.path) ?? slugify(skill.name);
      const path = ArtifactTypeSchema.parse(
        `${targetRoot}/skills/${slug}/SKILL.md`,
      );
      if (seen.has(path)) {
        return [];
      }
      seen.add(path);
      return [{ type: path, content: skill.markdown }];
    });
  }

  const defaultSkills: Array<"start-task" | "testing-workflow" | "pr-review"> =
    ["start-task", "testing-workflow", "pr-review"];
  return defaultSkills.map((name) => ({
    type: ArtifactTypeSchema.parse(
      `${targetRoot}/skills/${slugify(profile.name)}-${name}/SKILL.md`,
    ),
    content: renderSkill(profile, name, output),
  }));
}

export function deterministicContextOutput(
  profile: RepoProfile,
): StructuredContextOutput {
  return {
    summary: `${profile.owner}/${profile.name} is a ${profile.primaryLanguages.join(", ") || "software"} repository on ${profile.defaultBranch}. Detected subsystems: ${profile.architecturePathGroups.join(", ") || "none"}.`,
    qualityRules:
      profile.reviewRuleCandidates.length > 0
        ? profile.reviewRuleCandidates
        : [
            "Read target files before editing.",
            "Run the documented quality gates before finishing.",
          ],
    commands: commandLines(profile),
    notes: profile.detectedRiskAreas,
  };
}

export function buildContextSynthesisPrompt(profile: RepoProfile): {
  system: string;
  user: string;
} {
  return {
    system:
      "Return only valid JSON matching {summary:string,qualityRules:string[],commands:string[],notes:string[]}. Do not include markdown fences.",
    user: JSON.stringify({
      repo: `${profile.owner}/${profile.name}`,
      languages: profile.primaryLanguages,
      frameworks: profile.frameworks,
      commands: profile.commands,
      architecturePathGroups: profile.architecturePathGroups,
      evidence: profile.evidence,
      riskAreas: profile.detectedRiskAreas,
    }),
  };
}

export function buildRepoFactsSynthesisPrompt(input: {
  profile: RepoProfile;
  files: ContextSourceFile[];
}): {
  system: string;
  user: string;
} {
  return {
    system: [
      "You analyze repository evidence for an AI-agent context generator.",
      "This is pass 1 of a two-pass pipeline. Do not write AGENTS.md or any Markdown artifact.",
      "Return only normalized repository facts, evidence references, cautious inferences, risk areas, and unknowns.",
      "",
      "Use only the repository profile and selected file excerpts provided by the user.",
      "Do not invent commands, services, deployment processes, package managers, policies, owners, audit requirements, environments, release flows, or architectural facts.",
      "",
      "Evidence policy:",
      "- Mark directly observed facts with confidence 'observed'.",
      "- Mark cautious conclusions from paths, configs, package manifests, or CI workflows with confidence 'inferred'.",
      "- Use confidence 'not_detected' only for explicit unknown/missing evidence claims.",
      "- Every observed or inferred claim must include at least one evidence path or profile field name.",
      "- Never present an inference as a confirmed fact.",
      "- Do not mention that generated target files such as AGENTS.md, Claude instructions, Cursor rules, Copilot instructions, or generated skills are missing; this task is creating them.",
      "",
      "Analyze for:",
      "- project overview and runtime",
      "- repository map",
      "- architecture and data flow",
      "- setup requirements",
      "- commands and validation gates",
      "- coding conventions",
      "- safe, careful, and do-not-edit zones",
      "- testing strategy",
      "- PR and review rules",
      "- known pitfalls",
      "- generated files",
      "- security and high-risk areas",
      "- documentation alignment requirements",
      "- unknowns and missing evidence",
      "",
      "Return only valid JSON matching the requested schema.",
      "Do not include markdown fences around the JSON.",
      "Do not include comments or trailing commas.",
      "",
      "Quality bar:",
      "- Evidence beats speculation.",
      "- Unknowns beat hallucinated confidence.",
      "- Specific paths and commands beat broad labels.",
    ].join("\n"),
    user: JSON.stringify({
      task: "Analyze repository evidence into normalized facts for AI-agent-ready context generation.",
      repo: {
        owner: input.profile.owner,
        name: input.profile.name,
        defaultBranch: input.profile.defaultBranch,
        languages: input.profile.primaryLanguages,
        frameworks: input.profile.frameworks,
        packageManager: input.profile.packageManager,
        commands: input.profile.commands,
        ciWorkflows: input.profile.ciWorkflows,
        docs: input.profile.importantDocs,
        architecturePathGroups: input.profile.architecturePathGroups,
        generatedFileHints: input.profile.generatedFileHints,
        existingContextFiles: input.profile.existingContextFiles,
        riskAreas: input.profile.detectedRiskAreas,
        reviewRules: input.profile.reviewRuleCandidates,
        evidence: input.profile.evidence,
        workspaceManifests: input.profile.workspaceManifests,
        lockfiles: input.profile.lockfiles,
        configFiles: input.profile.configFiles,
        readiness: input.profile.agentReadiness,
      },
      selectedFiles: selectPromptFileExcerpts(input.files),
      outputRules: {
        evidenceOnly: true,
        labelInferences: true,
        includeUnknowns: true,
        noGeneratedTargetMissingClaims: true,
      },
    }),
  };
}

export function buildArtifactSynthesisPrompt(input: {
  profile: RepoProfile;
  repoFacts: StructuredRepoFacts;
}): {
  system: string;
  user: string;
} {
  return {
    system: [
      "You generate repository-specific operating instructions for AI coding agents.",
      "",
      "Your primary artifact is AGENTS.md. It must help an autonomous or semi-autonomous coding agent understand the repository, make a bounded change, run the right checks, and prepare a reviewable PR without relying on tribal context.",
      "",
      "Use only the repository profile and normalized repo facts provided by the user.",
      "Do not invent commands, services, deployment processes, package managers, policies, owners, audit requirements, environments, release flows, or architectural facts.",
      "",
      "Evidence policy:",
      "- Prefer facts directly observed in provided files.",
      "- You may make cautious inferences from filenames, directory structure, package manifests, config files, and CI workflows, but label them as apparent or inferred.",
      "- If evidence is missing, say 'Not detected' and provide the safest practical fallback.",
      "- Never present an inference as a confirmed fact.",
      "- Do not mention that generated target files such as AGENTS.md, Claude instructions, Cursor rules, Copilot instructions, or generated skills are missing; this task is creating them.",
      "",
      "AGENTS.md requirements:",
      "- Optimize AGENTS.md for coding-agent execution, not audit-style completeness.",
      "- Put the most important operational rules in the first 40 lines.",
      "- Keep AGENTS.md to 180-250 lines unless the repository is unusually complex.",
      "Include these sections in this order:",
      "1. Project overview",
      "2. Agent workflow",
      "3. Scope control",
      "4. Repository map",
      "5. Architecture",
      "6. Setup",
      "7. Common commands",
      "8. Coding conventions",
      "9. Change rules",
      "10. Testing strategy",
      "11. Validation checklist",
      "12. PR rules",
      "13. Known pitfalls",
      "14. Generated files",
      "15. Security and high-risk areas",
      "16. Documentation alignment",
      "17. Unknowns and missing evidence",
      "",
      "For each section:",
      "- Use exact paths and exact commands when available.",
      "- Avoid generic advice that could apply to any repository.",
      "- Keep wording concise and operational.",
      "- Prefer bullets, checklists, and commands over prose.",
      "- If the section lacks evidence, write a short 'Not detected' note and the safest fallback behavior for an agent.",
      "- Do not repeat the same command list across multiple sections.",
      "",
      "Agent workflow must be near the top and describe the default coding-agent loop: read target and related files, make a bounded change, run scoped validation, report evidence.",
      "",
      "Scope control must explicitly prevent broad refactors, unrelated formatting, dependency churn, lockfile churn, and public API or behavior changes without matching docs and tests.",
      "",
      "Command rules:",
      "- Identify a canonical full validation command if one exists.",
      "- If no canonical full validation command exists, say so.",
      "- List scoped commands by changed surface when possible, such as frontend, backend, contracts, tests, lint, typecheck, build, or docs.",
      "- Do not fabricate a combined command such as 'make check' or 'npm run check' unless it appears in evidence.",
      "- Prefer a validation routing table with columns like changed surface, command, when to run, and evidence/source.",
      "",
      "Change rules must separate:",
      "- Safe edit zones",
      "- Careful edit zones",
      "- Do-not-edit-without-explicit-instruction zones",
      "",
      "Testing strategy must state:",
      "- Where tests appear to live",
      "- Which commands run them",
      "- When regression tests are expected",
      "- Any observed test naming conventions",
      "",
      "PR rules must require:",
      "- Test evidence",
      "- No unrelated formatting",
      "- No secrets or credentials",
      "- Documentation updates for public behavior changes",
      "- Explicit notes for risky areas touched",
      "",
      "Generated files and high-risk areas:",
      "- Mark generated files, lockfiles, migrations, schemas, vendored code, compiled artifacts, and deployment files carefully when detected.",
      "- If unsure whether a path is generated or high-risk, say it is not confirmed and recommend caution.",
      "",
      "Architecture and documentation alignment:",
      "- Compress architecture details into high-signal module responsibilities and risk notes.",
      "- Prefer a documentation routing table with columns like change type, docs to update, and evidence/source.",
      "",
      "Tool-specific outputs:",
      "- Generate Claude, Copilot, and Cursor files from the same facts as AGENTS.md.",
      "- AGENTS.md is the source of truth.",
      "- Tool-specific files should be shorter mirrors, not independent reinterpretations.",
      "",
      "Return only valid JSON.",
      "Do not include markdown fences around the JSON.",
      "Do not include comments or trailing commas.",
      "",
      "The JSON object must have exactly these keys:",
      "agentsMd",
      "claudeMd",
      "copilotInstructions",
      "cursorRule",
      "",
      "Each value must be complete Markdown content for that file. Include Cursor frontmatter for cursorRule.",
      "",
      "Quality bar:",
      "- Specific beats complete.",
      "- Evidence beats speculation.",
      "- Operational beats explanatory.",
      "- Short and accurate beats long and generic.",
    ].join("\n"),
    user: JSON.stringify({
      task: "Generate AI-agent-ready repository context artifacts.",
      aiReadyDefinition: {
        goal: "Make project context, engineering rules, validation commands, and task workflows explicit enough that an AI agent can make a safe, reviewable change without guessing.",
        sourceOfTruth: "AGENTS.md",
        minimumAgentsMdSections: [
          "Project overview",
          "Agent workflow",
          "Scope control",
          "Repository map",
          "Architecture",
          "Setup",
          "Common commands",
          "Coding conventions",
          "Change rules",
          "Testing strategy",
          "Validation checklist",
          "PR rules",
          "Known pitfalls",
          "Generated files",
          "Security and high-risk areas",
          "Documentation alignment",
          "Unknowns and missing evidence",
        ],
      },
      repo: {
        owner: input.profile.owner,
        name: input.profile.name,
        defaultBranch: input.profile.defaultBranch,
        languages: input.profile.primaryLanguages,
        frameworks: input.profile.frameworks,
        packageManager: input.profile.packageManager,
        commands: input.profile.commands,
        ciWorkflows: input.profile.ciWorkflows,
        docs: input.profile.importantDocs,
        architecturePathGroups: input.profile.architecturePathGroups,
        riskAreas: input.profile.detectedRiskAreas,
        reviewRules: input.profile.reviewRuleCandidates,
        readiness: input.profile.agentReadiness,
      },
      repoFacts: input.repoFacts,
      outputRules: {
        evidenceOnly: true,
        noBoilerplate: true,
        noGenericAdvice: true,
        noSelfContradictoryMissingFileClaims: true,
        preferExactPathsAndCommands: true,
        labelInferences: true,
        includeUnknowns: true,
        agentsMdIsSourceOfTruth: true,
        optimizeForCodingAgentExecution: true,
        putOperationalRulesInFirstFortyLines: true,
        preferRoutingTables: true,
        avoidRepeatedCommandLists: true,
        targetAgentsMdLineCount: "180-250 unless unusually complex",
        includeScopeControl: true,
      },
    }),
  };
}

export function buildSkillSynthesisPrompt(input: {
  profile: RepoProfile;
  repoFacts: StructuredRepoFacts;
  agentsMd: string;
  files: ContextSourceFile[];
}): {
  system: string;
  user: string;
} {
  return {
    system: [
      "You generate repository-specific Agent Skills for AI coding agents.",
      "",
      "A skill is not a general documentation summary.",
      "A skill is a compact, task-specific operating procedure for a repeated workflow in this repository.",
      "",
      "Use only the provided repository facts, evidence map, selected file excerpts, and AGENTS.md.",
      "Do not invent commands, paths, services, owners, policies, release processes, deployment behavior, or test locations.",
      "",
      "AGENTS.md is the source of truth.",
      "Skills must be consistent with AGENTS.md and may only compress, specialize, or route its instructions.",
      "",
      "Evidence policy:",
      "- Prefer directly observed paths, commands, manifests, docs, and workflows.",
      "- Label cautious inferences as apparent or inferred.",
      "- If evidence is missing, say 'Not detected' and give the safest fallback.",
      "- Never present guessed repo behavior as fact.",
      "",
      "Generate skills that improve real agent execution.",
      "Prefer workflow-specific skills over generic summaries.",
      "",
      "Skill selection rules:",
      "- Always generate a start-task/orientation skill.",
      "- Always generate a validation/testing skill.",
      "- Always generate a PR-review skill.",
      "- Additionally generate up to 5 repo-specific workflow skills when the evidence supports them.",
      "- Repo-specific skills should target repeated, high-value, or high-risk workflows in this repository.",
      "",
      "Examples of repo-specific workflow skills:",
      "- add-cli-command",
      "- update-api-route",
      "- update-github-webhook",
      "- update-contract",
      "- update-indexer-event-handler",
      "- update-frontend-page",
      "- update-database-schema",
      "- update-docker-compose-stack",
      "- update-release-workflow",
      "- update-generated-context-artifacts",
      "",
      "Do not generate a repo-specific skill unless there is enough evidence to make it operational.",
      "If evidence is insufficient, prefer fewer better skills.",
      "",
      "Each skill must include YAML frontmatter:",
      "---",
      "name: <kebab-case repo-specific name>",
      "description: <one sentence saying when to use the skill>",
      "---",
      "",
      "Each skill body must include these sections:",
      "# <Title>",
      "",
      "## Use when",
      "- Specific conditions for using this skill.",
      "",
      "## Do not use when",
      "- Cases where another skill or human instruction is more appropriate.",
      "",
      "## Read first",
      "- Exact files, directories, docs, manifests, tests, or configs to inspect before editing.",
      "",
      "## Workflow",
      "- Step-by-step procedure for the task.",
      "",
      "## Validation",
      "- Exact commands to run, routed by changed surface when needed.",
      "- If no exact command is detected, say 'Not detected' and give the safest fallback.",
      "",
      "## Documentation",
      "- Docs that must be checked or updated when behavior changes.",
      "",
      "## Risk checks",
      "- Repo-specific risks, sharp edges, security concerns, generated files, lockfiles, migrations, deployment behavior, or public API concerns.",
      "",
      "## Done when",
      "- Concrete completion criteria.",
      "",
      "Style rules:",
      "- Be concise and operational.",
      "- Prefer bullets and small tables over prose.",
      "- Avoid generic advice that would apply to any repo.",
      "- Avoid copying large sections of AGENTS.md.",
      "- Do not include motivational text.",
      "- Do not include markdown fences.",
      "",
      "Return only valid JSON.",
      "Do not include comments or trailing commas.",
      "",
      "Return shape:",
      "{",
      '  "skills": [',
      "    {",
      '      "path": ".agents/skills/<skill-slug>/SKILL.md",',
      '      "name": "<frontmatter name>",',
      '      "description": "<frontmatter description>",',
      '      "markdown": "<complete SKILL.md content>"',
      "    }",
      "  ]",
      "}",
      "",
      "Path rules:",
      "- Use .agents/skills/<skill-slug>/SKILL.md for every path.",
      "- Use kebab-case skill slugs.",
      "- The caller will map paths to .claude/skills when Claude project skills are requested.",
      "",
      "Quality bar:",
      "- Specific beats comprehensive.",
      "- Workflow beats summary.",
      "- Evidence beats speculation.",
      "- Fewer high-quality skills beat many generic skills.",
    ].join("\n"),
    user: JSON.stringify({
      task: "Generate repository-specific Agent Skills.",
      repo: {
        owner: input.profile.owner,
        name: input.profile.name,
        defaultBranch: input.profile.defaultBranch,
        languages: input.profile.primaryLanguages,
        frameworks: input.profile.frameworks,
        packageManager: input.profile.packageManager,
        commands: input.profile.commands,
        ciWorkflows: input.profile.ciWorkflows,
        docs: input.profile.importantDocs,
        architecturePathGroups: input.profile.architecturePathGroups,
        riskAreas: input.profile.detectedRiskAreas,
        reviewRules: input.profile.reviewRuleCandidates,
        readiness: input.profile.agentReadiness,
      },
      agentsMd: input.agentsMd,
      selectedFiles: selectPromptFileExcerpts(input.files),
      repoFacts: input.repoFacts,
      outputRules: {
        evidenceOnly: true,
        agentsMdIsSourceOfTruth: true,
        noGenericAdvice: true,
        preferExactPathsAndCommands: true,
        labelInferences: true,
        includeUnknowns: true,
        preferFewerBetterSkills: true,
        maxSkills: 8,
      },
    }),
  };
}

export function parseStructuredContextOutput(
  text: string,
): StructuredContextOutput {
  const parsed = JSON.parse(stripJsonFence(text)) as unknown;
  return StructuredContextOutputSchema.parse(parsed);
}

export function parseStructuredRepoFacts(text: string): StructuredRepoFacts {
  const parsed = JSON.parse(stripJsonFence(text)) as unknown;
  return StructuredRepoFactsSchema.parse(parsed);
}

export function structuredContextOutputFromRepoFacts(
  profile: RepoProfile,
  repoFacts: StructuredRepoFacts,
): StructuredContextOutput {
  const factCommands = [
    ...repoFacts.commands,
    ...repoFacts.testingStrategy.commands,
    ...(repoFacts.validation.canonicalCommand
      ? [repoFacts.validation.canonicalCommand]
      : []),
    ...repoFacts.validation.scopedCommands,
  ];
  const commands =
    factCommands.length > 0
      ? uniqueStrings(factCommands.map(formatCommandFact))
      : commandLines(profile);
  const qualityRules = uniqueStrings([
    ...profile.reviewRuleCandidates,
    ...repoFacts.prRules,
    ...repoFacts.changeRules.safeEditZones.map(
      (item) => `Safe edit zone: ${item.claim}`,
    ),
    ...repoFacts.changeRules.carefulEditZones.map(
      (item) => `Use caution: ${item.claim}`,
    ),
    ...repoFacts.changeRules.doNotEditWithoutExplicitInstruction.map(
      (item) => `Do not edit without explicit instruction: ${item.claim}`,
    ),
  ]);
  const notes = uniqueStrings([
    ...repoFacts.highRiskAreas.map((item) => item.claim),
    ...repoFacts.knownPitfalls.map((item) => item.claim),
    ...repoFacts.unknowns.map((item) => `Unknown: ${item}`),
  ]);
  return {
    summary: repoFacts.summary,
    qualityRules:
      qualityRules.length > 0
        ? qualityRules
        : deterministicContextOutput(profile).qualityRules,
    commands,
    notes: notes.length > 0 ? notes : deterministicContextOutput(profile).notes,
  };
}

export function parseModelArtifactContent(text: string): ModelArtifactContent {
  const parsed = JSON.parse(stripJsonFence(text)) as unknown;
  return ModelArtifactContentSchema.parse(parsed);
}

export function parseModelSkillContent(text: string): ModelSkillContent {
  const parsed = JSON.parse(stripJsonFence(text)) as unknown;
  return ModelSkillContentSchema.parse(parsed);
}

export function profileFingerprint(profile: RepoProfile): string {
  return contentHash(JSON.stringify(fingerprintableProfile(profile)));
}

function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export type DriftFinding = {
  group:
    | "commands"
    | "ci"
    | "docs"
    | "templates"
    | "context"
    | "lock_config"
    | "boundaries"
    | "risk";
  changeType: "added" | "removed" | "changed";
  path: string;
  subject: string;
  previousValue: string | null;
  currentValue: string | null;
};

export function parseRepoProfileJson(content: string): RepoProfile | null {
  try {
    const parsed = RepoProfileSchema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function compareProfileDrift(input: {
  stored: RepoProfile;
  current: RepoProfile;
}): DriftFinding[] {
  return [
    ...compareCommandDrift(input.stored, input.current),
    ...compareCiWorkflowDrift(input.stored, input.current),
    ...compareDocsDrift(input.stored, input.current),
    ...compareTemplateDrift(input.stored, input.current),
    ...compareContextArtifactDrift(input.stored, input.current),
    ...compareLockConfigDrift(input.stored, input.current),
    ...compareBoundaryDrift(input.stored, input.current),
    ...compareRiskHintDrift(input.stored, input.current),
  ].sort(
    (left, right) =>
      left.group.localeCompare(right.group) ||
      left.path.localeCompare(right.path) ||
      left.subject.localeCompare(right.subject) ||
      left.changeType.localeCompare(right.changeType),
  );
}

function compareCommandDrift(
  stored: RepoProfile,
  current: RepoProfile,
): DriftFinding[] {
  const previousCommands = new Map(
    stored.commands.map((command) => [commandKey(command), command]),
  );
  const currentCommands = new Map(
    current.commands.map((command) => [commandKey(command), command]),
  );
  const findings: DriftFinding[] = [];

  for (const [key, command] of currentCommands) {
    const previous = previousCommands.get(key);
    if (!previous) {
      findings.push({
        group: "commands",
        changeType: "added",
        path: command.source,
        subject: commandSubject(command),
        previousValue: null,
        currentValue: command.command,
      });
      continue;
    }
    if (previous.command !== command.command) {
      findings.push({
        group: "commands",
        changeType: "changed",
        path: command.source,
        subject: commandSubject(command),
        previousValue: previous.command,
        currentValue: command.command,
      });
    }
  }

  for (const [key, command] of previousCommands) {
    if (currentCommands.has(key)) {
      continue;
    }
    findings.push({
      group: "commands",
      changeType: "removed",
      path: command.source,
      subject: commandSubject(command),
      previousValue: command.command,
      currentValue: null,
    });
  }

  return findings;
}

function commandKey(command: RepoProfile["commands"][number]): string {
  return `${command.source}:${command.name}`;
}

function commandSubject(command: RepoProfile["commands"][number]): string {
  const sourceKind = command.source.endsWith("package.json")
    ? "script"
    : "command";
  return `${command.source} ${sourceKind} ${command.name}`;
}

function compareCiWorkflowDrift(
  stored: RepoProfile,
  current: RepoProfile,
): DriftFinding[] {
  return comparePathListDrift({
    group: "ci",
    storedPaths: stored.ciWorkflows,
    currentPaths: current.ciWorkflows,
    storedHashes: stored.trackedFileHashes,
    currentHashes: current.trackedFileHashes,
  });
}

function compareDocsDrift(
  stored: RepoProfile,
  current: RepoProfile,
): DriftFinding[] {
  return comparePathListDrift({
    group: "docs",
    storedPaths: stored.importantDocs,
    currentPaths: current.importantDocs,
    storedHashes: stored.trackedFileHashes,
    currentHashes: current.trackedFileHashes,
  });
}

function compareTemplateDrift(
  stored: RepoProfile,
  current: RepoProfile,
): DriftFinding[] {
  return comparePathListDrift({
    group: "templates",
    storedPaths: stored.repoTemplates,
    currentPaths: current.repoTemplates,
    storedHashes: stored.trackedFileHashes,
    currentHashes: current.trackedFileHashes,
  });
}

function compareContextArtifactDrift(
  stored: RepoProfile,
  current: RepoProfile,
): DriftFinding[] {
  if (stored.contextArtifactHashes.length === 0) {
    return [];
  }
  return comparePathListDrift({
    group: "context",
    storedPaths: stored.contextArtifactHashes.map((item) => item.path),
    currentPaths: current.existingContextFiles.filter(isContextArtifactPath),
    storedHashes: stored.contextArtifactHashes,
    currentHashes: current.trackedFileHashes,
  });
}

function compareLockConfigDrift(
  stored: RepoProfile,
  current: RepoProfile,
): DriftFinding[] {
  return comparePathListDrift({
    group: "lock_config",
    storedPaths: [...stored.lockfiles, ...stored.configFiles],
    currentPaths: [...current.lockfiles, ...current.configFiles],
    storedHashes: stored.trackedFileHashes,
    currentHashes: current.trackedFileHashes,
  });
}

function compareBoundaryDrift(
  stored: RepoProfile,
  current: RepoProfile,
): DriftFinding[] {
  return comparePathListDrift({
    group: "boundaries",
    storedPaths: stored.architecturePathGroups,
    currentPaths: current.architecturePathGroups,
    storedHashes: [],
    currentHashes: [],
  });
}

function compareRiskHintDrift(
  stored: RepoProfile,
  current: RepoProfile,
): DriftFinding[] {
  return comparePathListDrift({
    group: "risk",
    storedPaths: stored.riskHintPaths,
    currentPaths: current.riskHintPaths,
    storedHashes: stored.trackedFileHashes,
    currentHashes: current.trackedFileHashes,
  });
}

function comparePathListDrift(input: {
  group: DriftFinding["group"];
  storedPaths: string[];
  currentPaths: string[];
  storedHashes: RepoProfile["trackedFileHashes"];
  currentHashes: RepoProfile["trackedFileHashes"];
}): DriftFinding[] {
  const storedPaths = new Set(input.storedPaths);
  const currentPaths = new Set(input.currentPaths);
  const storedHashes = new Map(
    input.storedHashes.map((item) => [item.path, item.hash]),
  );
  const currentHashes = new Map(
    input.currentHashes.map((item) => [item.path, item.hash]),
  );
  const allPaths = [...new Set([...input.storedPaths, ...input.currentPaths])]
    .filter(
      (repoPath) => storedPaths.has(repoPath) || currentPaths.has(repoPath),
    )
    .sort();
  const findings: DriftFinding[] = [];

  for (const repoPath of allPaths) {
    if (!storedPaths.has(repoPath)) {
      findings.push({
        group: input.group,
        changeType: "added",
        path: repoPath,
        subject: repoPath,
        previousValue: null,
        currentValue: currentHashes.get(repoPath) ?? null,
      });
      continue;
    }
    if (!currentPaths.has(repoPath)) {
      findings.push({
        group: input.group,
        changeType: "removed",
        path: repoPath,
        subject: repoPath,
        previousValue: storedHashes.get(repoPath) ?? null,
        currentValue: null,
      });
      continue;
    }
    const previousHash = storedHashes.get(repoPath);
    const currentHash = currentHashes.get(repoPath);
    if (previousHash && currentHash && previousHash !== currentHash) {
      findings.push({
        group: input.group,
        changeType: "changed",
        path: repoPath,
        subject: repoPath,
        previousValue: previousHash,
        currentValue: currentHash,
      });
    }
  }

  return findings;
}

function fingerprintableProfile(profile: RepoProfile) {
  return {
    repoId: profile.repoId,
    owner: profile.owner,
    name: profile.name,
    defaultBranch: profile.defaultBranch,
    primaryLanguages: profile.primaryLanguages,
    frameworks: profile.frameworks,
    packageManager: profile.packageManager,
    commands: profile.commands,
    ciWorkflows: profile.ciWorkflows,
    importantDocs: profile.importantDocs,
    repoTemplates: profile.repoTemplates,
    architecturePathGroups: profile.architecturePathGroups,
    generatedFileHints: profile.generatedFileHints,
    detectedRiskAreas: profile.detectedRiskAreas.filter(
      (area) => area !== "No repo-local agent context files detected.",
    ),
    riskHintPaths: profile.riskHintPaths,
    reviewRuleCandidates: profile.reviewRuleCandidates,
    evidence: profile.evidence.filter(
      (item) => !isContextArtifactPath(item.path),
    ),
    workspaceManifests: profile.workspaceManifests,
    lockfiles: profile.lockfiles,
    configFiles: profile.configFiles,
    trackedFileHashes: profile.trackedFileHashes.filter(
      (item) => !isContextArtifactPath(item.path),
    ),
    contextArtifactHashes: profile.contextArtifactHashes,
    agentReadiness: {
      categories: profile.agentReadiness.categories.filter((category) =>
        ["setup clarity", "architecture clarity", "testing and CI"].includes(
          category.name,
        ),
      ),
      missingItems: profile.agentReadiness.missingItems.filter(
        (item) =>
          !item.startsWith("agent instructions:") &&
          item !==
            "safety and review rules: .open-maintainer.yml policy file is missing.",
      ),
    },
  };
}

export function planArtifactWrites(input: {
  artifacts: GeneratedArtifact[];
  existingPaths: Set<string>;
  force?: boolean;
}): ArtifactWritePlanItem[] {
  return input.artifacts.map((artifact) => {
    const exists = input.existingPaths.has(artifact.type);
    if (!exists) {
      return {
        artifact,
        path: artifact.type,
        action: "write",
        reason: "file is absent",
      };
    }
    if (input.force) {
      return {
        artifact,
        path: artifact.type,
        action: "overwrite",
        reason: "force enabled",
      };
    }
    return {
      artifact,
      path: artifact.type,
      action: "skip",
      reason: "existing file preserved; rerun with --force to overwrite",
    };
  });
}

function commandLines(profile: RepoProfile): string[] {
  return profile.commands.map(
    (command) => `${command.name}: ${command.command} (${command.source})`,
  );
}

function resolvedCommands(
  profile: RepoProfile,
  output: StructuredContextOutput,
): string[] {
  return output.commands.length > 0 ? output.commands : commandLines(profile);
}

function formatCommandFact(command: z.infer<typeof CommandFactSchema>): string {
  return `${command.scope} ${command.name}: ${command.command} (${command.source}; ${command.confidence})`;
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items.filter((item) => item.trim().length > 0))];
}

function slugify(value: string): string {
  let slug = "";
  let needsSeparator = false;

  for (const character of value.toLowerCase()) {
    const isAsciiLetter = character >= "a" && character <= "z";
    const isDigit = character >= "0" && character <= "9";
    if (isAsciiLetter || isDigit) {
      if (needsSeparator && slug.length > 0) {
        slug += "-";
      }
      slug += character;
      needsSeparator = false;
    } else {
      needsSeparator = slug.length > 0;
    }
  }

  return slug || "repo";
}

function skillSlugFromPath(path: string): string | null {
  return (
    /^\.(?:agents|claude)\/skills\/(?<slug>[a-z0-9][a-z0-9-]*)\/SKILL\.md$/.exec(
      path,
    )?.groups?.slug ?? null
  );
}

function isContextArtifactPath(path: string): boolean {
  return (
    [
      "AGENTS.md",
      "CLAUDE.md",
      ".open-maintainer.yml",
      ".github/copilot-instructions.md",
      ".cursor/rules/open-maintainer.md",
      ".open-maintainer/profile.json",
      ".open-maintainer/report.md",
    ].includes(path) ||
    path.startsWith(".agents/skills/") ||
    path.startsWith(".claude/skills/")
  );
}

function listOrFallback(items: string[], fallback: string): string[] {
  return items.length > 0
    ? items.map((item) => `- ${item}`)
    : [`- ${fallback}`];
}

function metadataComment(profile: RepoProfile): string {
  return `${generatedMarker}; sourceProfileVersion=${profile.version}; profileHash=${profileFingerprint(profile)}`;
}

function stripJsonFence(text: string): string {
  const fence = "```";
  let stripped = text.trim();
  const lower = stripped.toLowerCase();
  if (lower.startsWith(`${fence}json`)) {
    stripped = stripped.slice(`${fence}json`.length).trimStart();
  } else if (stripped.startsWith(fence)) {
    stripped = stripped.slice(fence.length).trimStart();
  }
  if (stripped.endsWith(fence)) {
    stripped = stripped.slice(0, -fence.length).trimEnd();
  }
  return stripped.trim();
}

function selectPromptFileExcerpts(
  files: ContextSourceFile[],
): ContextSourceFile[] {
  const preferredPatterns = [
    /^README\.md$/,
    /^AGENTS\.md$/,
    /^Makefile$/,
    /^contracts\/Scarb\.toml$/,
    /^contracts\/src\/.*\.cairo$/,
    /^contracts\/tests\/.*\.cairo$/,
    /^packages\/frontend\/package\.json$/,
    /^packages\/frontend\/README\.md$/,
    /^packages\/frontend\/src\/.*\.(ts|tsx)$/,
    /^packages\/indexer\/package\.json$/,
    /^packages\/indexer\/README\.md$/,
    /^packages\/indexer\/src\/.*\.ts$/,
    /^docs\/(spec|TEST_QUALITY_AUDIT|INDEXER_FRONTEND_INTEGRATION|EVENTS|SENTRY|HORIZON-SPEC-COMPRESSED)\.md$/,
    /^\.github\/workflows\/.*\.ya?ml$/,
  ];
  const sorted = [...files].sort((left, right) => {
    const leftRank = preferredPatterns.findIndex((pattern) =>
      pattern.test(left.path),
    );
    const rightRank = preferredPatterns.findIndex((pattern) =>
      pattern.test(right.path),
    );
    return (
      rank(leftRank) - rank(rightRank) || left.path.localeCompare(right.path)
    );
  });
  const excerpts: ContextSourceFile[] = [];
  let totalCharacters = 0;
  for (const file of sorted) {
    if (totalCharacters >= 80_000) {
      break;
    }
    const content = file.content.slice(0, 6_000);
    excerpts.push({ path: file.path, content });
    totalCharacters += content.length;
  }
  return excerpts;
}

function rank(value: number): number {
  return value === -1 ? 999 : value;
}
