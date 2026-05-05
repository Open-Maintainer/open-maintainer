import type {
  IssueTriageInput,
  IssueTriageResult,
} from "@open-maintainer/shared";
import {
  IssueTriageInputSchema,
  IssueTriageResultSchema,
} from "@open-maintainer/shared";
import type {
  IssueTriageArtifactPort,
  IssueTriageGitHubPort,
  IssueTriageModelPort,
  IssueTriageRepoContextPort,
} from "@open-maintainer/triage";
import { buildIssueTriageEvidence } from "@open-maintainer/triage";
import { describe, expect, it } from "vitest";
import {
  type IssueTriageUseCaseDeps,
  createIssueTriageBriefSession,
  createIssueTriageUseCases,
  createModelBackedIssueTriageSession,
} from "../apps/cli/src/issue-triage-use-cases";

const repoContext: IssueTriageRepoContextPort = {
  repoId: "repo_1",
  owner: "acme",
  repo: "triage-fixture",
  sourceProfileVersion: 1,
  contextArtifactVersion: null,
  labels: {
    mappings: {
      ready_for_maintainer_review: "ready-for-review",
      agent_ready: "agent-ready",
      needs_author_input: "needs-author-input",
    },
    preferUpstream: true,
    createMissingPresetLabels: false,
  },
  closure: {
    allowPossibleSpam: true,
    allowStaleAuthorInput: false,
    staleAuthorInputDays: 14,
    requireCommentBeforeClose: false,
    maxClosuresPerRun: 2,
  },
  validationCommands: [
    {
      name: "test",
      command: "vitest run",
      scope: "tests",
      source: "package.json",
      purpose: "Run tests.",
      confidence: "observed",
    },
  ],
  readFirstPaths: ["AGENTS.md", "apps/cli/src/index.ts"],
};

function readyModelResult(issueNumber: number) {
  return {
    classification: "ready_for_maintainer_review",
    qualityScore: 91,
    spamRisk: "low",
    agentReadiness: "agent_ready",
    confidence: 0.91,
    signals: ["ready_for_maintainer_review", "agent_ready"],
    evidence: [
      {
        signal: "ready_for_maintainer_review",
        issueTextQuote: `Issue ${issueNumber} has acceptance criteria.`,
        reason: "The issue is scoped for maintainer review.",
      },
    ],
    missingInfo: [],
    possibleDuplicates: [],
    maintainerSummary: `Proceed with issue ${issueNumber}.`,
    suggestedAuthorRequest: null,
  };
}

function needsAuthorInputModelResult(issueNumber: number) {
  return {
    classification: "needs_author_input",
    qualityScore: 38,
    spamRisk: "low",
    agentReadiness: "not_agent_ready",
    confidence: 0.72,
    signals: ["needs_author_input"],
    evidence: [
      {
        signal: "needs_author_input",
        issueTextQuote: `Issue ${issueNumber} is missing reproduction steps.`,
        reason: "The issue needs more author input before implementation.",
      },
    ],
    missingInfo: ["reproduction_steps"],
    possibleDuplicates: [],
    maintainerSummary: `Ask for more detail on issue ${issueNumber}.`,
    suggestedAuthorRequest: "Add reproduction steps.",
  };
}

function spamModelResult(issueNumber: number) {
  return {
    classification: "possibly_spam",
    qualityScore: 5,
    spamRisk: "high",
    agentReadiness: "not_agent_ready",
    confidence: 0.93,
    signals: ["possibly_spam"],
    evidence: [
      {
        signal: "possibly_spam",
        issueTextQuote: `Issue ${issueNumber} is unrelated promotional content.`,
        reason: "The issue is unrelated to repository maintenance.",
      },
    ],
    missingInfo: [],
    possibleDuplicates: [],
    maintainerSummary: `Close issue ${issueNumber} as spam.`,
    suggestedAuthorRequest: null,
  };
}

function createEvidence(issueNumber: number) {
  return buildIssueTriageEvidence({
    repoId: repoContext.repoId,
    owner: repoContext.owner,
    repo: repoContext.repo,
    issue: {
      number: issueNumber,
      title: `Issue ${issueNumber}`,
      body: [
        "## Feature request",
        `Issue ${issueNumber} has acceptance criteria.`,
        "",
        "## Acceptance criteria",
        "- Keep CLI behavior stable",
      ].join("\n"),
      author: "maintainer",
      labels: [],
      state: "open",
      url: `https://github.com/acme/triage-fixture/issues/${issueNumber}`,
      createdAt: "2026-05-03T00:00:00.000Z",
      updatedAt: "2026-05-03T00:01:00.000Z",
    },
  });
}

function createDeps(input?: {
  modelResult?: (issueNumber: number) => unknown;
  initialArtifacts?: Map<
    string,
    { input: IssueTriageInput; result: IssueTriageResult }
  >;
}): {
  deps: IssueTriageUseCaseDeps;
  calls: {
    repositoryPrepare: number;
    modelCreate: number;
    modelComplete: number[];
    githubCreate: number;
    fetchEvidence: number[];
    listIssues: Array<{
      state: "open" | "closed" | "all";
      limit: number;
      includeLabels: readonly string[];
      excludeLabels: readonly string[];
    }>;
    createLabel: string[];
    applyLabel: Array<{ issueNumber: number; label: string }>;
    postComment: number[];
    closeIssue: number[];
    writeIssue: string[];
    writeBatchReport: string[];
    writeBriefMarkdown: string[];
    output: string[];
    capturedRepoContext: IssueTriageRepoContextPort | null;
  };
  artifacts: Map<
    string,
    { input: IssueTriageInput; result: IssueTriageResult }
  >;
} {
  const artifacts = input?.initialArtifacts ?? new Map();
  const calls = {
    repositoryPrepare: 0,
    modelCreate: 0,
    modelComplete: [] as number[],
    githubCreate: 0,
    fetchEvidence: [] as number[],
    listIssues: [] as Array<{
      state: "open" | "closed" | "all";
      limit: number;
      includeLabels: readonly string[];
      excludeLabels: readonly string[];
    }>,
    createLabel: [] as string[],
    applyLabel: [] as Array<{ issueNumber: number; label: string }>,
    postComment: [] as number[],
    closeIssue: [] as number[],
    writeIssue: [] as string[],
    writeBatchReport: [] as string[],
    writeBriefMarkdown: [] as string[],
    output: [] as string[],
    capturedRepoContext: null as IssueTriageRepoContextPort | null,
  };
  const github: IssueTriageGitHubPort = {
    async fetchEvidence(fetchInput) {
      calls.fetchEvidence.push(fetchInput.issueNumber);
      return createEvidence(fetchInput.issueNumber);
    },
    async listRepoLabels() {
      return [
        { name: "ready-for-review" },
        { name: "agent-ready" },
        { name: "needs-author-input" },
      ];
    },
    async listRepoLabelNames() {
      return new Set(["ready-for-review", "agent-ready", "needs-author-input"]);
    },
    async listIssueLabelNames() {
      return new Set();
    },
    async createLabel(label) {
      calls.createLabel.push(label.label);
    },
    async applyLabel(issueNumber, label) {
      calls.applyLabel.push({ issueNumber, label });
    },
    async listTriageComments() {
      return [];
    },
    async postComment(issueNumber) {
      calls.postComment.push(issueNumber);
    },
    async updateComment() {},
    async closeIssue(issueNumber) {
      calls.closeIssue.push(issueNumber);
    },
    async listIssues(listInput) {
      calls.listIssues.push(listInput);
      return [
        { number: 1, title: "Issue 1", labels: ["bug"] },
        { number: 2, title: "Issue 2", labels: ["bug"] },
        { number: 3, title: "Issue 3", labels: ["bug"] },
      ];
    },
  };
  const model: IssueTriageModelPort = {
    provider: "Fake model",
    model: "fake-triage",
    async complete(prompt) {
      const issueNumber =
        Number(
          /"issueNumber":\s*(\d+)/.exec(prompt.user)?.[1] ??
            /"number":\s*(\d+)/.exec(prompt.user)?.[1],
        ) || 0;
      calls.modelComplete.push(issueNumber);
      const result =
        input?.modelResult?.(issueNumber) ?? readyModelResult(issueNumber);
      return { text: JSON.stringify(result), model: "fake-triage" };
    },
  };
  const artifactPort: IssueTriageArtifactPort = {
    async writeIssue(artifactPath, artifact) {
      calls.writeIssue.push(artifactPath);
      artifacts.set(artifactPath, artifact);
    },
    async readIssue(artifactPath) {
      const artifact = artifacts.get(artifactPath);
      if (!artifact) {
        throw new Error(`Missing artifact ${artifactPath}`);
      }
      return artifact;
    },
    async writeBatchReport(reportInput) {
      calls.writeBatchReport.push(reportInput.jsonPath);
    },
    async writeBriefMarkdown(outputPath) {
      calls.writeBriefMarkdown.push(outputPath);
    },
  };
  return {
    deps: {
      repository: {
        async prepare() {
          calls.repositoryPrepare += 1;
          return {
            profile: {
              repoId: repoContext.repoId,
              owner: repoContext.owner,
              name: repoContext.repo,
              version: 1,
            },
            repo: repoContext,
          };
        },
        async prepareBrief() {
          calls.repositoryPrepare += 1;
          return repoContext;
        },
      },
      modelProviders: {
        create() {
          calls.modelCreate += 1;
          return model;
        },
      },
      github: {
        create(githubInput) {
          calls.githubCreate += 1;
          calls.capturedRepoContext = githubInput.context.repo;
          return github;
        },
      },
      artifacts: {
        create() {
          return artifactPort;
        },
      },
      output: {
        async write(_repoRoot, outputPath) {
          calls.output.push(outputPath);
        },
      },
    },
    calls,
    artifacts,
  };
}

describe("issue triage use cases", () => {
  it("enforces model content-transfer consent before repository, GitHub, or model calls", async () => {
    const { deps, calls } = createDeps();
    const useCases = createIssueTriageUseCases(deps);

    await expect(
      useCases.triageOne({
        repoRoot: "/tmp/repo",
        issueNumber: 1,
        model: {
          provider: "codex",
          model: null,
          consent: { repositoryContentTransfer: false },
        },
        writeIntent: {
          dryRun: false,
          labels: false,
          createMissingLabels: false,
          comment: false,
          close: false,
          onlySignals: [],
          minConfidence: null,
        },
      }),
    ).rejects.toThrow("--allow-model-content-transfer");
    expect(calls.repositoryPrepare).toBe(0);
    expect(calls.modelCreate).toBe(0);
    expect(calls.githubCreate).toBe(0);
    expect(calls.fetchEvidence).toEqual([]);
  });

  it("maps single-issue dry-run intent without artifact or GitHub mutations", async () => {
    const { deps, calls } = createDeps();
    const useCases = createIssueTriageUseCases(deps);

    const result = await useCases.triageOne({
      repoRoot: "/tmp/repo",
      issueNumber: 1,
      model: {
        provider: "codex",
        model: "gpt-test",
        consent: { repositoryContentTransfer: true },
      },
      writeIntent: {
        dryRun: true,
        labels: true,
        createMissingLabels: false,
        comment: true,
        close: true,
        onlySignals: [],
        minConfidence: 0.5,
      },
    });

    expect(result.artifactPath).toBe(".open-maintainer/triage/issues/1.json");
    expect(calls.capturedRepoContext?.closure).toEqual(repoContext.closure);
    expect(calls.capturedRepoContext?.labels).toEqual(repoContext.labels);
    expect(
      result.result.writeActions.every((action) => action.status === "skipped"),
    ).toBe(true);
    expect(calls.writeIssue).toEqual([]);
    expect(calls.applyLabel).toEqual([]);
    expect(calls.postComment).toEqual([]);
    expect(calls.closeIssue).toEqual([]);
  });

  it("applies single-issue labels, comments, closure, and artifacts through injected ports", async () => {
    const { deps, calls } = createDeps({ modelResult: spamModelResult });
    const useCases = createIssueTriageUseCases(deps);

    const result = await useCases.triageOne({
      repoRoot: "/tmp/repo",
      issueNumber: 4,
      model: {
        provider: "codex",
        model: "gpt-test",
        consent: { repositoryContentTransfer: true },
      },
      writeIntent: {
        dryRun: false,
        labels: true,
        createMissingLabels: true,
        comment: true,
        close: true,
        onlySignals: ["possibly_spam"],
        minConfidence: 0.5,
      },
    });

    expect(result.artifactPath).toBe(".open-maintainer/triage/issues/4.json");
    expect(calls.fetchEvidence).toEqual([4]);
    expect(calls.modelComplete).toEqual([4]);
    expect(calls.createLabel).toEqual(["possibly-spam"]);
    expect(calls.applyLabel).toEqual([
      { issueNumber: 4, label: "possibly-spam" },
    ]);
    expect(calls.postComment).toEqual([4]);
    expect(calls.closeIssue).toEqual([4]);
    expect(calls.writeIssue).toEqual([".open-maintainer/triage/issues/4.json"]);
    expect(
      result.result.writeActions
        .filter((action) =>
          [
            "create_label",
            "apply_label",
            "post_comment",
            "close_issue",
          ].includes(action.type),
        )
        .map((action) => [action.type, action.status]),
    ).toEqual([
      ["create_label", "applied"],
      ["apply_label", "applied"],
      ["post_comment", "applied"],
      ["close_issue", "applied"],
    ]);
  });

  it("runs issue and batch triage through one prepared model-backed session", async () => {
    const { deps, calls } = createDeps();
    const session = await createModelBackedIssueTriageSession(deps, {
      repoRoot: "/tmp/repo",
      model: {
        provider: "codex",
        model: "gpt-test",
        consent: { repositoryContentTransfer: true },
      },
    });

    const issue = await session.triageOne({
      issueNumber: 1,
      writeIntent: {
        dryRun: true,
        labels: true,
        createMissingLabels: false,
        comment: true,
        close: false,
        onlySignals: [],
        minConfidence: null,
      },
    });
    const batch = await session.triageBatch({
      state: "open",
      limit: 2,
      label: null,
      includeLabels: [],
      excludeLabels: [],
      format: null,
      outputPath: null,
      writeIntent: {
        dryRun: true,
        labels: false,
        createMissingLabels: false,
        comment: false,
        close: false,
        onlySignals: [],
        minConfidence: null,
      },
    });

    expect(issue.result.issueNumber).toBe(1);
    expect(batch.output).toBeNull();
    expect(calls.listIssues).toEqual([
      expect.objectContaining({
        state: "open",
        limit: 2,
        includeLabels: [],
      }),
    ]);
    expect(calls.repositoryPrepare).toBe(1);
    expect(calls.modelCreate).toBe(1);
    expect(calls.githubCreate).toBe(1);
  });

  it("maps batch filters, continues through model failures, and writes reports and explicit output", async () => {
    const { deps, calls } = createDeps({
      modelResult(issueNumber) {
        if (issueNumber === 2) {
          return { invalid: true };
        }
        return readyModelResult(issueNumber);
      },
    });
    const useCases = createIssueTriageUseCases(deps);

    const result = await useCases.triageBatch({
      repoRoot: "/tmp/repo",
      model: {
        provider: "codex",
        model: null,
        consent: { repositoryContentTransfer: true },
      },
      state: "all",
      limit: 3,
      label: "bug",
      includeLabels: ["needs-triage"],
      excludeLabels: ["security"],
      format: "json",
      outputPath: ".open-maintainer/triage/custom.json",
      writeIntent: {
        dryRun: false,
        labels: false,
        createMissingLabels: false,
        comment: false,
        close: false,
        onlySignals: [],
        minConfidence: null,
      },
    });

    expect(calls.listIssues).toEqual([
      {
        state: "all",
        limit: 3,
        includeLabels: ["bug", "needs-triage"],
        excludeLabels: ["security"],
      },
    ]);
    expect(result.report.issues.map((issue) => issue.status)).toEqual([
      "succeeded",
      "failed",
      "succeeded",
    ]);
    expect(calls.writeBatchReport).toHaveLength(1);
    expect(calls.output).toEqual([".open-maintainer/triage/custom.json"]);
    expect(result.output).toEqual({
      path: ".open-maintainer/triage/custom.json",
      written: true,
      format: "json",
    });
  });

  it("briefIssue enforces non-agent-ready overrides and writes markdown through artifacts", async () => {
    const { deps, artifacts, calls } = createDeps({
      modelResult: needsAuthorInputModelResult,
    });
    const useCases = createIssueTriageUseCases(deps);
    await useCases.triageOne({
      repoRoot: "/tmp/repo",
      issueNumber: 1,
      model: {
        provider: "codex",
        model: null,
        consent: { repositoryContentTransfer: true },
      },
      writeIntent: {
        dryRun: false,
        labels: false,
        createMissingLabels: false,
        comment: false,
        close: false,
        onlySignals: [],
        minConfidence: null,
      },
    });

    await expect(
      useCases.briefIssue({
        repoRoot: "/tmp/repo",
        issueNumber: 1,
        allowNonAgentReady: false,
        dryRun: false,
        outputPath: null,
      }),
    ).rejects.toThrow("--allow-non-agent-ready");

    const brief = await useCases.briefIssue({
      repoRoot: "/tmp/repo",
      issueNumber: 1,
      allowNonAgentReady: true,
      dryRun: false,
      outputPath: ".open-maintainer/triage/issues/1-brief.md",
    });

    expect(brief.brief.status).toBe("generated");
    expect(calls.writeBriefMarkdown).toEqual([
      ".open-maintainer/triage/issues/1-brief.md",
    ]);
    expect(
      artifacts.get(".open-maintainer/triage/issues/1.json")?.result.taskBrief
        .status,
    ).toBe("generated");
  });

  it("creates a brief session from local artifacts without GitHub or model ports", async () => {
    const { deps, artifacts, calls } = createDeps({
      initialArtifacts: new Map([
        [
          ".open-maintainer/triage/issues/9.json",
          {
            input: IssueTriageInputSchema.parse({
              repoId: repoContext.repoId,
              owner: repoContext.owner,
              repo: repoContext.repo,
              issueNumber: 9,
              evidence: createEvidence(9),
              modelProvider: "Fake model",
              model: "fake-triage",
              consentMode: "explicit_repository_content_transfer",
              createdAt: "2026-05-03T00:00:00.000Z",
            }),
            result: IssueTriageResultSchema.parse({
              ...readyModelResult(9),
              id: "issue_triage_9",
              repoId: repoContext.repoId,
              issueNumber: 9,
              commentPreview: {
                marker: "<!-- open-maintainer:issue-triage -->",
                summary: "Ready for maintainer review.",
                body: "Ready for maintainer review.",
                artifactPath: ".open-maintainer/triage/issues/9.json",
              },
              resolvedLabels: [],
              writeActions: [],
              modelProvider: "Fake model",
              model: "fake-triage",
              consentMode: "explicit_repository_content_transfer",
              sourceProfileVersion: 1,
              contextArtifactVersion: null,
              createdAt: "2026-05-03T00:02:00.000Z",
            }),
          },
        ],
      ]),
    });
    const session = await createIssueTriageBriefSession(deps, {
      repoRoot: "/tmp/repo",
    });

    const result = await session.briefIssue({
      issueNumber: 9,
      allowNonAgentReady: false,
      dryRun: true,
      outputPath: ".open-maintainer/triage/issues/9-brief.md",
    });

    expect(result.brief.status).toBe("generated");
    expect(calls.githubCreate).toBe(0);
    expect(calls.modelCreate).toBe(0);
    expect(calls.writeBriefMarkdown).toEqual([]);
    expect(
      artifacts.get(".open-maintainer/triage/issues/9.json")?.result.taskBrief
        .status,
    ).toBe("not_generated");
  });
});
