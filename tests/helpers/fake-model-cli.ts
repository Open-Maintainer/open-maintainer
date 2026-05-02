import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export async function createFakeCodexCli(): Promise<{
  command: string;
  env: Record<string, string>;
}> {
  const directory = await mkdtemp(path.join(tmpdir(), "om-fake-codex-"));
  const command = path.join(directory, "fake-codex.js");
  await writeFile(
    command,
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

if (process.argv.includes("--version")) {
  process.stdout.write("fake-codex 1.0.0\\n");
  process.exit(0);
}

const cdIndex = process.argv.indexOf("--cd");
const schemaIndex = process.argv.indexOf("--output-schema");
const outputIndex = process.argv.indexOf("--output-last-message");
const repoRoot = cdIndex >= 0 ? process.argv[cdIndex + 1] : process.cwd();
const schema = JSON.parse(fs.readFileSync(process.argv[schemaIndex + 1], "utf8"));
const outputPath = process.argv[outputIndex + 1];
const repoName = path.basename(repoRoot);
const slug = repoName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "repo";
const repeated = "Use repository evidence, run the detected validation command, and keep generated context scoped. ";
let output;

if (schema.required.includes("findings")) {
  output = {
    summary: {
      overview: "Model-backed review summary for " + repoName + ".",
      changedSurfaces: ["offline-test"],
      riskLevel: "low",
      validationSummary: "Fake provider observed no failing checks.",
      docsSummary: "Fake provider observed no required docs changes."
    },
    findings: [],
    mergeReadiness: {
      status: "ready",
      reason: "Fake provider found no cited findings.",
      requiredActions: []
    },
    residualRisk: [{
      risk: "Fake provider output is synthetic.",
      reason: "The fake CLI is used only for offline tests.",
      suggestedFollowUp: "Run a real provider review before relying on review quality."
    }]
  };
} else if (schema.required.includes("summary")) {
  output = {
    summary: "local/" + repoName + " is generated from model-analyzed repository facts.",
    evidenceMap: [{ claim: "Package metadata was inspected.", evidence: ["package.json"], confidence: "observed" }],
    repositoryMap: [{ path: "src", purpose: "Source files.", evidence: ["src"], confidence: "inferred" }],
    commands: [{ name: "test", command: "vitest run", scope: "tests", source: "package.json", purpose: "Run tests.", confidence: "observed" }],
    setup: { requirements: [{ claim: "Install dependencies with the detected package manager.", evidence: ["package.json"], confidence: "inferred" }], unknowns: [] },
    architecture: { observed: [], inferred: [], unknowns: ["Detailed architecture was not detected."] },
    changeRules: { safeEditZones: [], carefulEditZones: [], doNotEditWithoutExplicitInstruction: [], unknowns: [] },
    testingStrategy: { locations: [], commands: [{ name: "test", command: "vitest run", scope: "tests", source: "package.json", purpose: "Run tests.", confidence: "observed" }], namingConventions: [], regressionExpectations: ["Add focused regression tests for changed behavior."], unknowns: [] },
    validation: { canonicalCommand: { name: "test", command: "vitest run", scope: "tests", source: "package.json", purpose: "Run tests.", confidence: "observed" }, scopedCommands: [], unknowns: [] },
    prRules: ["Report validation evidence."],
    knownPitfalls: [],
    generatedFiles: [],
    highRiskAreas: [],
    documentationAlignment: [],
    unknowns: []
  };
} else if (schema.required.includes("agentsMd")) {
  output = {
    agentsMd: "# AGENTS.md instructions for local/" + repoName + "\\n\\n" + repeated + repeated,
    claudeMd: "# CLAUDE.md instructions for local/" + repoName + "\\n\\n" + repeated + repeated,
    copilotInstructions: "# Copilot instructions for local/" + repoName + "\\n\\n" + repeated + repeated,
    cursorRule: "---\\ndescription: local " + slug + " rules\\nalwaysApply: true\\n---\\n\\n" + repeated + repeated
  };
} else {
  const skill = (role, title) => ({
    path: ".agents/skills/" + slug + "-" + role + "/SKILL.md",
    name: slug + "-" + role,
    description: "Use this " + title + " workflow in " + repoName + ".",
    markdown: "---\\nname: " + slug + "-" + role + "\\ndescription: Use this " + title + " workflow in " + repoName + ".\\n---\\n\\n# " + title + "\\n\\n## Use when\\n- Working in this repo.\\n\\n## Do not use when\\n- The task is unrelated.\\n\\n## Read first\\n- README.md\\n\\n## Workflow\\n- Inspect evidence before editing.\\n\\n## Validation\\n- Run vitest run.\\n\\n## Documentation\\n- Check README.md.\\n\\n## Risk checks\\n- Keep changes scoped.\\n\\n## Done when\\n- Evidence is reported."
  });
  output = { skills: [skill("start-task", "Start Task"), skill("testing-workflow", "Testing Workflow"), skill("pr-review", "PR Review")] };
}

process.stdin.resume();
process.stdin.on("data", () => {});
process.stdin.on("end", () => {
  fs.writeFileSync(outputPath, JSON.stringify(output));
});
`,
  );
  await chmod(command, 0o755);
  return {
    command,
    env: { OPEN_MAINTAINER_CODEX_COMMAND: command },
  };
}

export const codexGenerateArgs = ["--model", "codex", "--allow-write"] as const;
