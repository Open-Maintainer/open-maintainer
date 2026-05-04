import type { ModelProvider } from "@open-maintainer/ai";
import type {
  ModelProviderConfig,
  RepoProfile,
  ReviewContributionTriageCategory,
  ReviewEvidenceCitation,
  ReviewFinding,
  ReviewInput,
  ReviewResult,
  ReviewSeverity,
  ReviewSkippedFile,
  ReviewValidationExpectation,
  RunRecord,
} from "@open-maintainer/shared";
import { ReviewResultSchema } from "@open-maintainer/shared";
import { generateModelBackedReview } from "./model";
import type { ReviewPromptContext as ModelReviewPromptContext } from "./model";
export { assembleLocalReviewInput } from "./local-git";
export type { LocalReviewInputOptions } from "./local-git";
export {
  buildReviewPrompt,
  modelReviewOutputJsonSchema,
  parseModelReviewOutput,
} from "./model";
export type {
  ModelBackedReviewOptions,
  ModelReviewOutput,
  ReviewPromptContext,
} from "./model";

const severityOrder: ReviewSeverity[] = ["blocker", "major", "minor", "note"];

export type ReviewEvidencePrecheck = Pick<
  ReviewResult,
  | "walkthrough"
  | "changedSurface"
  | "riskAnalysis"
  | "expectedValidation"
  | "validationEvidence"
  | "docsImpact"
  | "residualRisk"
> & {
  contributionTriageEvidence: ContributionTriageEvidenceCandidate[];
};

export type ContributionTriageEvidenceSignal =
  | "intent_clarity"
  | "linked_issue_or_acceptance_criteria"
  | "pr_state"
  | "diff_scope"
  | "validation_evidence"
  | "docs_alignment"
  | "broad_churn"
  | "high_risk_files"
  | "generated_file_changes"
  | "lockfile_changes"
  | "dependency_changes";

export type ContributionTriageEvidenceCandidate = {
  signal: ContributionTriageEvidenceSignal;
  summary: string;
  evidence: ReviewEvidenceCitation[];
};

export type GenerateReviewOptions = {
  repoId?: string;
  profile: RepoProfile;
  input: ReviewInput;
  rules?: string[];
  providerConfig: ModelProviderConfig;
  provider: ModelProvider;
  promptContext?: ModelReviewPromptContext;
};

export type ReviewContentLimits = {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
};

export type ReviewModelSelection =
  | {
      provider: "codex";
      model?: string;
      consent: { repositoryContentTransfer: true };
    }
  | {
      provider: "claude";
      model?: string;
      consent: { repositoryContentTransfer: true };
    };

export type ReviewPublishOptions = {
  summary?: boolean;
  inline?: false | { cap?: number };
  triageLabel?:
    | false
    | {
        apply: true;
        createMissingLabels?: boolean;
      };
};

export type ReviewPublicationIntent =
  | { mode: "publish"; options?: ReviewPublishOptions }
  | { mode: "plan"; options?: ReviewPublishOptions };

export type ReviewOutputIntent = {
  markdownPath?: string;
  json?: boolean;
};

export type ReviewRepositoryRequest =
  | { kind: "local"; repoRoot: string }
  | { kind: "stored"; repoId: string }
  | {
      kind: "prepared";
      profile: RepoProfile;
      input: ReviewInput;
      repoRoot?: string;
    };

export type ReviewTargetRequest =
  | { kind: "diff"; baseRef?: string; headRef?: string }
  | {
      kind: "pullRequest";
      number: number;
      baseRef?: string;
      headRef?: string;
    };

export type ReviewModelRequest =
  | ReviewModelSelection
  | { providerId: string }
  | { providerConfig: ModelProviderConfig; provider: ModelProvider };

export type ReviewPersistenceIntent =
  | false
  | {
      run?: true;
      review?: true;
    };

export type ReviewRequest = {
  repository: ReviewRepositoryRequest;
  target?: ReviewTargetRequest;
  model: ReviewModelRequest;
  intent?: "preview" | "apply";
  output?: ReviewOutputIntent;
  publication?: false | ReviewPublicationIntent;
  persistence?: ReviewPersistenceIntent;
  limits?: Partial<ReviewContentLimits>;
};

export type PullRequestReviewRequest = {
  repoRoot: string;
  pullNumber: number;
  model: ReviewModelSelection;
  publication?: ReviewPublicationIntent;
  output?: ReviewOutputIntent;
  limits?: Partial<ReviewContentLimits>;
};

export type PullRequestReviewTarget = {
  owner: string;
  repo: string;
  pullNumber: number;
  url: string | null;
  baseSha: string | null;
  headSha: string | null;
};

export type ReviewSummaryCommentPlan = {
  action: "create" | "update";
  body: string;
  existingCommentId: number | null;
};

export type ReviewSummaryCommentResult = ReviewSummaryCommentPlan & {
  commentId: number;
  url: string | null;
};

export type ReviewInlineCommentPlan = {
  comments: Array<{
    findingId: string;
    severity: ReviewSeverity;
    path: string;
    line: number;
    body: string;
    fingerprint: string;
  }>;
  skipped: Array<{
    findingId: string;
    reason:
      | "missing_path"
      | "missing_line"
      | "unchanged_path"
      | "missing_patch"
      | "duplicate"
      | "cap_reached";
  }>;
};

export type ReviewInlineCommentResult = ReviewInlineCommentPlan & {
  reviewId: number | null;
  url: string | null;
};

export type ReviewTriageLabelPlan = {
  label: string;
  apply: boolean;
  createMissingLabels: boolean;
  labelsToCreate: string[];
  labelsToRemove: string[];
};

export type ReviewTriageLabelResult = ReviewTriageLabelPlan & {
  applied: boolean;
  created: number;
  removed: string[];
};

export type ReviewPublicationPlan = {
  summary: ReviewSummaryCommentPlan | null;
  inline: ReviewInlineCommentPlan | null;
  triageLabel: ReviewTriageLabelPlan | null;
};

export type ReviewPublicationResult = {
  summary: ReviewSummaryCommentResult | null;
  inline: ReviewInlineCommentResult | null;
  triageLabel: ReviewTriageLabelResult | null;
};

export type ReviewPublicationInput = {
  review: ReviewResult;
  markdown: string;
  target: PullRequestReviewTarget;
  reviewInput: ReviewInput;
  options: RequiredReviewPublishOptions;
};

export type PullRequestReviewRun = {
  review: ReviewResult;
  markdown: string;
  target: PullRequestReviewTarget;
  output: ReviewOutputResult | null;
  publication:
    | { mode: "skipped" }
    | ({ mode: "planned" } & ReviewPublicationPlan)
    | ({ mode: "published" } & ReviewPublicationResult);
  diagnostics: {
    promptContextPaths: string[];
    skippedFiles: ReviewSkippedFile[];
    changedFileCount: number;
  };
};

export type ReviewOutputResult = {
  markdownPath: string;
  written: boolean;
};

export type ReviewPreparedSource = {
  profile: RepoProfile;
  input: ReviewInput;
  repoRoot: string | null;
};

export type ReviewRun = {
  review: ReviewResult;
  markdown: string;
  source: {
    profile: RepoProfile;
    input: ReviewInput;
    repoRoot: string | null;
  };
  output: ReviewOutputResult | null;
  publication: PullRequestReviewRun["publication"];
  persistence: {
    run: RunRecord | null;
    reviewStored: boolean;
  };
  diagnostics: {
    promptContextPaths: string[];
    skippedFiles: ReviewSkippedFile[];
    changedFileCount: number;
  };
};

export type ReviewSourcePort = {
  prepareLocal(input: {
    repoRoot: string;
    target?: ReviewTargetRequest;
    limits?: Partial<ReviewContentLimits>;
  }): Promise<ReviewPreparedSource>;
  prepareStored?(input: {
    repoId: string;
    target?: ReviewTargetRequest;
    limits?: Partial<ReviewContentLimits>;
  }): Promise<ReviewPreparedSource>;
};

export type ReviewPromptContextPort = {
  load(input: {
    repoRoot: string | null;
    profile: RepoProfile;
    reviewInput: ReviewInput;
  }): Promise<{
    context: ModelReviewPromptContext;
    paths: string[];
  }>;
};

export type ReviewModelProviderPort = {
  resolve(input: {
    model: ReviewModelRequest;
    repoRoot: string | null;
    profile: RepoProfile;
    reviewInput: ReviewInput;
  }):
    | Promise<{
        providerConfig: ModelProviderConfig;
        provider: ModelProvider;
      }>
    | {
        providerConfig: ModelProviderConfig;
        provider: ModelProvider;
      };
};

export type ReviewPersistencePort = {
  startRun(input: {
    request: ReviewRequest;
    source: ReviewPreparedSource;
  }): Promise<RunRecord>;
  succeedRun(input: {
    run: RunRecord;
    review: ReviewResult;
    source: ReviewPreparedSource;
  }): Promise<RunRecord>;
  failRun(input: {
    run: RunRecord;
    error: unknown;
    source: ReviewPreparedSource;
  }): Promise<RunRecord>;
  storeReview(input: { review: ReviewResult }): Promise<void>;
};

export type ReviewOrchestratorDeps = {
  sources: ReviewSourcePort;
  promptContext?: ReviewPromptContextPort;
  modelProviders: ReviewModelProviderPort;
  publisher?: PullRequestReviewWorkflowDeps["publisher"];
  output?: PullRequestReviewWorkflowDeps["output"];
  persistence?: ReviewPersistencePort;
};

export type ReviewOrchestrator = {
  review(request: ReviewRequest): Promise<ReviewRun>;
};

export class ReviewOrchestratorError extends Error {
  run: RunRecord | null;

  constructor(
    message: string,
    run: RunRecord | null,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ReviewOrchestratorError";
    this.run = run;
  }
}

export type PullRequestReviewWorkflow = {
  reviewPullRequest(
    request: PullRequestReviewRequest,
  ): Promise<PullRequestReviewRun>;
};

export type PullRequestReviewWorkflowDeps = {
  repoProfile: {
    load(repoRoot: string): Promise<RepoProfile>;
  };
  pullRequests: {
    fetchReviewInput(input: {
      repoId: string;
      owner: string;
      repo: string;
      pullNumber: number;
      limits?: Partial<ReviewContentLimits>;
    }): Promise<ReviewInput>;
  };
  promptContext: {
    load(input: {
      repoRoot: string;
      profile: RepoProfile;
    }): Promise<{
      context: ModelReviewPromptContext;
      paths: string[];
    }>;
  };
  modelProviders: {
    create(input: ReviewModelSelection & { repoRoot: string }): {
      providerConfig: ModelProviderConfig;
      provider: ModelProvider;
    };
  };
  publisher: {
    plan(input: ReviewPublicationInput): Promise<ReviewPublicationPlan>;
    publish(input: ReviewPublicationInput): Promise<ReviewPublicationResult>;
  };
  output?: {
    writeMarkdown(input: {
      repoRoot: string;
      path: string;
      markdown: string;
    }): Promise<void>;
  };
};

export type RequiredReviewPublishOptions = {
  summary: boolean;
  inline: false | { cap: number };
  triageLabel:
    | false
    | {
        apply: true;
        createMissingLabels: boolean;
      };
};

export const reviewTriageLabelDefinitions: Record<
  ReviewContributionTriageCategory,
  { name: string; color: string; description: string }
> = {
  ready_for_review: {
    name: "open-maintainer/ready-for-review",
    color: "2da44e",
    description: "Open Maintainer: PR appears ready for human review.",
  },
  needs_author_input: {
    name: "open-maintainer/needs-author-input",
    color: "d29922",
    description: "Open Maintainer: PR needs author information before review.",
  },
  needs_maintainer_design: {
    name: "open-maintainer/needs-maintainer-design",
    color: "8250df",
    description: "Open Maintainer: PR needs maintainer design judgment.",
  },
  not_agent_ready: {
    name: "open-maintainer/not-agent-ready",
    color: "bf8700",
    description: "Open Maintainer: PR is not ready for agent-assisted review.",
  },
  possible_spam: {
    name: "open-maintainer/possible-spam",
    color: "cf222e",
    description: "Open Maintainer: PR may be spam-like contribution noise.",
  },
};

export const reviewTriageLabelNames = new Set(
  Object.values(reviewTriageLabelDefinitions).map((label) => label.name),
);

export function createPullRequestReviewWorkflow(
  deps: PullRequestReviewWorkflowDeps,
): PullRequestReviewWorkflow {
  const orchestrator = createReviewOrchestrator({
    sources: {
      async prepareLocal(input) {
        if (input.target?.kind !== "pullRequest") {
          throw new Error(
            "Pull request review workflow requires a pull request target.",
          );
        }
        const profile = await deps.repoProfile.load(input.repoRoot);
        const reviewInput = await deps.pullRequests.fetchReviewInput({
          repoId: profile.repoId,
          owner: profile.owner,
          repo: profile.name,
          pullNumber: input.target.number,
          ...(input.limits ? { limits: input.limits } : {}),
        });
        return { profile, input: reviewInput, repoRoot: input.repoRoot };
      },
    },
    promptContext: {
      async load(input) {
        if (!input.repoRoot) {
          return { context: {}, paths: [] };
        }
        return deps.promptContext.load({
          repoRoot: input.repoRoot,
          profile: input.profile,
        });
      },
    },
    modelProviders: {
      resolve(input) {
        if (!("provider" in input.model) || "providerConfig" in input.model) {
          throw new Error(
            "Pull request review workflow requires a CLI model selection.",
          );
        }
        if (!input.repoRoot) {
          throw new Error(
            "Pull request review workflow requires a local repository root.",
          );
        }
        return deps.modelProviders.create({
          ...input.model,
          repoRoot: input.repoRoot,
        });
      },
    },
    publisher: deps.publisher,
    ...(deps.output ? { output: deps.output } : {}),
  });
  return {
    async reviewPullRequest(request) {
      const run = await orchestrator.review({
        repository: { kind: "local", repoRoot: request.repoRoot },
        target: { kind: "pullRequest", number: request.pullNumber },
        model: request.model,
        intent: request.publication?.mode === "plan" ? "preview" : "apply",
        ...(request.publication ? { publication: request.publication } : {}),
        ...(request.output ? { output: request.output } : {}),
        ...(request.limits ? { limits: request.limits } : {}),
      });
      return {
        review: run.review,
        markdown: run.markdown,
        target: reviewTargetFromInput(run.source.input),
        output: run.output,
        publication: run.publication,
        diagnostics: run.diagnostics,
      };
    },
  };
}

export function createReviewOrchestrator(
  deps: ReviewOrchestratorDeps,
  defaults: Partial<ReviewRequest> = {},
): ReviewOrchestrator {
  return {
    async review(request) {
      const resolvedRequest = { ...defaults, ...request } as ReviewRequest;
      assertReviewRequestModelConsent(resolvedRequest.model);
      const source = await prepareReviewSource(deps.sources, resolvedRequest);
      let activeRun: RunRecord | null = null;
      if (shouldPersistRun(resolvedRequest.persistence)) {
        if (!deps.persistence) {
          throw new Error(
            "Review run persistence requires a persistence port.",
          );
        }
        activeRun = await deps.persistence.startRun({
          request: resolvedRequest,
          source,
        });
      }
      try {
        const promptContext = deps.promptContext
          ? await deps.promptContext.load({
              repoRoot: source.repoRoot,
              profile: source.profile,
              reviewInput: source.input,
            })
          : { context: {}, paths: [] };
        const providerReview = await deps.modelProviders.resolve({
          model: resolvedRequest.model,
          repoRoot: source.repoRoot,
          profile: source.profile,
          reviewInput: source.input,
        });
        const review = await generateReview({
          profile: source.profile,
          input: source.input,
          rules: source.profile.reviewRuleCandidates,
          providerConfig: providerReview.providerConfig,
          provider: providerReview.provider,
          ...(Object.keys(promptContext.context).length > 0
            ? { promptContext: promptContext.context }
            : {}),
        });
        const markdown = renderReviewMarkdown(review);
        const output = await runReviewOutput({
          intent: resolvedRequest.output,
          reviewIntent: resolvedRequest.intent,
          publicationIntent: resolvedRequest.publication,
          deps,
          repoRoot: source.repoRoot,
          markdown,
        });
        const publication = await runReviewPublication({
          intent: resolvedRequest.publication,
          deps,
          review,
          markdown,
          target: resolvedRequest.publication
            ? reviewTargetFromInput(source.input)
            : null,
          reviewInput: source.input,
        });
        let reviewStored = false;
        if (shouldPersistReview(resolvedRequest.persistence)) {
          if (!deps.persistence) {
            throw new Error("Review storage requires a persistence port.");
          }
          await deps.persistence.storeReview({ review });
          reviewStored = true;
        }
        if (activeRun && deps.persistence) {
          activeRun = await deps.persistence.succeedRun({
            run: activeRun,
            review,
            source,
          });
        }
        return {
          review,
          markdown,
          source: {
            profile: source.profile,
            input: source.input,
            repoRoot: source.repoRoot,
          },
          output,
          publication,
          persistence: { run: activeRun, reviewStored },
          diagnostics: {
            promptContextPaths: promptContext.paths,
            skippedFiles: source.input.skippedFiles,
            changedFileCount: source.input.changedFiles.length,
          },
        };
      } catch (error) {
        if (activeRun && deps.persistence) {
          const failedRun = await deps.persistence.failRun({
            run: activeRun,
            error,
            source,
          });
          throw new ReviewOrchestratorError(errorMessage(error), failedRun, {
            cause: error,
          });
        }
        throw error;
      }
    },
  };
}

async function prepareReviewSource(
  sources: ReviewSourcePort,
  request: ReviewRequest,
): Promise<ReviewPreparedSource> {
  if (request.repository.kind === "prepared") {
    return {
      profile: request.repository.profile,
      input: request.repository.input,
      repoRoot: request.repository.repoRoot ?? null,
    };
  }
  if (request.repository.kind === "local") {
    return sources.prepareLocal({
      repoRoot: request.repository.repoRoot,
      ...(request.target ? { target: request.target } : {}),
      ...(request.limits ? { limits: request.limits } : {}),
    });
  }
  if (!sources.prepareStored) {
    throw new Error("Stored repository review requires a stored source port.");
  }
  return sources.prepareStored({
    repoId: request.repository.repoId,
    ...(request.target ? { target: request.target } : {}),
    ...(request.limits ? { limits: request.limits } : {}),
  });
}

async function runReviewOutput(input: {
  intent: ReviewOutputIntent | undefined;
  reviewIntent: ReviewRequest["intent"];
  publicationIntent: ReviewRequest["publication"];
  deps: Pick<ReviewOrchestratorDeps, "output">;
  repoRoot: string | null;
  markdown: string;
}): Promise<ReviewOutputResult | null> {
  if (!input.intent?.markdownPath) {
    return null;
  }
  const result = {
    markdownPath: input.intent.markdownPath,
    written:
      input.reviewIntent !== "preview" &&
      input.publicationIntent !== false &&
      input.publicationIntent?.mode !== "plan",
  };
  if (!result.written) {
    return result;
  }
  if (!input.repoRoot) {
    throw new Error("Review markdown output requires a repository root.");
  }
  if (!input.deps.output) {
    throw new Error("Review markdown output requires an output writer port.");
  }
  await input.deps.output.writeMarkdown({
    repoRoot: input.repoRoot,
    path: input.intent.markdownPath,
    markdown: input.markdown,
  });
  return result;
}

export async function generateReview(
  options: GenerateReviewOptions,
): Promise<ReviewResult> {
  const precheck = buildReviewEvidencePrecheck(options);
  return generateModelBackedReview({
    ...(options.repoId ? { repoId: options.repoId } : {}),
    profile: options.profile,
    input: options.input,
    rules: options.rules ?? [],
    precheck,
    providerConfig: options.providerConfig,
    provider: options.provider,
    ...(options.promptContext ? { promptContext: options.promptContext } : {}),
  });
}

async function runReviewPublication(input: {
  intent: ReviewRequest["publication"];
  deps: Pick<ReviewOrchestratorDeps, "publisher">;
  review: ReviewResult;
  markdown: string;
  target: PullRequestReviewTarget | null;
  reviewInput: ReviewInput;
}): Promise<PullRequestReviewRun["publication"]> {
  if (!input.intent) {
    return { mode: "skipped" };
  }
  if (!input.target) {
    throw new Error("Review publication requires a pull request target.");
  }
  if (!input.deps.publisher) {
    throw new Error("Review publication requires a publisher port.");
  }
  const options = normalizeReviewPublishOptions(input.intent.options);
  assertReviewPublicationAllowed({
    review: input.review,
    reviewInput: input.reviewInput,
    options,
  });
  const publicationInput = {
    review: input.review,
    markdown: input.markdown,
    target: input.target,
    reviewInput: input.reviewInput,
    options,
  };
  if (input.intent.mode === "plan") {
    return {
      mode: "planned",
      ...(await input.deps.publisher.plan(publicationInput)),
    };
  }
  return {
    mode: "published",
    ...(await input.deps.publisher.publish(publicationInput)),
  };
}

function normalizeReviewPublishOptions(
  options: ReviewPublishOptions | undefined,
): RequiredReviewPublishOptions {
  return {
    summary: options?.summary ?? true,
    inline:
      options?.inline === false
        ? false
        : { cap: Math.max(0, options?.inline?.cap ?? 5) },
    triageLabel:
      options?.triageLabel === false || !options?.triageLabel
        ? false
        : {
            apply: true,
            createMissingLabels:
              options.triageLabel.createMissingLabels ?? false,
          },
  };
}

function assertReviewRequestModelConsent(model: ReviewModelRequest): void {
  if ("consent" in model) {
    assertReviewModelConsent(model);
  }
}

function assertReviewModelConsent(model: ReviewModelSelection): void {
  if (model.consent.repositoryContentTransfer !== true) {
    throw new Error(
      "PR review requires explicit repository-content transfer consent before model invocation.",
    );
  }
}

function shouldPersistRun(
  intent: ReviewPersistenceIntent | undefined,
): boolean {
  return intent !== false && intent?.run === true;
}

function shouldPersistReview(
  intent: ReviewPersistenceIntent | undefined,
): boolean {
  return intent !== false && intent?.review === true;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertReviewPublicationAllowed(input: {
  review: ReviewResult;
  reviewInput: ReviewInput;
  options: RequiredReviewPublishOptions;
}): void {
  if (!input.options.triageLabel) {
    return;
  }
  if (input.review.contributionTriage.category !== "ready_for_review") {
    return;
  }
  const blockers = blockingPullRequestStateReasons(input.reviewInput);
  if (blockers.length === 0) {
    return;
  }
  throw new Error(
    `Refusing to apply open-maintainer/ready-for-review because GitHub reports this PR is blocked: ${blockers.join("; ")}.`,
  );
}

function blockingPullRequestStateReasons(input: ReviewInput): string[] {
  const reasons = [];
  if (input.isDraft === true) {
    reasons.push("PR is draft");
  }
  if (normalizeState(input.mergeable) === "CONFLICTING") {
    reasons.push("PR has merge conflicts");
  }
  if (normalizeState(input.mergeStateStatus) === "DIRTY") {
    reasons.push("merge state is dirty");
  }
  if (normalizeState(input.reviewDecision) === "CHANGES_REQUESTED") {
    reasons.push("changes are requested");
  }
  const blockingChecks = input.checkStatuses.filter((check) =>
    isBlockingCheckStatus(check),
  );
  if (blockingChecks.length > 0) {
    reasons.push(
      `blocking checks: ${blockingChecks.map((check) => check.name).join(", ")}`,
    );
  }
  return reasons;
}

function reviewTargetFromInput(input: ReviewInput): PullRequestReviewTarget {
  if (!input.prNumber) {
    throw new Error("Pull request review workflow requires a PR number.");
  }
  return {
    owner: input.owner,
    repo: input.repo,
    pullNumber: input.prNumber,
    url: input.url,
    baseSha: input.baseSha,
    headSha: input.headSha,
  };
}

export function buildReviewEvidencePrecheck(input: {
  profile: RepoProfile;
  input: ReviewInput;
  rules?: string[];
}): ReviewEvidencePrecheck {
  const changedSurface = classifyChangedSurface(input.input, input.profile);
  const expectedValidation = inferExpectedValidation({
    profile: input.profile,
    changedSurface,
    input: input.input,
    rules: input.rules ?? [],
  });
  const validationEvidence = detectValidationEvidence(
    input.input,
    expectedValidation,
  );
  const docsImpact = inferDocsImpact(input.input, changedSurface);
  const riskAnalysis = buildRiskAnalysis(input.input, input.profile);
  const residualRisk = buildResidualRisk(input.input);
  const contributionTriageEvidence = buildContributionTriageEvidence({
    profile: input.profile,
    input: input.input,
    changedSurface,
    expectedValidation,
    validationEvidence,
    docsImpact,
  });

  return {
    walkthrough: input.input.changedFiles.map(
      (file) =>
        `${file.status} ${file.path} (+${file.additions}/-${file.deletions})`,
    ),
    changedSurface,
    riskAnalysis,
    expectedValidation,
    validationEvidence,
    docsImpact,
    residualRisk,
    contributionTriageEvidence,
  };
}

export function parseReviewResult(input: unknown): ReviewResult {
  return ReviewResultSchema.parse(input);
}

export function classifyChangedSurface(
  input: ReviewInput,
  profile: RepoProfile,
): string[] {
  const surfaces = new Set<string>();
  for (const file of input.changedFiles) {
    const path = file.path;
    if (path.startsWith("apps/cli/")) {
      surfaces.add("cli");
    } else if (path.startsWith("apps/api/")) {
      surfaces.add("api");
    } else if (path.startsWith("apps/web/")) {
      surfaces.add("web");
    } else if (path.startsWith("apps/worker/")) {
      surfaces.add("worker");
    } else if (path.startsWith("packages/")) {
      const [, packageName = "unknown"] = path.split("/");
      surfaces.add(`package:${packageName}`);
    } else if (path === "action.yml" || path.startsWith(".github/workflows/")) {
      surfaces.add("github-action/workflow");
    } else if (path === "docker-compose.yml" || path === ".dockerignore") {
      surfaces.add("docker-compose");
    } else if (isGeneratedContextPath(path, profile)) {
      surfaces.add("generated-context");
    } else if (isDocsPath(path)) {
      surfaces.add("docs");
    } else if (path.startsWith("tests/")) {
      surfaces.add("fixtures/tests");
    } else if (isConfigOrLockPath(path, profile)) {
      surfaces.add("config/lockfile");
    }
    if (profile.riskHintPaths.some((riskPath) => path.startsWith(riskPath))) {
      surfaces.add("risk");
    }
  }
  return [...surfaces].sort();
}

export function inferExpectedValidation(input: {
  profile: RepoProfile;
  changedSurface: string[];
  input: ReviewInput;
  rules?: string[];
}): ReviewValidationExpectation[] {
  const commands = new Map<string, ReviewValidationExpectation>();
  const addCommand = (
    command: string,
    reason: string,
    evidence: ReviewEvidenceCitation,
  ) => {
    if (!commands.has(command)) {
      commands.set(command, { command, reason, evidence: [evidence] });
    }
  };
  const ruleCitation = {
    source: "open_maintainer_config" as const,
    path: ".open-maintainer.yml",
    excerpt: input.rules?.[0] ?? null,
    reason: "Repository validation rules define expected checks.",
  };

  for (const command of input.profile.commands) {
    if (shouldRunCommandForSurface(command.command, input.changedSurface)) {
      addCommand(
        command.command,
        `Changed surfaces ${input.changedSurface.join(", ")} match ${command.name} validation.`,
        {
          source: "repo_profile",
          path: command.source,
          excerpt: command.command,
          reason: "Repository profile detected this validation command.",
        },
      );
    }
  }

  if (
    input.input.changedFiles.some((file) =>
      /\.(ts|tsx|js|jsx)$/.test(file.path),
    )
  ) {
    for (const command of input.profile.commands.filter((item) =>
      /(tsc|typecheck)/i.test(`${item.name} ${item.command}`),
    )) {
      addCommand(command.command, "TypeScript or JavaScript files changed.", {
        source: "repo_profile",
        path: command.source,
        excerpt: command.command,
        reason: "Typecheck command was detected in the repo profile.",
      });
    }
  }

  if (input.rules && input.rules.length > 0) {
    for (const rule of input.rules) {
      const command = extractCommandFromRule(rule);
      if (command) {
        addCommand(command, "Repository rule names this validation command.", {
          ...ruleCitation,
          excerpt: rule,
        });
      }
    }
  }

  return [...commands.values()];
}

export function detectValidationEvidence(
  input: ReviewInput,
  expectedValidation: ReviewValidationExpectation[],
): string[] {
  const evidence = new Set<string>();
  const body = input.body.toLowerCase();
  for (const expected of expectedValidation) {
    const normalizedCommand = expected.command.toLowerCase();
    if (body.includes(normalizedCommand)) {
      evidence.add(`PR body mentions \`${expected.command}\`.`);
    }
    const commandWords = normalizedCommand.split(/\s+/).filter(Boolean);
    for (const check of input.checkStatuses) {
      const checkText =
        `${check.name} ${check.status} ${check.conclusion ?? ""}`.toLowerCase();
      if (
        commandWords.some(
          (word) => word.length > 2 && checkText.includes(word),
        ) ||
        (normalizedCommand.includes("tsc") && checkText.includes("typecheck"))
      ) {
        evidence.add(
          `Check \`${check.name}\` reported ${check.conclusion ?? check.status}.`,
        );
      }
    }
  }
  return [...evidence].sort();
}

function inferDocsImpact(input: ReviewInput, changedSurface: string[]) {
  const docsChanged = input.changedFiles.some((file) => isDocsPath(file.path));
  const impacts = new Map<string, ReviewResult["docsImpact"][number]>();
  const addImpact = (path: string, reason: string, required: boolean) => {
    if (!impacts.has(path)) {
      impacts.set(path, {
        path,
        reason,
        required,
        evidence: [
          {
            source: "changed_file",
            path: input.changedFiles[0]?.path ?? null,
            excerpt: null,
            reason: "Changed surface can affect user-facing documentation.",
          },
        ],
      });
    }
  };
  if (changedSurface.includes("cli")) {
    addImpact("README.md", "CLI behavior or help may have changed.", true);
    addImpact("docs/DEMO_RUNBOOK.md", "Demo commands may need review.", true);
  }
  if (changedSurface.includes("github-action/workflow")) {
    addImpact("README.md", "Action behavior may have changed.", true);
  }
  if (
    changedSurface.includes("api") ||
    changedSurface.includes("web") ||
    changedSurface.includes("docker-compose")
  ) {
    addImpact(
      "docs/DEMO_RUNBOOK.md",
      "Self-hosted or dashboard workflow may have changed.",
      true,
    );
  }
  if (changedSurface.includes("generated-context")) {
    addImpact("AGENTS.md", "Generated context changed.", false);
  }
  return docsChanged ? [] : [...impacts.values()];
}

function buildRiskAnalysis(input: ReviewInput, profile: RepoProfile): string[] {
  const risks = new Set<string>();
  for (const skipped of input.skippedFiles) {
    risks.add(`${skipped.path} was skipped during review (${skipped.reason}).`);
  }
  for (const file of input.changedFiles) {
    if (
      profile.riskHintPaths.some((riskPath) => file.path.startsWith(riskPath))
    ) {
      risks.add(`${file.path} matches a repository risk path.`);
    }
  }
  return risks.size > 0
    ? [...risks].sort()
    : ["No risk path or skipped-file risk was detected before model review."];
}

function buildResidualRisk(input: ReviewInput): string[] {
  const risks = [];
  if (input.checkStatuses.length === 0) {
    risks.push("CI/check status was unavailable in the review input.");
  }
  if (input.issueContext.length === 0) {
    risks.push("No linked issue acceptance criteria were available.");
  }
  return risks;
}

function buildContributionTriageEvidence(input: {
  profile: RepoProfile;
  input: ReviewInput;
  changedSurface: string[];
  expectedValidation: ReviewValidationExpectation[];
  validationEvidence: string[];
  docsImpact: ReviewResult["docsImpact"];
}): ContributionTriageEvidenceCandidate[] {
  const changedLines = input.input.changedFiles.reduce(
    (total, file) => total + file.additions + file.deletions,
    0,
  );
  const changedFileCitations = input.input.changedFiles
    .slice(0, 8)
    .map((file) =>
      reviewCitation({
        source: "changed_file",
        path: file.path,
        excerpt: `${file.status} (+${file.additions}/-${file.deletions})`,
        reason: "Changed file contributes to PR contribution-triage evidence.",
      }),
    );
  const bodyText = input.input.body.trim();
  const titleText = input.input.title?.trim() ?? "";
  const issueReferences = detectIssueReferences(
    `${input.input.title ?? ""}\n${input.input.body}`,
  );
  const issueCriteria = input.input.issueContext.flatMap(
    (issue) => issue.acceptanceCriteria,
  );
  const blockingChecks = input.input.checkStatuses.filter((check) =>
    isBlockingCheckStatus(check),
  );
  const prStateSummary = [
    `draft=${formatUnknownBoolean(input.input.isDraft)}`,
    `mergeable=${input.input.mergeable ?? "unknown"}`,
    `mergeStateStatus=${input.input.mergeStateStatus ?? "unknown"}`,
    `reviewDecision=${input.input.reviewDecision ?? "unknown"}`,
    `blockingChecks=${blockingChecks.length}`,
  ].join("; ");
  const generatedFiles = input.input.changedFiles.filter((file) =>
    isGeneratedContextPath(file.path, input.profile),
  );
  const lockfiles = input.input.changedFiles.filter(
    (file) =>
      input.profile.lockfiles.includes(file.path) || isLockfilePath(file.path),
  );
  const dependencyFiles = input.input.changedFiles.filter((file) =>
    isDependencyManifestPath(file.path),
  );
  const highRiskFiles = input.input.changedFiles.filter((file) =>
    input.profile.riskHintPaths.some((riskPath) =>
      file.path.startsWith(riskPath),
    ),
  );
  const docsChanged = input.input.changedFiles.filter((file) =>
    isDocsPath(file.path),
  );

  return [
    {
      signal: "intent_clarity",
      summary: `PR title is ${titleText ? "present" : "missing"}; PR body has ${wordCount(bodyText)} words.`,
      evidence: [
        reviewCitation({
          source: "user_input",
          path: null,
          excerpt: titleText || null,
          reason: "PR title is available as stated intent evidence.",
        }),
        reviewCitation({
          source: "user_input",
          path: null,
          excerpt: summarizeText(bodyText) || null,
          reason: "PR body is available as stated intent evidence.",
        }),
      ],
    },
    {
      signal: "linked_issue_or_acceptance_criteria",
      summary: `Detected ${input.input.issueContext.length} linked issue context item(s), ${issueReferences.length} issue reference(s), and ${issueCriteria.length} acceptance criterion item(s).`,
      evidence: [
        ...input.input.issueContext.map((issue) =>
          reviewCitation({
            source: "issue_acceptance_criteria",
            path: issue.url ?? `#${issue.number}`,
            excerpt: issue.acceptanceCriteria.join("; ") || issue.title,
            reason: "Linked issue context can ground contribution intent.",
          }),
        ),
        ...issueReferences.slice(0, 5).map((reference) =>
          reviewCitation({
            source: "user_input",
            path: null,
            excerpt: reference,
            reason: "PR text references an issue or pull request number.",
          }),
        ),
      ],
    },
    {
      signal: "pr_state",
      summary: `GitHub PR state: ${prStateSummary}.`,
      evidence: [
        reviewCitation({
          source: "ci_status",
          path: input.input.url,
          excerpt: prStateSummary,
          reason:
            "GitHub PR state affects whether the PR is ready for human review.",
        }),
        ...blockingChecks.map((check) =>
          reviewCitation({
            source: "ci_status",
            path: check.url,
            excerpt:
              `${check.name} ${check.status} ${check.conclusion ?? ""}`.trim(),
            reason:
              "Blocking check status affects contribution triage readiness.",
          }),
        ),
      ],
    },
    {
      signal: "diff_scope",
      summary: `${input.input.changedFiles.length} file(s) changed across ${input.changedSurface.join(", ") || "unclassified surface"} with +${totalAdditions(input.input.changedFiles)}/-${totalDeletions(input.input.changedFiles)}.`,
      evidence: changedFileCitations,
    },
    {
      signal: "validation_evidence",
      summary:
        input.validationEvidence.length > 0
          ? `Detected validation evidence: ${input.validationEvidence.join(" ")}`
          : `No validation evidence detected for ${input.expectedValidation.length} expected validation item(s).`,
      evidence:
        input.validationEvidence.length > 0
          ? validationEvidenceCitations(input.input, input.validationEvidence)
          : input.expectedValidation.flatMap((item) => item.evidence),
    },
    {
      signal: "docs_alignment",
      summary:
        input.docsImpact.length > 0
          ? `Documentation impact inferred for ${input.docsImpact.map((item) => item.path).join(", ")}; ${docsChanged.length} docs file(s) changed.`
          : `No documentation impact was inferred; ${docsChanged.length} docs file(s) changed.`,
      evidence:
        input.docsImpact.length > 0
          ? input.docsImpact.flatMap((item) => item.evidence)
          : docsChanged.map((file) =>
              reviewCitation({
                source: "changed_file",
                path: file.path,
                excerpt: `${file.status} docs file`,
                reason:
                  "Changed documentation can satisfy docs-alignment evidence.",
              }),
            ),
    },
    {
      signal: "broad_churn",
      summary: `Diff size candidate: ${input.input.changedFiles.length} file(s), ${changedLines} changed line(s), and ${input.input.skippedFiles.length} skipped file(s).`,
      evidence: [
        ...changedFileCitations,
        ...input.input.skippedFiles.map((file) =>
          reviewCitation({
            source: "changed_file",
            path: file.path,
            excerpt: file.reason,
            reason: "Skipped file contributes to reviewability scope evidence.",
          }),
        ),
      ],
    },
    {
      signal: "high_risk_files",
      summary:
        highRiskFiles.length > 0
          ? `High-risk path candidates changed: ${highRiskFiles.map((file) => file.path).join(", ")}.`
          : "No profile high-risk path candidate was detected in changed files.",
      evidence: highRiskFiles.map((file) =>
        reviewCitation({
          source: "changed_file",
          path: file.path,
          excerpt: matchingRiskHints(file.path, input.profile).join(", "),
          reason: "Changed file matches repository risk path hints.",
        }),
      ),
    },
    {
      signal: "generated_file_changes",
      summary:
        generatedFiles.length > 0
          ? `Generated/context file candidates changed: ${generatedFiles.map((file) => file.path).join(", ")}.`
          : "No generated/context file candidate was detected in changed files.",
      evidence: generatedFiles.map((file) =>
        reviewCitation({
          source: "changed_file",
          path: file.path,
          excerpt: file.status,
          reason: "Changed file matches generated context hints.",
        }),
      ),
    },
    {
      signal: "lockfile_changes",
      summary:
        lockfiles.length > 0
          ? `Lockfile candidates changed: ${lockfiles.map((file) => file.path).join(", ")}.`
          : "No lockfile candidate was detected in changed files.",
      evidence: lockfiles.map((file) =>
        reviewCitation({
          source: "changed_file",
          path: file.path,
          excerpt: file.status,
          reason: "Changed file is a detected lockfile.",
        }),
      ),
    },
    {
      signal: "dependency_changes",
      summary:
        dependencyFiles.length > 0
          ? `Dependency manifest candidates changed: ${dependencyFiles.map((file) => file.path).join(", ")}.`
          : "No dependency manifest candidate was detected in changed files.",
      evidence: dependencyFiles.map((file) =>
        reviewCitation({
          source: "changed_file",
          path: file.path,
          excerpt: file.status,
          reason: "Changed file is a dependency manifest candidate.",
        }),
      ),
    },
  ];
}

function reviewCitation(input: {
  source: ReviewEvidenceCitation["source"];
  path: string | null;
  excerpt: string | null;
  reason: string;
}): ReviewEvidenceCitation {
  return input;
}

function detectIssueReferences(text: string): string[] {
  const references = new Set<string>();
  for (const match of text.matchAll(
    /(?:^|\s)(?:#(\d+)|(?:issues|pull)\/(\d+))/gi,
  )) {
    const number = match[1] ?? match[2];
    if (number) {
      references.add(`#${number}`);
    }
  }
  return [...references];
}

function validationEvidenceCitations(
  input: ReviewInput,
  validationEvidence: string[],
): ReviewEvidenceCitation[] {
  const citations: ReviewEvidenceCitation[] = [];
  if (validationEvidence.some((item) => /PR body mentions/.test(item))) {
    citations.push(
      reviewCitation({
        source: "user_input",
        path: null,
        excerpt: summarizeText(input.body) || null,
        reason: "PR body includes validation evidence.",
      }),
    );
  }
  for (const check of input.checkStatuses) {
    if (
      validationEvidence.some((item) =>
        item.includes(`Check \`${check.name}\``),
      )
    ) {
      citations.push(
        reviewCitation({
          source: "ci_status",
          path: check.url,
          excerpt: `${check.status} ${check.conclusion ?? ""}`.trim(),
          reason: "Check status includes validation evidence.",
        }),
      );
    }
  }
  return citations;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function summarizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}

function totalAdditions(files: ReviewInput["changedFiles"]): number {
  return files.reduce((total, file) => total + file.additions, 0);
}

function totalDeletions(files: ReviewInput["changedFiles"]): number {
  return files.reduce((total, file) => total + file.deletions, 0);
}

function isBlockingCheckStatus(check: ReviewInput["checkStatuses"][number]) {
  const status = normalizeState(check.status);
  const conclusion = normalizeState(check.conclusion);
  if (status && status !== "COMPLETED") {
    return true;
  }
  return (
    conclusion === "FAILURE" ||
    conclusion === "TIMED_OUT" ||
    conclusion === "CANCELLED" ||
    conclusion === "ACTION_REQUIRED"
  );
}

function normalizeState(value: string | null | undefined): string | null {
  return value ? value.trim().toUpperCase() : null;
}

function formatUnknownBoolean(value: boolean | null): string {
  if (value === null) {
    return "unknown";
  }
  return value ? "true" : "false";
}

function matchingRiskHints(repoPath: string, profile: RepoProfile): string[] {
  return profile.riskHintPaths.filter((riskPath) =>
    repoPath.startsWith(riskPath),
  );
}

function isLockfilePath(repoPath: string): boolean {
  const fileName = repoPath.split("/").at(-1)?.toLowerCase() ?? "";
  return (
    fileName.endsWith(".lock") ||
    fileName === "bun.lock" ||
    fileName === "package-lock.json" ||
    fileName === "pnpm-lock.yaml" ||
    fileName === "yarn.lock"
  );
}

function isDependencyManifestPath(repoPath: string): boolean {
  const fileName = repoPath.split("/").at(-1)?.toLowerCase() ?? "";
  return (
    fileName === "package.json" ||
    fileName === "pyproject.toml" ||
    fileName === "requirements.txt" ||
    fileName === "go.mod" ||
    fileName === "cargo.toml" ||
    fileName === "gemfile"
  );
}

export function renderReviewMarkdown(input: ReviewResult): string {
  const review = parseReviewResult(input);
  const summary = parseStructuredSummary(review.summary);
  const lines = [
    `## OpenMaintainer Review ${review.prNumber ? `#${review.prNumber}` : "local"}`,
    "",
    `${review.baseRef}...${review.headRef}`,
    renderModelLine(review),
    "",
    "### Summary",
    "",
    summary.overview,
    "",
    `Risk level: **${summary.riskLevel ?? inferredRiskLevel(review)}**`,
    "",
    "Main concerns:",
    renderMainConcerns(review),
    "",
    "### Walkthrough",
    "",
    renderWalkthroughTable(review),
    "",
    "### Contribution Triage",
    "",
    renderContributionTriage(review),
    "",
    "### Findings",
    "",
    renderFindings(review.findings),
    "",
    "### Required Validation For This PR",
    "",
    renderRequiredValidationBlock(review),
    "",
    "### Merge Readiness",
    "",
    review.mergeReadiness.reason,
    "",
    "### Residual Risk",
    "",
    renderListOrFallback(review.residualRisk, "No residual risk recorded."),
  ];

  return trimTrailingBlankLines(lines).join("\n");
}

export function renderReviewSummaryComment(input: ReviewResult): string {
  const review = parseReviewResult(input);
  return [
    "<!-- open-maintainer-review-summary -->",
    renderReviewMarkdown(review),
  ].join("\n");
}

export function renderInlineReviewComment(finding: ReviewFinding): string {
  if (finding.citations.length === 0) {
    throw new Error(`Review finding ${finding.id} has no citations.`);
  }
  return [
    `**${formatSeverity(finding.severity)}: ${finding.title}**`,
    "",
    finding.body,
    "",
    "Evidence:",
    renderCitationList(finding.citations),
  ].join("\n");
}

function renderModelLine(review: ReviewResult): string {
  return review.modelProvider && review.model
    ? `Model: ${review.modelProvider} / ${review.model}`
    : "Model: not recorded";
}

function renderList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function renderListOrFallback(items: string[], fallback: string): string {
  return items.length > 0 ? renderList(items) : `- ${fallback}`;
}

function renderValidation(items: ReviewResult["expectedValidation"]): string {
  if (items.length === 0) {
    return "- No expected validation was inferred.";
  }
  return items
    .map((item) =>
      [
        `- \`${item.command}\`: ${item.reason}`,
        renderCitationList(item.evidence, "  "),
      ].join("\n"),
    )
    .join("\n");
}

function renderDocsImpact(items: ReviewResult["docsImpact"]): string {
  if (items.length === 0) {
    return "- No documentation impact was inferred.";
  }
  return items
    .map((item) => {
      const requirement = item.required ? "required" : "advisory";
      return [
        `- \`${item.path}\` (${requirement}): ${item.reason}`,
        renderCitationList(item.evidence, "  "),
      ].join("\n");
    })
    .join("\n");
}

function renderContributionTriage(review: ReviewResult): string {
  const triage = review.contributionTriage;
  if (triage.status === "not_evaluated") {
    return [
      "Status: **Not evaluated**",
      "",
      `Maintainer action: ${triage.recommendation}`,
    ].join("\n");
  }
  return [
    `Category: **${formatSnakeCase(triage.category ?? "not_evaluated")}**`,
    "",
    `Maintainer action: ${triage.recommendation}`,
    "",
    "Missing information:",
    renderListOrFallback(
      triage.missingInformation,
      "No missing contribution information recorded.",
    ),
    "",
    "Required author actions:",
    renderListOrFallback(
      triage.requiredActions,
      "No author action required by contribution triage.",
    ),
    renderCitationBlock(triage.evidence),
  ].join("\n");
}

function parseStructuredSummary(summary: string): {
  overview: string;
  riskLevel: string | null;
  validationSummary: string | null;
  docsSummary: string | null;
} {
  const lines = summary.split(/\r?\n/).map((line) => line.trim());
  const riskLine = lines.find((line) => /^Risk:/i.test(line));
  const validationLine = lines.find((line) => /^Validation:/i.test(line));
  const docsLine = lines.find((line) => /^Docs:/i.test(line));
  const overview = lines
    .filter(
      (line) =>
        line &&
        !/^Risk:/i.test(line) &&
        !/^Validation:/i.test(line) &&
        !/^Docs:/i.test(line),
    )
    .join("\n");
  return {
    overview: overview || summary,
    riskLevel: riskLine?.replace(/^Risk:\s*/i, "").replace(/\.$/, "") ?? null,
    validationSummary:
      validationLine?.replace(/^Validation:\s*/i, "").replace(/\.$/, "") ??
      null,
    docsSummary: docsLine?.replace(/^Docs:\s*/i, "").replace(/\.$/, "") ?? null,
  };
}

function inferredRiskLevel(review: ReviewResult): string {
  if (review.findings.some((finding) => finding.severity === "blocker")) {
    return "critical";
  }
  if (review.findings.some((finding) => finding.severity === "major")) {
    return "high";
  }
  if (review.findings.some((finding) => finding.severity === "minor")) {
    return "medium";
  }
  return "low";
}

function renderMainConcerns(review: ReviewResult): string {
  const concerns = review.findings.slice(0, 5).map((finding) => finding.title);
  if (concerns.length === 0) {
    return "- No concrete findings.";
  }
  return renderList(concerns);
}

function renderWalkthroughTable(review: ReviewResult): string {
  const areas = review.changedSurface.length
    ? review.changedSurface
    : review.walkthrough;
  const rows = areas.map((area) => {
    const files = review.changedFiles.filter((file) =>
      fileMatchesSurface(file.path, area),
    );
    const changed = files.length
      ? files
          .slice(0, 3)
          .map((file) => `\`${file.path}\``)
          .join(", ")
      : review.walkthrough[0] || "Changed files in this area.";
    const focus =
      review.riskAnalysis.find((risk) =>
        risk.toLowerCase().includes(area.toLowerCase()),
      ) ??
      review.findings.find((finding) =>
        finding.path ? fileMatchesSurface(finding.path, area) : false,
      )?.title ??
      "Review changed behavior, validation, and repo policy.";
    return `| \`${area}\` | ${escapeTableCell(changed)} | ${escapeTableCell(focus)} |`;
  });
  return [
    "| Area | What changed | Review focus |",
    "|---|---|---|",
    ...(rows.length
      ? rows
      : ["| general | Changed files | Review changed behavior |"]),
  ].join("\n");
}

function fileMatchesSurface(repoPath: string, surface: string): boolean {
  if (surface.startsWith("package:")) {
    return repoPath.startsWith(`packages/${surface.slice("package:".length)}/`);
  }
  if (surface === "api") {
    return repoPath.startsWith("apps/api/");
  }
  if (surface === "cli") {
    return repoPath.startsWith("apps/cli/");
  }
  if (surface === "web") {
    return repoPath.startsWith("apps/web/");
  }
  if (surface === "worker") {
    return repoPath.startsWith("apps/worker/");
  }
  if (surface === "docs") {
    return repoPath.endsWith(".md") || repoPath.startsWith("docs/");
  }
  if (surface === "github-action/workflow") {
    return repoPath === "action.yml" || repoPath.startsWith(".github/");
  }
  if (surface === "fixtures/tests") {
    return repoPath.startsWith("tests/");
  }
  return repoPath.includes(surface);
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function renderRequiredValidationBlock(review: ReviewResult): string {
  const commands = requiredValidationCommands(review);
  if (commands.length === 0) {
    return "No required validation was inferred.";
  }
  return ["```sh", ...commands, "```"].join("\n");
}

function requiredValidationCommands(review: ReviewResult): string[] {
  const commands = review.expectedValidation
    .map((item) => item.command)
    .filter(isReviewValidationCommand);
  const preferred = [
    "biome check .",
    "tsc -b",
    "vitest run",
    "bun run build",
    "bun run tests/smoke/mvp-demo.ts",
    "bun run tests/smoke/compose-smoke.ts",
  ];
  const selected = preferred.filter(
    (command) =>
      commands.includes(command) ||
      (command === "bun run build" &&
        commands.some((item) => item.includes("bun run --cwd"))),
  );
  for (const command of commands) {
    if (!selected.includes(command) && selected.length < 10) {
      selected.push(command);
    }
  }
  return selected;
}

function isReviewValidationCommand(command: string): boolean {
  const normalized = command.toLowerCase();
  return (
    !normalized.includes("--watch") &&
    !normalized.includes(" next dev") &&
    !normalized.includes("bun src/server") &&
    !normalized.includes("format --write") &&
    /(biome check|tsc|typecheck|vitest|bun test|bun run build|smoke|mvp-demo|compose-smoke)/.test(
      normalized,
    )
  );
}

function parseFindingBody(body: string): {
  category: string | null;
  description: string;
  impact: string;
  recommendation: string;
} {
  const category = body.match(/^Category:\s*(.+)$/m)?.[1] ?? null;
  const impact = body.match(
    /^Impact:\s*([\s\S]*?)(?:\nRecommendation:|$)/m,
  )?.[1];
  const recommendation = body.match(/^Recommendation:\s*([\s\S]*)$/m)?.[1];
  const description = body
    .replace(/^Category:.*$/m, "")
    .replace(/^Impact:[\s\S]*$/m, "")
    .trim();
  return {
    category,
    description,
    impact: impact?.trim() ?? "",
    recommendation: recommendation?.trim() ?? "",
  };
}

function renderParagraphList(value: string): string {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `- ${line}`)
    .join("\n");
}

function renderFindings(findings: ReviewFinding[]): string {
  if (findings.length === 0) {
    return "No concrete findings.";
  }

  return severityOrder
    .flatMap((severity) =>
      findings.filter((item) => item.severity === severity),
    )
    .map((finding) => {
      const detail = parseFindingBody(finding.body);
      return [
        `#### ${formatSeverity(finding.severity)}: ${finding.title}`,
        "",
        finding.path
          ? `File: \`${finding.path}${finding.line ? `:${finding.line}` : ""}\``
          : "File: not path-specific",
        "",
        detail.category ? `Category: ${detail.category}` : "",
        detail.description,
        "",
        "Impact:",
        detail.impact ? renderParagraphList(detail.impact) : "- Not specified.",
        "",
        "Recommendation:",
        detail.recommendation
          ? renderParagraphList(detail.recommendation)
          : "- Not specified.",
        "",
        "Evidence:",
        renderCitationList(finding.citations),
      ].join("\n");
    })
    .join("\n");
}

function renderCitationBlock(citations: ReviewEvidenceCitation[]): string {
  if (citations.length === 0) {
    return "";
  }
  return ["", "Evidence:", renderCitationList(citations)].join("\n");
}

function renderCitationList(
  citations: ReviewEvidenceCitation[],
  prefix = "",
): string {
  return citations
    .map((citation) => {
      const location = citation.path ? ` ${citation.path}` : "";
      const excerpt = citation.excerpt ? `: ${citation.excerpt}` : "";
      return `${prefix}- ${citation.source}${location}: ${citation.reason}${excerpt}`;
    })
    .join("\n");
}

function formatSeverity(severity: ReviewSeverity): string {
  return `${severity.charAt(0).toUpperCase()}${severity.slice(1)}`;
}

function formatReadiness(status: ReviewResult["mergeReadiness"]["status"]) {
  return formatSnakeCase(status);
}

function formatSnakeCase(status: string) {
  return status
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function trimTrailingBlankLines(lines: string[]): string[] {
  const next = [...lines];
  while (next.at(-1) === "") {
    next.pop();
  }
  return next;
}

function shouldRunCommandForSurface(
  command: string,
  changedSurface: string[],
): boolean {
  const normalized = command.toLowerCase();
  if (
    changedSurface.some((surface) => surface.startsWith("package:")) &&
    !normalized.includes("smoke") &&
    /(build|tsc|test|vitest|lint|biome)/.test(normalized)
  ) {
    return true;
  }
  if (changedSurface.includes("cli") && normalized.includes("apps/cli")) {
    return true;
  }
  if (changedSurface.includes("api") && normalized.includes("apps/api")) {
    return true;
  }
  if (changedSurface.includes("web") && normalized.includes("apps/web")) {
    return true;
  }
  if (changedSurface.includes("worker") && normalized.includes("apps/worker")) {
    return true;
  }
  if (
    changedSurface.includes("github-action/workflow") &&
    /(action|lint|test|vitest)/.test(normalized)
  ) {
    return true;
  }
  if (
    changedSurface.includes("docker-compose") &&
    /(compose|docker|smoke)/.test(normalized)
  ) {
    return true;
  }
  if (
    changedSurface.includes("fixtures/tests") &&
    /(test|vitest)/.test(normalized)
  ) {
    return true;
  }
  if (
    changedSurface.includes("config/lockfile") &&
    /(lint|typecheck|build|test|tsc|biome|vitest)/.test(normalized)
  ) {
    return true;
  }
  if (
    changedSurface.includes("generated-context") &&
    /(doctor|context|render|test)/.test(normalized)
  ) {
    return true;
  }
  return false;
}

function extractCommandFromRule(rule: string): string | null {
  const command = rule.match(/`([^`]+)`/)?.[1];
  return command && command.trim().length > 0 ? command : null;
}

function isGeneratedContextPath(path: string, profile: RepoProfile): boolean {
  return (
    path === "AGENTS.md" ||
    path === ".open-maintainer.yml" ||
    path.startsWith(".open-maintainer/") ||
    path.startsWith(".agents/skills/") ||
    profile.generatedFilePaths.includes(path) ||
    profile.generatedFileHints.includes(path)
  );
}

function isDocsPath(path: string): boolean {
  return (
    /^readme(\..*)?$/i.test(path) ||
    /^contributing(\..*)?$/i.test(path) ||
    path.startsWith("docs/") ||
    path.startsWith("local-docs/")
  );
}

function isConfigOrLockPath(path: string, profile: RepoProfile): boolean {
  return (
    profile.lockfiles.includes(path) ||
    profile.configFiles.includes(path) ||
    path.endsWith("package.json") ||
    path.endsWith("tsconfig.json") ||
    path === "biome.json"
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
