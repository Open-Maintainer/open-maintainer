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
import { createIssueTriageWorkflow } from "../src/workflow";

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

  it("runs the issue triage workflow preview and apply boundary", async () => {
    const evidence = buildWorkflowEvidence();
    const repoLabels = new Set<string>();
    const issueLabels = new Set<string>();
    const writes: string[] = [];
    const artifacts: Array<{ path: string; resultIssue: number }> = [];
    const workflow = createIssueTriageWorkflow({
      repo: {
        repoId: "repo_1",
        owner: "Open-Maintainer",
        repo: "open-maintainer",
        sourceProfileVersion: 1,
      },
      github: {
        async fetchEvidence() {
          return evidence;
        },
        async listRepoLabels() {
          return [...repoLabels].map((name) => ({ name }));
        },
        async listRepoLabelNames() {
          return repoLabels;
        },
        async listIssueLabelNames() {
          return issueLabels;
        },
        async createLabel(label) {
          writes.push(`create:${label.label}`);
          repoLabels.add(label.label);
        },
        async applyLabel(_issueNumber, label) {
          writes.push(`apply:${label}`);
          issueLabels.add(label);
        },
        async listTriageComments() {
          return [];
        },
        async postComment(issueNumber) {
          writes.push(`comment:${issueNumber}`);
        },
        async updateComment(commentId) {
          writes.push(`update:${commentId}`);
        },
        async closeIssue(issueNumber) {
          writes.push(`close:${issueNumber}`);
        },
        async listIssues() {
          return [];
        },
      },
      model: {
        provider: "Codex CLI",
        model: "gpt-test",
        async complete() {
          return { text: JSON.stringify(validModelResult), model: "gpt-test" };
        },
      },
      artifacts: {
        async writeIssue(path, artifact) {
          artifacts.push({ path, resultIssue: artifact.result.issueNumber });
        },
        async readIssue() {
          throw new Error("unused");
        },
      },
      clock: () => "2026-05-03T00:03:00.000Z",
      ids: {
        triageResult: () => "issue_triage_test",
        batchRun: () => "triage_run_test",
      },
    });

    const preview = await workflow.preview(82, { createMissingLabels: true });
    expect(preview.input.evidence.issue.number).toBe(82);
    expect(preview.result.commentPreview.body).toContain(
      "<!-- open-maintainer:issue-triage -->",
    );
    expect(preview.result.resolvedLabels.map((label) => label.label)).toEqual([
      "needs-human-design",
    ]);
    expect(preview.result.writeActions).toEqual([]);

    const applied = await workflow.apply(preview.writePlan, {
      labels: true,
      createMissingLabels: true,
      comment: true,
    });

    expect(writes).toEqual([
      "create:needs-human-design",
      "apply:needs-human-design",
      "comment:82",
    ]);
    expect(
      applied.result.writeActions.filter(
        (action) => action.status === "applied",
      ),
    ).toHaveLength(3);
    expect(artifacts).toEqual([
      {
        path: ".open-maintainer/triage/issues/82.json",
        resultIssue: 82,
      },
    ]);
  });

  it("keeps issue triage workflow dry runs non-mutating", async () => {
    const evidence = buildWorkflowEvidence();
    const writes: string[] = [];
    const artifacts: string[] = [];
    const workflow = createIssueTriageWorkflow({
      repo: {
        repoId: "repo_1",
        owner: "Open-Maintainer",
        repo: "open-maintainer",
      },
      github: {
        async fetchEvidence() {
          return evidence;
        },
        async listRepoLabels() {
          return [];
        },
        async listRepoLabelNames() {
          return new Set();
        },
        async listIssueLabelNames() {
          return new Set();
        },
        async createLabel(label) {
          writes.push(`create:${label.label}`);
        },
        async applyLabel(_issueNumber, label) {
          writes.push(`apply:${label}`);
        },
        async listTriageComments() {
          return [];
        },
        async postComment(issueNumber) {
          writes.push(`comment:${issueNumber}`);
        },
        async updateComment(commentId) {
          writes.push(`update:${commentId}`);
        },
        async closeIssue(issueNumber) {
          writes.push(`close:${issueNumber}`);
        },
        async listIssues() {
          return [];
        },
      },
      model: {
        provider: "Codex CLI",
        model: "gpt-test",
        async complete() {
          return { text: JSON.stringify(validModelResult), model: "gpt-test" };
        },
      },
      artifacts: {
        async writeIssue(path) {
          artifacts.push(path);
        },
        async readIssue() {
          throw new Error("unused");
        },
      },
    });

    const preview = await workflow.preview(82, { createMissingLabels: true });
    const applied = await workflow.apply(preview.writePlan, {
      labels: true,
      createMissingLabels: true,
      comment: true,
      close: true,
      dryRun: true,
    });

    expect(writes).toEqual([]);
    expect(artifacts).toEqual([]);
    expect(
      applied.result.writeActions.every(
        (action) => action.status === "skipped",
      ),
    ).toBe(true);
    expect(
      applied.result.writeActions.some((action) =>
        action.reason.startsWith("Dry run:"),
      ),
    ).toBe(true);
  });

  it("suppresses workflow label writes below the confidence threshold", async () => {
    const { workflow, writes } = createWorkflowHarness({
      labels: ["needs-human-design"],
    });

    const preview = await workflow.preview(82);
    const applied = await workflow.apply(preview.writePlan, {
      labels: true,
      minConfidence: 0.9,
    });

    expect(writes).toEqual([]);
    expect(
      applied.result.writeActions.some(
        (action) =>
          action.type === "apply_label" &&
          action.status === "skipped" &&
          action.target === "needs-human-design",
      ),
    ).toBe(true);
  });

  it("enforces workflow closure policy and closure caps", async () => {
    const { workflow, writes } = createWorkflowHarness({
      repo: {
        closure: {
          allowPossibleSpam: true,
          allowStaleAuthorInput: false,
          staleAuthorInputDays: 14,
          requireCommentBeforeClose: false,
          maxClosuresPerRun: 1,
        },
      },
      modelForIssue: () => spamModelResult,
    });

    const first = await workflow.preview(82);
    const firstApplied = await workflow.apply(first.writePlan, {
      close: true,
    });
    const second = await workflow.preview(83);
    const secondApplied = await workflow.apply(second.writePlan, {
      close: true,
    });

    expect(writes).toEqual(["close:82"]);
    expect(
      firstApplied.result.writeActions.some(
        (action) =>
          action.type === "close_issue" && action.status === "applied",
      ),
    ).toBe(true);
    expect(
      secondApplied.result.writeActions.some(
        (action) =>
          action.type === "close_issue" &&
          action.status === "skipped" &&
          action.reason.includes("Closure cap reached"),
      ),
    ).toBe(true);
  });

  it("continues workflow batch triage through per-issue failures and writes reports", async () => {
    const { workflow, reports } = createWorkflowHarness({
      listIssues: [
        { number: 82, title: "Triage one issue locally", labels: [] },
        { number: 83, title: "Broken model output", labels: [] },
      ],
      modelForIssue(issueNumber) {
        return issueNumber === 83 ? "not json" : validModelResult;
      },
    });

    const batch = await workflow.batch({ limit: 2 });

    expect(batch.report.issueCount).toBe(2);
    expect(batch.report.issues.map((record) => record.status)).toEqual([
      "succeeded",
      "failed",
    ]);
    expect(reports).toEqual([
      {
        jsonPath: ".open-maintainer/triage/runs/triage_run_test.json",
        markdownPath: ".open-maintainer/triage/runs/triage_run_test.md",
        issueCount: 2,
      },
    ]);
    expect(batch.markdown).toContain("## Errors");
    expect(batch.markdown).toContain("#83 Broken model output: error:");
  });

  it("applies workflow batch issue selection rules at the boundary", async () => {
    const listIssues = [
      { number: 82, title: "Unlabelled issue", labels: [] },
      { number: 83, title: "Already triaged issue", labels: ["triaged"] },
      { number: 84, title: "Bug issue", labels: ["bug"] },
      { number: 85, title: "Second unlabelled issue", labels: [] },
    ];
    const defaultHarness = createWorkflowHarness({
      repo: {
        batch: {
          defaultState: "closed",
          maxIssues: 3,
          includeLabels: [],
          excludeLabels: ["triaged"],
        },
      },
      listIssues,
    });

    const defaultBatch = await defaultHarness.workflow.batch();

    expect(defaultBatch.report.state).toBe("closed");
    expect(
      defaultBatch.report.issues.map((record) => record.issueNumber),
    ).toEqual([82, 85]);

    const includeHarness = createWorkflowHarness({ listIssues });
    const includeBatch = await includeHarness.workflow.batch({
      includeLabels: ["bug"],
      excludeLabels: ["triaged"],
      limit: 3,
    });

    expect(
      includeBatch.report.issues.map((record) => record.issueNumber),
    ).toEqual([84]);
  });

  it("generates workflow task briefs from existing artifacts and requires override for non-agent-ready output", async () => {
    const agentReadyResult = {
      ...validModelResult,
      classification: "ready_for_maintainer_review" as const,
      agentReadiness: "agent_ready" as const,
      qualityScore: 91,
      signals: ["ready_for_maintainer_review", "agent_ready"] as const,
      missingInfo: [],
      maintainerSummary: "Ready for maintainer review.",
    };
    const artifact = buildWorkflowArtifact(agentReadyResult);
    const { workflow, artifacts, markdowns } = createWorkflowHarness({
      artifact,
      repo: {
        validationCommands: [
          { name: "test", command: "bun test", source: "package.json" },
        ],
        readFirstPaths: ["AGENTS.md"],
      },
    });

    const brief = await workflow.brief(82, {
      outputPath: ".open-maintainer/triage/issues/82-brief.md",
    });

    expect(brief.brief.status).toBe("generated");
    expect(brief.brief.readFirst).toContain("AGENTS.md");
    expect(artifacts).toEqual([
      {
        path: ".open-maintainer/triage/issues/82.json",
        resultIssue: 82,
        taskBriefStatus: "generated",
      },
    ]);
    expect(markdowns).toEqual([
      {
        path: ".open-maintainer/triage/issues/82-brief.md",
        containsBrief: true,
      },
    ]);

    const skippedHarness = createWorkflowHarness({
      artifact: buildWorkflowArtifact(validModelResult),
    });
    const skipped = await skippedHarness.workflow.brief(82, { dryRun: true });
    expect(skipped.brief.status).toBe("skipped");
    expect(skippedHarness.artifacts).toEqual([]);

    const override = await skippedHarness.workflow.brief(82, {
      allowNonAgentReady: true,
    });
    expect(override.brief.status).toBe("generated");
    expect(skippedHarness.artifacts).toEqual([
      {
        path: ".open-maintainer/triage/issues/82.json",
        resultIssue: 82,
        taskBriefStatus: "generated",
      },
    ]);
  });
});

function buildWorkflowEvidence(issueNumber = 82) {
  return buildIssueTriageEvidence({
    repoId: "repo_1",
    owner: "Open-Maintainer",
    repo: "open-maintainer",
    issue: {
      number: issueNumber,
      title:
        issueNumber === 83 ? "Broken model output" : "Triage one issue locally",
      body: "## Acceptance criteria\n- The command is non-mutating by default",
      author: "maintainer",
      labels: [],
      state: "open",
      url: `https://github.com/Open-Maintainer/open-maintainer/issues/${issueNumber}`,
      createdAt: "2026-05-03T00:00:00.000Z",
      updatedAt: "2026-05-03T00:01:00.000Z",
    },
  });
}

const spamModelResult = {
  classification: "possibly_spam",
  qualityScore: 12,
  spamRisk: "high",
  agentReadiness: "not_agent_ready",
  confidence: 0.96,
  signals: ["possibly_spam"],
  evidence: [
    {
      signal: "possibly_spam",
      issueTextQuote: "Best crypto casino bonus partnership",
      reason: "The issue content is promotional and unrelated.",
    },
  ],
  missingInfo: [],
  possibleDuplicates: [],
  maintainerSummary: "Promotional content unrelated to the repository.",
  suggestedAuthorRequest: null,
};

type WorkflowDeps = Parameters<typeof createIssueTriageWorkflow>[0];

function createWorkflowHarness(
  input: {
    repo?: Partial<WorkflowDeps["repo"]>;
    labels?: string[];
    issueLabels?: string[];
    listIssues?: Array<{ number: number; title: string; labels: string[] }>;
    modelForIssue?: (issueNumber: number) => unknown;
    artifact?: Awaited<ReturnType<WorkflowDeps["artifacts"]["readIssue"]>>;
  } = {},
) {
  const repoLabels = new Set(input.labels ?? []);
  const issueLabels = new Set(input.issueLabels ?? []);
  const writes: string[] = [];
  const artifacts: Array<{
    path: string;
    resultIssue: number;
    taskBriefStatus: string;
  }> = [];
  const reports: Array<{
    jsonPath: string;
    markdownPath: string;
    issueCount: number;
  }> = [];
  const markdowns: Array<{ path: string; containsBrief: boolean }> = [];
  const comments: Array<{ id: number; body: string | null }> = [];
  const workflow = createIssueTriageWorkflow({
    repo: {
      repoId: "repo_1",
      owner: "Open-Maintainer",
      repo: "open-maintainer",
      sourceProfileVersion: 1,
      ...input.repo,
    },
    github: {
      async fetchEvidence(request) {
        return buildWorkflowEvidence(request.issueNumber);
      },
      async listRepoLabels() {
        return [...repoLabels].map((name) => ({ name }));
      },
      async listRepoLabelNames() {
        return repoLabels;
      },
      async listIssueLabelNames() {
        return issueLabels;
      },
      async createLabel(label) {
        writes.push(`create:${label.label}`);
        repoLabels.add(label.label);
      },
      async applyLabel(_issueNumber, label) {
        writes.push(`apply:${label}`);
        issueLabels.add(label);
      },
      async listTriageComments() {
        return comments;
      },
      async postComment(issueNumber, body) {
        writes.push(`comment:${issueNumber}`);
        comments.push({ id: comments.length + 1, body });
      },
      async updateComment(commentId, body) {
        writes.push(`update:${commentId}`);
        const existing = comments.find((comment) => comment.id === commentId);
        if (existing) {
          existing.body = body;
        }
      },
      async closeIssue(issueNumber) {
        writes.push(`close:${issueNumber}`);
      },
      async listIssues() {
        return input.listIssues ?? [];
      },
    },
    model: {
      provider: "Codex CLI",
      model: "gpt-test",
      async complete(prompt) {
        const issueNumber = JSON.parse(prompt.user).issue.number as number;
        const output = input.modelForIssue?.(issueNumber) ?? validModelResult;
        return {
          text: typeof output === "string" ? output : JSON.stringify(output),
          model: "gpt-test",
        };
      },
    },
    artifacts: {
      async writeIssue(path, artifact) {
        artifacts.push({
          path,
          resultIssue: artifact.result.issueNumber,
          taskBriefStatus: artifact.result.taskBrief.status,
        });
      },
      async readIssue() {
        if (!input.artifact) {
          throw new Error("No workflow artifact fixture was provided.");
        }
        return input.artifact;
      },
      async writeBatchReport(report) {
        reports.push({
          jsonPath: report.jsonPath,
          markdownPath: report.markdownPath,
          issueCount: report.report.issueCount,
        });
      },
      async writeBriefMarkdown(outputPath, markdown) {
        markdowns.push({
          path: outputPath,
          containsBrief: markdown.includes("Open Maintainer Agent Task Brief"),
        });
      },
    },
    clock: () => "2026-05-03T00:03:00.000Z",
    ids: {
      triageResult: () => "issue_triage_test",
      batchRun: () => "triage_run_test",
    },
  });
  return {
    workflow,
    writes,
    artifacts,
    reports,
    markdowns,
    repoLabels,
    issueLabels,
    comments,
  };
}

function buildWorkflowArtifact(result: unknown) {
  const evidence = buildWorkflowEvidence();
  const input = {
    repoId: "repo_1",
    owner: "Open-Maintainer",
    repo: "open-maintainer",
    issueNumber: 82,
    evidence,
    modelProvider: "Codex CLI",
    model: "gpt-test",
    consentMode: "explicit_repository_content_transfer" as const,
    createdAt: "2026-05-03T00:02:00.000Z",
  };
  const preview = renderIssueTriageCommentPreview(
    parseIssueTriageModelResult(result),
    ".open-maintainer/triage/issues/82.json",
  );
  return {
    input,
    result: {
      ...parseIssueTriageModelResult(result),
      id: "issue_triage_test",
      repoId: "repo_1",
      issueNumber: 82,
      commentPreview: preview,
      resolvedLabels: [],
      writeActions: [],
      modelProvider: "Codex CLI",
      model: "gpt-test",
      consentMode: "explicit_repository_content_transfer" as const,
      sourceProfileVersion: 1,
      contextArtifactVersion: null,
      createdAt: "2026-05-03T00:03:00.000Z",
    },
  };
}
