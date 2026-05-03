import { describe, expect, it } from "vitest";
import {
  buildIssueTriageEvidence,
  buildIssueTriageModelPrompt,
  buildIssueTriageTaskBrief,
  extractAcceptanceCriteriaCandidates,
  extractReferencedIssueNumbers,
  extractReferencedSurfaces,
  issueTriageModelOutputJsonSchema,
  mapIssueTriageLabelIntents,
  parseIssueTriageModelCompletion,
  parseIssueTriageModelResult,
  renderIssueTriageCommentPreview,
  safeParseIssueTriageModelResult,
} from "../src";
import * as triage from "../src";

const validModelResult = {
  classification: "needs_human_design",
  qualityScore: 63,
  spamRisk: "low",
  agentReadiness: "needs_human_design",
  confidence: 0.84,
  signals: ["needs_human_design"],
  evidence: [
    {
      signal: "needs_human_design",
      issueTextQuote: "Decide what the dashboard should do here.",
      reason: "The issue asks for a design decision.",
    },
  ],
  missingInfo: ["acceptance_criteria"],
  possibleDuplicates: [],
  maintainerSummary: "Route to maintainer design before implementation.",
};

describe("issue triage package", () => {
  it("validates model output without assigning a classification", () => {
    expect(parseIssueTriageModelResult(validModelResult).classification).toBe(
      "needs_human_design",
    );
    expect(
      safeParseIssueTriageModelResult({
        ...validModelResult,
        classification: "looks_good",
      }).success,
    ).toBe(false);
  });

  it("maps known triage signals to default or configured issue labels", () => {
    expect(
      mapIssueTriageLabelIntents(["needs_author_input", "possibly_spam"]),
    ).toEqual([
      {
        signal: "needs_author_input",
        label: "needs-author-input",
      },
      {
        signal: "possibly_spam",
        label: "possibly-spam",
      },
    ]);

    expect(
      mapIssueTriageLabelIntents(["needs_author_input"], {
        needs_author_input: "needs-info",
      }),
    ).toEqual([{ signal: "needs_author_input", label: "needs-info" }]);
  });

  it("does not expose a deterministic issue quality classifier", () => {
    expect(Object.keys(triage).some((name) => /^classify/i.test(name))).toBe(
      false,
    );
  });

  it("assembles bounded issue evidence without assigning readiness", () => {
    const evidence = buildIssueTriageEvidence({
      repoId: "repo_1",
      owner: "Open-Maintainer",
      repo: "open-maintainer",
      issue: {
        number: 81,
        title: "Gather issue triage evidence without classifying issues",
        body: [
          "## Bug report",
          "The CLI needs evidence from `packages/triage/src/index.ts`.",
          "",
          "## Acceptance criteria",
          "- [ ] Evidence includes comments",
          "- Related #80 is cited",
        ].join("\n"),
        author: "maintainer",
        labels: ["enhancement"],
        state: "open",
        url: "https://github.com/Open-Maintainer/open-maintainer/issues/81",
        createdAt: "2026-05-03T00:00:00.000Z",
        updatedAt: "2026-05-03T00:01:00.000Z",
      },
      comments: [
        {
          id: 10,
          body: "Also inspect docs/DEMO_RUNBOOK.md before changing UX.",
          author: "reviewer",
          url: "https://github.com/Open-Maintainer/open-maintainer/issues/81#issuecomment-10",
          createdAt: "2026-05-03T00:02:00.000Z",
          updatedAt: "2026-05-03T00:02:00.000Z",
        },
      ],
      relatedIssues: [
        {
          number: 80,
          title: "Define the issue triage contract",
          url: "https://github.com/Open-Maintainer/open-maintainer/issues/80",
          reason: "Issue text references this issue.",
        },
      ],
    });

    expect(evidence.acceptanceCriteriaCandidates).toEqual([
      "Evidence includes comments",
      "Related #80 is cited",
    ]);
    expect(evidence.templateHints).toContain("Bug report");
    expect(evidence.referencedSurfaces).toEqual([
      "packages/triage/src/index.ts",
      "docs/DEMO_RUNBOOK.md",
    ]);
    expect(evidence.citations.map((citation) => citation.source)).toContain(
      "github_comment",
    );
    expect(JSON.stringify(evidence)).not.toContain("agent_ready");
    expect(JSON.stringify(evidence)).not.toContain("ready_for_review");
  });

  it("extracts issue references and repository surfaces from issue text", () => {
    expect(
      extractReferencedIssueNumbers(
        "Related to #12, fixes acme/tool#13, and https://github.com/acme/tool/issues/14.",
      ),
    ).toEqual([12, 13, 14]);
    expect(
      extractReferencedSurfaces(
        "Touches `README.md`, apps/cli/src/index.ts, packages/triage/src/index.ts.",
      ),
    ).toEqual([
      "README.md",
      "apps/cli/src/index.ts",
      "packages/triage/src/index.ts",
    ]);
    expect(
      extractAcceptanceCriteriaCandidates(
        "## Acceptance criteria\n1. First result\n- Second result\n\n## Notes\nIgnore this",
      ),
    ).toEqual(["First result", "Second result"]);
  });

  it("builds issue triage prompts with explicit non-authorship boundaries", () => {
    const evidence = buildIssueTriageEvidence({
      repoId: "repo_1",
      owner: "Open-Maintainer",
      repo: "open-maintainer",
      issue: {
        number: 82,
        title: "Triage one issue locally",
        body: "## Acceptance criteria\n- The command is non-mutating by default",
        author: "maintainer",
        labels: [],
        state: "open",
        url: "https://github.com/Open-Maintainer/open-maintainer/issues/82",
        createdAt: "2026-05-03T00:00:00.000Z",
        updatedAt: "2026-05-03T00:01:00.000Z",
      },
    });
    const prompt = buildIssueTriageModelPrompt({
      repoId: "repo_1",
      owner: "Open-Maintainer",
      repo: "open-maintainer",
      issueNumber: 82,
      evidence,
      modelProvider: "Codex CLI",
      model: "gpt-test",
      consentMode: "explicit_repository_content_transfer",
      createdAt: "2026-05-03T00:02:00.000Z",
    });

    expect(prompt.system).toContain(
      "Do not determine whether the author used AI",
    );
    expect(prompt.user).toContain("ready_for_maintainer_review");
    expect(prompt.user).toContain("The command is non-mutating by default");
    expect(issueTriageModelOutputJsonSchema.required).toContain(
      "classification",
    );
  });

  it("keeps the Codex output schema strict-compatible", () => {
    expect(issueTriageModelOutputJsonSchema.required).toContain(
      "suggestedAuthorRequest",
    );
    expect(
      issueTriageModelOutputJsonSchema.properties.evidence.items.required,
    ).toEqual(["signal", "issueTextQuote", "reason"]);
  });

  it("parses issue triage model completions and rejects missing citations", () => {
    const parsed = parseIssueTriageModelCompletion(
      JSON.stringify(validModelResult),
    );
    expect(parsed.classification).toBe("needs_human_design");

    expect(() =>
      parseIssueTriageModelCompletion(
        JSON.stringify({ ...validModelResult, evidence: [] }),
      ),
    ).toThrow("Invalid issue triage model output");
    expect(() => parseIssueTriageModelCompletion("not json")).toThrow(
      "Invalid issue triage model output",
    );
  });

  it("renders deterministic issue triage comments without authorship language", () => {
    const comment = renderIssueTriageCommentPreview(
      parseIssueTriageModelResult(validModelResult),
      ".open-maintainer/triage/issues/10.json",
    );

    expect(comment.body).toContain("<!-- open-maintainer:issue-triage -->");
    expect(comment.body).toContain("Acceptance Criteria");
    expect(comment.body).toContain("Needs Human Design");
    expect(comment.body.toLowerCase()).not.toContain("used ai");
    expect(comment.body.toLowerCase()).not.toContain("authorship");
    expect(comment.artifactPath).toBe(".open-maintainer/triage/issues/10.json");
  });

  it("renders agent task briefs for agent-ready triage results", () => {
    const evidence = buildIssueTriageEvidence({
      repoId: "repo_1",
      owner: "Open-Maintainer",
      repo: "open-maintainer",
      issue: {
        number: 87,
        title: "Generate task briefs",
        body: [
          "## Feature request",
          "Generate a brief for `apps/cli/src/index.ts`.",
          "",
          "## Acceptance criteria",
          "- Briefs include validation commands",
        ].join("\n"),
        author: "maintainer",
        labels: ["enhancement"],
        state: "open",
        url: "https://github.com/Open-Maintainer/open-maintainer/issues/87",
        createdAt: "2026-05-03T00:00:00.000Z",
        updatedAt: "2026-05-03T00:01:00.000Z",
      },
    });
    const brief = buildIssueTriageTaskBrief({
      result: {
        ...validModelResult,
        classification: "ready_for_maintainer_review",
        agentReadiness: "agent_ready",
        qualityScore: 91,
        signals: ["ready_for_maintainer_review", "agent_ready"],
        missingInfo: [],
        maintainerSummary: "Ready for maintainer review.",
      },
      evidence,
      readFirstPaths: ["AGENTS.md", "README.md"],
      validationCommands: [
        { name: "test", command: "bun test", source: "package.json" },
        { name: "typecheck", command: "bun typecheck", source: "package.json" },
      ],
    });

    expect(brief.status).toBe("generated");
    expect(brief.goal).toContain("#87");
    expect(brief.userVisibleBehavior).toContain(
      "Briefs include validation commands",
    );
    expect(brief.readFirst).toContain("AGENTS.md");
    expect(brief.likelyFiles).toContain("apps/cli/src/index.ts");
    expect(brief.validationCommands.map((command) => command.command)).toEqual([
      "bun typecheck",
      "bun test",
    ]);
    expect(brief.markdown).toContain("## Escalation Risks");
  });

  it("skips task briefs for non-agent-ready results without override", () => {
    const evidence = buildIssueTriageEvidence({
      repoId: "repo_1",
      owner: "Open-Maintainer",
      repo: "open-maintainer",
      issue: {
        number: 88,
        title: "Needs design",
        body: "Maintainer needs to choose the workflow.",
        author: "maintainer",
        labels: ["enhancement"],
        state: "open",
        url: "https://github.com/Open-Maintainer/open-maintainer/issues/88",
        createdAt: "2026-05-03T00:00:00.000Z",
        updatedAt: "2026-05-03T00:01:00.000Z",
      },
    });

    const brief = buildIssueTriageTaskBrief({
      result: validModelResult,
      evidence,
      validationCommands: [],
    });

    expect(brief.status).toBe("skipped");
    expect(brief.escalationRisks.join(" ")).toContain("Needs Human Design");
  });

  it("renders override task briefs for non-agent-ready results with risks", () => {
    const evidence = buildIssueTriageEvidence({
      repoId: "repo_1",
      owner: "Open-Maintainer",
      repo: "open-maintainer",
      issue: {
        number: 89,
        title: "Needs human design",
        body: "## Acceptance criteria\n- Maintainer approves the scope",
        author: "maintainer",
        labels: ["enhancement"],
        state: "open",
        url: "https://github.com/Open-Maintainer/open-maintainer/issues/89",
        createdAt: "2026-05-03T00:00:00.000Z",
        updatedAt: "2026-05-03T00:01:00.000Z",
      },
    });

    const brief = buildIssueTriageTaskBrief({
      result: validModelResult,
      evidence,
      validationCommands: [],
      allowNonAgentReady: true,
    });

    expect(brief.status).toBe("generated");
    expect(brief.safetyNotes.join(" ")).toContain("Override path");
    expect(brief.doneCriteria).toContain("Maintainer approves the scope");
    expect(brief.escalationRisks.join(" ")).toContain(
      "Non-agent-ready override",
    );
  });
});
