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
let promptText = "";
let output;

if (schema.required.includes("classification")) {
  if (process.env.OPEN_MAINTAINER_FAKE_CODEX_ISSUE_TRIAGE === "invalid-json") {
    output = "not an issue triage object";
  } else {
    const noEvidence = process.env.OPEN_MAINTAINER_FAKE_CODEX_ISSUE_TRIAGE === "no-evidence";
    const spam = process.env.OPEN_MAINTAINER_FAKE_CODEX_ISSUE_TRIAGE === "spam";
    const ready = process.env.OPEN_MAINTAINER_FAKE_CODEX_ISSUE_TRIAGE === "ready";
    output = {
      classification: spam ? "possible_spam" : ready ? "ready_for_review" : "needs_author_input",
      agentReadiness: ready ? "agent_ready" : "not_agent_ready",
      confidence: spam ? 0.82 : ready ? 0.9 : 0.71,
      riskFlags: spam ? ["unclear_scope"] : ready ? [] : ["unclear_scope", "missing_validation"],
      labelIntents: spam ? ["possible_spam"] : ready ? ["ready_for_review", "agent_ready"] : ["needs_author_input", "needs_validation"],
      recommendation: spam ? "Close as policy-focused spam only if configured guardrails allow it." : ready ? "Proceed with a bounded implementation brief." : "Ask the author for reproduction steps and validation expectations.",
      rationale: spam ? "The fake provider is simulating a possible spam issue." : ready ? "The fake provider is simulating an agent-ready issue." : "The issue evidence is available, but the fake provider is configured to require more author detail.",
      evidence: noEvidence ? [] : [{
        source: "github_issue",
        path: null,
        url: "https://github.com/acme/triage-fixture/issues/42",
        excerpt: "The command should triage one issue locally.",
        reason: "Primary issue text describes the requested local triage behavior."
      }],
      missingInformation: ready ? [] : ["Minimal reproduction or exact expected behavior"],
      requiredAuthorActions: ready ? [] : ["Add a concrete acceptance criterion and validation command."],
      nextAction: ready ? "Generate a task brief for agent handoff." : "Request author input before agent handoff.",
      commentPreview: {
        marker: "<!-- open-maintainer:issue-triage -->",
        summary: "Needs author input before implementation.",
        body: "Please add a concrete acceptance criterion and validation command before this is ready for implementation.",
        artifactPath: ".open-maintainer/triage/issues/42.json"
      }
    };
  }
} else if (schema.required.includes("findings")) {
  const findings = process.env.OPEN_MAINTAINER_FAKE_CODEX_FINDING === "1"
    ? [{
        severity: "major",
        category: "correctness",
        title: "Return value change needs a fix",
        file: "src/index.ts",
        line: 2,
        evidence: [{
          id: "patch:1",
          kind: "patch",
          summary: "The changed function now returns a different value."
        }],
        impact: "Callers can observe the changed return value.",
        recommendation: "Add or adjust tests and confirm the changed value is intended."
      }]
    : [];
  output = {
    summary: {
      overview: "Model-backed review summary for " + repoName + ".",
      changedSurfaces: ["offline-test"],
      riskLevel: "low",
      validationSummary: "Fake provider observed no failing checks.",
      docsSummary: "Fake provider observed no required docs changes."
    },
    findings,
    contributionTriage: {
      category: "ready_for_review",
      recommendation: "Proceed with normal maintainer review.",
      evidence: [{
        id: "precheck:contribution:1",
        kind: "precheck",
        summary: "PR intent and changed files are available for review."
      }],
      missingInformation: [],
      requiredActions: []
    },
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
process.stdin.on("data", (chunk) => {
  promptText += chunk.toString();
});
process.stdin.on("end", () => {
  if (
    schema.required.includes("classification") &&
    process.env.OPEN_MAINTAINER_FAKE_CODEX_ISSUE_TRIAGE === "mixed"
  ) {
    if (promptText.includes('"issueNumber": 43')) {
      output = {
        ...output,
        evidence: [],
      };
    }
    if (promptText.includes('"issueNumber": 44')) {
      output = {
        ...output,
        classification: "ready_for_review",
        agentReadiness: "agent_ready",
        confidence: 0.88,
        riskFlags: [],
        labelIntents: ["ready_for_review", "agent_ready"],
        recommendation: "Ready for maintainer review.",
        rationale: "The issue includes enough scope and acceptance evidence for the fake provider.",
        missingInformation: [],
        requiredAuthorActions: [],
        nextAction: "Proceed to maintainer review.",
        commentPreview: {
          marker: "<!-- open-maintainer:issue-triage -->",
          summary: "Ready for review.",
          body: "This issue appears ready for maintainer review.",
          artifactPath: ".open-maintainer/triage/issues/44.json"
        }
      };
    }
  }
  if (
    schema.required.includes("classification") &&
    process.env.OPEN_MAINTAINER_FAKE_CODEX_ISSUE_TRIAGE === "all-classifications"
  ) {
    const issueMatch = promptText.match(/"issueNumber":\\s*(\\d+)/);
    const issueNumber = issueMatch ? Number(issueMatch[1]) : 0;
    const byIssue = {
      42: {
        classification: "ready_for_review",
        agentReadiness: "agent_ready",
        confidence: 0.91,
        riskFlags: [],
        labelIntents: ["ready_for_review", "agent_ready"],
        recommendation: "Proceed with maintainer review and generate a task brief.",
        rationale: "The issue has a clear goal, acceptance criteria, likely files, and validation expectations.",
        missingInformation: [],
        requiredAuthorActions: [],
        nextAction: "Generate an agent task brief for the scoped CLI change.",
        summary: "Ready for review."
      },
      43: {
        classification: "needs_author_input",
        agentReadiness: "not_agent_ready",
        confidence: 0.73,
        riskFlags: ["unclear_scope", "missing_validation"],
        labelIntents: ["needs_author_input", "needs_reproduction", "needs_validation"],
        recommendation: "Ask the reporter for reproduction steps, environment details, and expected validation.",
        rationale: "The bug report describes a symptom but omits a reproducible path and validation evidence.",
        missingInformation: ["Minimal reproduction", "Observed and expected behavior", "Validation command"],
        requiredAuthorActions: ["Add a reproducible example and the command that demonstrates the failure."],
        nextAction: "Request author input before maintainer review.",
        summary: "Needs author input."
      },
      44: {
        classification: "needs_maintainer_design",
        agentReadiness: "needs_human_design",
        confidence: 0.82,
        riskFlags: ["broad_scope"],
        labelIntents: ["needs_maintainer_design", "needs_human_design"],
        recommendation: "Route to a maintainer for the product policy decision before implementation.",
        rationale: "The issue asks for a triage policy choice and does not define the intended behavior.",
        missingInformation: ["Maintainer-approved policy decision"],
        requiredAuthorActions: [],
        nextAction: "Get maintainer design direction before assigning implementation.",
        summary: "Needs maintainer design."
      },
      45: {
        classification: "not_agent_ready",
        agentReadiness: "not_agent_ready",
        confidence: 0.8,
        riskFlags: ["security_sensitive", "high_risk_path"],
        labelIntents: ["not_agent_ready", "security_sensitive", "high_risk_path"],
        recommendation: "Keep this in human maintainer review because it touches sensitive credential handling.",
        rationale: "The issue targets authentication and secret handling without enough safety constraints for agent execution.",
        missingInformation: ["Threat model", "Security review owner"],
        requiredAuthorActions: ["Describe the security boundary and required manual review path."],
        nextAction: "Escalate to human maintainer review instead of agent handoff.",
        summary: "Not agent-ready."
      },
      46: {
        classification: "possible_spam",
        agentReadiness: "not_agent_ready",
        confidence: 0.86,
        riskFlags: ["unclear_scope"],
        labelIntents: ["possible_spam"],
        recommendation: "Close only if configured spam-closure guardrails and comment requirements pass.",
        rationale: "The issue is promotional, does not request a repo-specific change, and lacks actionable evidence.",
        missingInformation: ["Repo-specific requested change"],
        requiredAuthorActions: ["Replace promotional content with a concrete bug, feature, or docs request."],
        nextAction: "Treat as possible spam under maintainer-configured guardrails.",
        summary: "Possible spam."
      }
    };
    const scenario = byIssue[issueNumber];
    if (issueNumber === 47) {
      output = {
        ...output,
        evidence: [],
      };
    } else if (scenario) {
      output = {
        classification: scenario.classification,
        agentReadiness: scenario.agentReadiness,
        confidence: scenario.confidence,
        riskFlags: scenario.riskFlags,
        labelIntents: scenario.labelIntents,
        recommendation: scenario.recommendation,
        rationale: scenario.rationale,
        evidence: [{
          source: "github_issue",
          path: null,
          url: "https://github.com/acme/triage-fixture/issues/" + issueNumber,
          excerpt: "The mock issue includes realistic triage evidence for classification coverage.",
          reason: "Primary issue text drives the synthetic validation scenario."
        }],
        missingInformation: scenario.missingInformation,
        requiredAuthorActions: scenario.requiredAuthorActions,
        nextAction: scenario.nextAction,
        commentPreview: {
          marker: "<!-- open-maintainer:issue-triage -->",
          summary: scenario.summary,
          body: scenario.recommendation,
          artifactPath: ".open-maintainer/triage/issues/" + issueNumber + ".json"
        }
      };
    }
  }
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
