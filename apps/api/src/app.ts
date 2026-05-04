import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import cors from "@fastify/cors";
import formBody from "@fastify/formbody";
import rateLimit from "@fastify/rate-limit";
import {
  assertProviderConsent,
  assertProviderExecutableAvailable,
  buildProvider,
  createProviderConfig,
} from "@open-maintainer/ai";
import { scanRepository } from "@open-maintainer/analyzer";
import { createContextGenerationOrchestrator } from "@open-maintainer/context";
import { checkDatabase, checkRedis, store } from "@open-maintainer/db";
import {
  createContextBranchName,
  createContextPr,
  fetchPullRequestReviewContext,
  mapInstallationEvent,
  renderContextPrBody,
  verifyWebhookSignature,
} from "@open-maintainer/github";
import type { GitHubAppInstallationAuth } from "@open-maintainer/github";
import {
  assembleLocalReviewInput,
  generateReview,
} from "@open-maintainer/review";
import {
  type ArtifactType,
  ArtifactTypeSchema,
  type GeneratedArtifact,
  type ModelProviderConfig,
  type Repo,
  type RepoProfile,
  ReviewFeedbackSchema,
  type ReviewInput,
  newId,
  nowIso,
} from "@open-maintainer/shared";
import Fastify from "fastify";
import { z } from "zod";
import {
  type RepositorySourceAnalysisRegistry,
  createRepositorySourceAnalysisRegistry,
} from "./repository-source-analysis";

const execFileAsync = promisify(execFile);
const sensitiveRouteRateLimit = {
  max: 10,
  timeWindow: "1 minute",
} as const;
const UploadedRepositoryFileSchema = z.object({
  path: z.string().min(1).max(1_000),
  content: z.string().max(128_000),
});

export function buildApp() {
  const app = Fastify({ logger: false });
  const repositorySources = createRepositorySourceAnalysisRegistry({
    store,
    getInstallationAuth: githubAuthForInstallation,
  });
  app.register(cors, { origin: true });
  app.register(formBody);

  app.get("/health", async () => {
    const [database, redis] = await Promise.all([
      checkDatabase(),
      checkRedis(),
    ]);
    const worker = store.workerHeartbeatAt ? "ok" : "missing";
    return {
      status: database === "ok" && redis === "ok" ? "ok" : "degraded",
      api: "ok",
      database,
      redis,
      worker,
      workerHeartbeatAt: store.workerHeartbeatAt,
      checkedAt: nowIso(),
    };
  });

  app.post("/worker/heartbeat", async () => {
    store.workerHeartbeatAt = nowIso();
    return { ok: true, workerHeartbeatAt: store.workerHeartbeatAt };
  });

  app.get("/installations", async () => ({
    installations: [...store.installations.values()],
  }));
  app.get("/repos", async () => ({ repos: [...store.repos.values()] }));

  app.register(async (limitedRoutes) => {
    await limitedRoutes.register(rateLimit, { global: false });

    limitedRoutes.post(
      "/repos/local",
      { config: { rateLimit: sensitiveRouteRateLimit } },
      async (request, reply) => {
        const body = z
          .object({ repoRoot: z.string().min(1).max(500) })
          .parse(request.body ?? {});
        const result = await repositorySources.registerSource({
          kind: "local-worktree",
          repoRoot: path.resolve(body.repoRoot),
        });
        if (!result.ok) {
          return reply.code(result.statusCode).send({ error: result.message });
        }
        return { repo: result.repo, files: result.fileCount };
      },
    );

    limitedRoutes.post(
      "/repos/local-files",
      { config: { rateLimit: sensitiveRouteRateLimit } },
      async (request, reply) => {
        const body = z
          .object({
            name: z.string().min(1).max(120).optional(),
            files: z.array(UploadedRepositoryFileSchema).min(1).max(800),
          })
          .parse(request.body ?? {});
        const result = await repositorySources.registerSource({
          kind: "uploaded-files",
          files: body.files,
          ...(body.name ? { name: body.name } : {}),
        });
        if (!result.ok) {
          return reply.code(result.statusCode).send({ error: result.message });
        }
        return { repo: result.repo, files: result.fileCount };
      },
    );
  });

  app.post("/github/settings", async (request) => {
    const body = z
      .object({
        appId: z.string().min(1),
        clientId: z.string().min(1),
        privateKeyBase64: z.string().min(1),
        webhookSecret: z.string().min(1),
      })
      .parse(request.body);
    return {
      ok: true,
      appId: body.appId,
      clientId: body.clientId,
      privateKeyConfigured: true,
      webhookSecretConfigured: true,
    };
  });

  app.post("/github/webhook", async (request, reply) => {
    const payload =
      typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body ?? {});
    const signature256 = request.headers["x-hub-signature-256"];
    const secret = process.env.GITHUB_WEBHOOK_SECRET || "dev-webhook-secret";
    if (
      typeof signature256 !== "string" ||
      !verifyWebhookSignature({ secret, payload, signature256 })
    ) {
      return reply
        .code(401)
        .send({ error: "Invalid GitHub webhook signature." });
    }

    const event = mapInstallationEvent(JSON.parse(payload));
    store.installations.set(event.installation.id, event.installation);
    for (const repo of event.repos) {
      store.repos.set(repo.id, repo);
    }
    store.recordRun({
      repoId: null,
      type: "webhook",
      status: "succeeded",
      inputSummary: `GitHub installation webhook for ${event.installation.accountLogin}`,
      safeMessage: null,
      artifactVersions: [],
      repoProfileVersion: null,
      provider: null,
      model: null,
      externalId: event.installation.id,
    });
    return { ok: true, installation: event.installation, repos: event.repos };
  });

  app.register(async (limitedRoutes) => {
    await limitedRoutes.register(rateLimit, { global: false });

    limitedRoutes.post(
      "/repos/:repoId/analyze",
      { config: { rateLimit: sensitiveRouteRateLimit } },
      async (request, reply) => {
        const { repoId } = z
          .object({ repoId: z.string() })
          .parse(request.params);
        const result = await repositorySources.analyzeRepository({
          repoId,
        });
        if (!result.ok) {
          return reply.code(result.statusCode).send({
            error: result.message,
            ...(result.run ? { run: result.run } : {}),
          });
        }
        return { run: result.run, profile: result.profile };
      },
    );
  });

  app.get("/repos/:repoId/profile", async (request, reply) => {
    const { repoId } = z.object({ repoId: z.string() }).parse(request.params);
    const profile = store.latestProfile(repoId);
    if (!profile) {
      return reply.code(404).send({ error: "No profile has been generated." });
    }
    return { profile };
  });

  app.post("/model-providers", async (request, reply) => {
    const body = z
      .object({
        kind: z.enum([
          "openai-compatible",
          "anthropic",
          "local-openai-compatible",
          "codex-cli",
          "claude-cli",
        ]),
        displayName: z.string(),
        baseUrl: z.string().url(),
        model: z.string(),
        apiKey: z.string(),
        repoContentConsent: z.boolean(),
      })
      .parse(request.body);
    const provider = createProviderConfig(body);
    try {
      await assertProviderExecutableAvailable(provider);
    } catch (error) {
      return reply.code(422).send({
        error:
          error instanceof Error
            ? error.message
            : "Selected provider executable is unavailable.",
      });
    }
    store.providers.set(provider.id, provider);
    return { provider: { ...provider, encryptedApiKey: "[redacted]" } };
  });

  app.get("/model-providers", async () => ({
    providers: [...store.providers.values()].map((provider) => ({
      ...provider,
      encryptedApiKey: "[redacted]",
    })),
  }));

  app.post("/model-providers/test", async () => ({
    ok: true,
    prompt: "Connectivity test uses a harmless non-repo prompt.",
  }));

  app.post("/repos/:repoId/generate-context", async (request, reply) => {
    const { repoId } = z.object({ repoId: z.string() }).parse(request.params);
    const body = z
      .object({
        providerId: z.string().optional(),
        context: z.enum(["codex", "claude", "both"]).optional(),
        skills: z.enum(["codex", "claude", "both"]).optional(),
        async: z.boolean().optional(),
      })
      .parse(request.body ?? {});
    const profile = store.latestProfile(repoId);
    if (!profile) {
      return reply
        .code(409)
        .send({ error: "Generate a repo profile before context artifacts." });
    }
    const provider = body.providerId
      ? (store.providers.get(body.providerId) ?? null)
      : ([...store.providers.values()][0] ?? null);
    if (body.providerId && !provider) {
      return reply.code(404).send({ error: "Unknown model provider." });
    }
    if (!provider) {
      const run = store.recordRun({
        repoId,
        type: "generation",
        status: "failed",
        inputSummary: "Context generation blocked before provider call.",
        safeMessage:
          "Context generation requires an explicit model provider with repo-content consent.",
        artifactVersions: [],
        repoProfileVersion: profile.version,
        provider: null,
        model: null,
        externalId: null,
      });
      return reply.code(403).send({ error: run.safeMessage, run });
    }
    try {
      assertProviderConsent(provider);
    } catch (error) {
      const run = store.recordRun({
        repoId,
        type: "generation",
        status: "failed",
        inputSummary: "Context generation blocked before provider call.",
        safeMessage:
          error instanceof Error ? error.message : "Generation blocked.",
        artifactVersions: [],
        repoProfileVersion: profile.version,
        provider: null,
        model: null,
        externalId: null,
      });
      return reply.code(403).send({ error: run.safeMessage, run });
    }
    try {
      await assertProviderExecutableAvailable(provider);
    } catch (error) {
      const run = store.recordRun({
        repoId,
        type: "generation",
        status: "failed",
        inputSummary: "Context generation blocked before provider call.",
        safeMessage:
          error instanceof Error
            ? `Selected provider executable is unavailable: ${error.message}`
            : "Selected provider executable is unavailable.",
        artifactVersions: [],
        repoProfileVersion: profile.version,
        provider: provider.displayName,
        model: provider.model,
        externalId: null,
      });
      return reply.code(422).send({ error: run.safeMessage, run });
    }

    const run = store.recordRun({
      repoId,
      type: "generation",
      status: "running",
      inputSummary: `Generate AGENTS.md and .open-maintainer.yml from profile v${profile.version}.`,
      safeMessage: null,
      artifactVersions: [],
      repoProfileVersion: profile.version,
      provider: provider?.displayName ?? null,
      model: provider?.model ?? null,
      externalId: null,
    });

    if (body.async) {
      void generateContextArtifactsForRun({
        repoId,
        profile,
        provider,
        runId: run.id,
        context: body.context,
        skills: body.skills,
      }).catch(() => undefined);
      return reply.code(202).send({
        accepted: true,
        run: store.runs.get(run.id),
      });
    }

    try {
      const artifacts = await generateContextArtifactsForRun({
        repoId,
        profile,
        provider,
        runId: run.id,
        context: body.context,
        skills: body.skills,
      });
      return { run: store.runs.get(run.id), artifacts };
    } catch {
      return reply.code(502).send({
        error: store.runs.get(run.id)?.safeMessage,
        run: store.runs.get(run.id),
      });
    }
  });

  app.get("/repos/:repoId/artifacts", async (request) => {
    const { repoId } = z.object({ repoId: z.string() }).parse(request.params);
    return { artifacts: store.artifacts.get(repoId) ?? [] };
  });

  app.post("/repos/:repoId/reviews", async (request, reply) => {
    const { repoId } = z.object({ repoId: z.string() }).parse(request.params);
    const body = z
      .object({
        baseRef: z.string().min(1).optional(),
        headRef: z.string().min(1).optional(),
        prNumber: z.number().int().positive().optional(),
        providerId: z.string().optional(),
      })
      .parse(request.body ?? {});
    const repo = store.repos.get(repoId);
    if (!repo) {
      return reply.code(404).send({ error: "Unknown repo." });
    }
    const provider = body.providerId
      ? (store.providers.get(body.providerId) ?? null)
      : null;
    if (body.providerId && !provider) {
      return reply.code(404).send({ error: "Unknown model provider." });
    }
    if (!provider) {
      return reply.code(403).send({
        error:
          "Review preview requires an explicit model provider with repo-content consent.",
      });
    }
    try {
      assertProviderConsent(provider);
    } catch (error) {
      return reply.code(403).send({
        error:
          error instanceof Error ? error.message : "Review generation blocked.",
      });
    }
    const prepared = await prepareReviewPreviewInput({
      repoId,
      repo,
      repositorySources,
      ...(body.baseRef ? { baseRef: body.baseRef } : {}),
      ...(body.headRef ? { headRef: body.headRef } : {}),
      ...(body.prNumber ? { prNumber: body.prNumber } : {}),
    }).catch((error) => ({
      ok: false as const,
      statusCode: 422 as const,
      error:
        error instanceof Error
          ? error.message
          : "Unable to prepare PR review preview.",
    }));
    if (!prepared.ok) {
      return reply.code(prepared.statusCode).send({ error: prepared.error });
    }
    const { profile, reviewInput } = prepared;
    const run = store.recordRun({
      repoId,
      type: "review",
      status: "running",
      inputSummary: `Review ${repo.fullName} ${reviewInput.baseRef}...${reviewInput.headRef}.`,
      safeMessage: null,
      artifactVersions: [],
      repoProfileVersion: profile.version,
      provider: provider?.displayName ?? null,
      model: provider?.model ?? null,
      externalId: null,
    });
    try {
      const promptContext = await reviewPromptContextForRepository({
        repoId,
        profile,
        worktreeRoot: prepared.worktreeRoot,
      });
      const review = await generateReview({
        profile,
        input: reviewInput,
        rules: profile.reviewRuleCandidates,
        providerConfig: provider,
        provider: buildProvider(provider, {
          ...(prepared.worktreeRoot ? { cwd: prepared.worktreeRoot } : {}),
        }),
        ...(Object.keys(promptContext).length > 0 ? { promptContext } : {}),
      });
      store.reviews.set(review.id, review);
      store.updateRun(run.id, {
        status: "succeeded",
        safeMessage: `Review preview generated for ${reviewInput.baseRef}...${reviewInput.headRef}.`,
        externalId: review.id,
      });
      return { run: store.runs.get(run.id), review };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to generate review preview.";
      store.updateRun(run.id, { status: "failed", safeMessage: message });
      return reply.code(422).send({
        error: message,
        run: store.runs.get(run.id),
      });
    }
  });

  app.get("/repos/:repoId/reviews", async (request) => {
    const { repoId } = z.object({ repoId: z.string() }).parse(request.params);
    return { reviews: store.listReviews(repoId) };
  });

  app.get("/reviews/:reviewId", async (request, reply) => {
    const { reviewId } = z
      .object({ reviewId: z.string() })
      .parse(request.params);
    const review = store.reviews.get(reviewId);
    if (!review) {
      return reply.code(404).send({ error: "Unknown review." });
    }
    return { review };
  });

  app.post("/reviews/:reviewId/feedback", async (request, reply) => {
    const { reviewId } = z
      .object({ reviewId: z.string() })
      .parse(request.params);
    const body = z
      .object({
        findingId: z.string().min(1),
        verdict: ReviewFeedbackSchema.shape.verdict,
        reason: z.string().trim().min(1).nullable().optional(),
        actor: z.string().trim().min(1).nullable().optional(),
      })
      .parse(request.body ?? {});
    const review = store.reviews.get(reviewId);
    if (!review) {
      return reply.code(404).send({ error: "Unknown review." });
    }
    const finding = review.findings.find((item) => item.id === body.findingId);
    if (!finding) {
      return reply.code(422).send({
        error: "Unknown finding ID for review.",
      });
    }
    const feedback = ReviewFeedbackSchema.parse({
      findingId: finding.id,
      verdict: body.verdict,
      reason: body.reason ?? null,
      actor: body.actor ?? null,
      createdAt: nowIso(),
    });
    const updatedReview = store.addReviewFeedback(review.id, feedback);
    return { feedback, review: updatedReview };
  });

  app.post("/reviews/:reviewId/post-summary", async (request, reply) => {
    const { reviewId } = z
      .object({ reviewId: z.string() })
      .parse(request.params);
    const review = store.reviews.get(reviewId);
    if (!review) {
      return reply.code(404).send({ error: "Unknown review." });
    }
    return reply.code(409).send({
      error:
        "Posting review summaries requires GitHub credentials and pull request permissions.",
    });
  });

  app.register(async (limitedRoutes) => {
    await limitedRoutes.register(rateLimit, { global: false });

    limitedRoutes.post(
      "/repos/:repoId/open-context-pr",
      { config: { rateLimit: sensitiveRouteRateLimit } },
      async (request, reply) => {
        const { repoId } = z
          .object({ repoId: z.string() })
          .parse(request.params);
        const profile = store.latestProfile(repoId);
        if (!profile) {
          return reply.code(409).send({ error: "No repo profile available." });
        }
        const repo = store.repos.get(repoId);
        if (!repo) {
          return reply.code(404).send({ error: "Unknown repo." });
        }
        const localWorktreeRoot = store.repoWorktrees.get(repoId);
        const artifacts = await artifactsForContextPr({
          repoId,
          profile,
          worktreeRoot: localWorktreeRoot,
        });
        if (artifacts.length < 2) {
          return reply.code(409).send({
            error:
              "Generate artifacts or add repo-local context files before opening a context PR.",
          });
        }
        const run = store.recordRun({
          repoId,
          type: "context_pr",
          status: "running",
          inputSummary: "Open context PR from approved artifact versions.",
          safeMessage: null,
          artifactVersions: artifacts.map((artifact) => artifact.version),
          repoProfileVersion: profile.version,
          provider: artifacts[0]?.modelProvider ?? null,
          model: artifacts[0]?.model ?? null,
          externalId: null,
        });
        if (localWorktreeRoot) {
          try {
            await requireLocalGhPrReady(localWorktreeRoot);
            const contextPr = await createLocalContextPrWithGh({
              repoId,
              worktreeRoot: localWorktreeRoot,
              defaultBranch: repo.defaultBranch,
              profileVersion: profile.version,
              artifacts,
              runReference: run.id,
              generatedAt: nowIso(),
            });
            store.contextPrs.set(contextPr.id, contextPr);
            store.updateRun(run.id, {
              status: "succeeded",
              safeMessage: `Opened context PR at ${contextPr.prUrl}.`,
              externalId: contextPr.prUrl,
            });
            return { run: store.runs.get(run.id), contextPr };
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : "local gh PR creation failed.";
            store.updateRun(run.id, {
              status: "failed",
              safeMessage: `gh PR creation failed: ${message}`,
              externalId: null,
            });
            return reply.code(502).send({
              error: store.runs.get(run.id)?.safeMessage,
              run: store.runs.get(run.id),
            });
          }
        }
        const remoteContextPr = await createGitHubAppContextPr({
          repoId,
          repo,
          profile,
          artifacts,
          runId: run.id,
        });
        if (!remoteContextPr.ok) {
          store.updateRun(run.id, {
            status: "failed",
            safeMessage: remoteContextPr.error,
            externalId: null,
          });
          return reply.code(remoteContextPr.statusCode).send({
            error: store.runs.get(run.id)?.safeMessage,
            run: store.runs.get(run.id),
          });
        }
        const contextPr = remoteContextPr.contextPr;
        store.contextPrs.set(contextPr.id, contextPr);
        store.updateRun(run.id, {
          status: "succeeded",
          safeMessage: `Opened context PR at ${contextPr.prUrl}.`,
          externalId: contextPr.prUrl,
        });
        return { run: store.runs.get(run.id), contextPr };
      },
    );
  });

  app.get("/repos/:repoId/runs", async (request) => {
    const { repoId } = z.object({ repoId: z.string() }).parse(request.params);
    return { runs: store.listRuns(repoId) };
  });

  app.get("/runs/:runId", async (request, reply) => {
    const { runId } = z.object({ runId: z.string() }).parse(request.params);
    const run = store.runs.get(runId);
    if (!run) {
      return reply.code(404).send({ error: "Unknown run." });
    }
    return { run };
  });

  app.post("/runs/:runId/retry", async (request, reply) => {
    const { runId } = z.object({ runId: z.string() }).parse(request.params);
    const run = store.runs.get(runId);
    if (!run || run.status !== "failed") {
      return reply
        .code(409)
        .send({ error: "Only failed runs can be retried." });
    }
    const retry = store.recordRun({
      repoId: run.repoId,
      type: run.type,
      status: "queued",
      inputSummary: run.inputSummary,
      safeMessage: `Retry queued for ${run.id}.`,
      artifactVersions: run.artifactVersions,
      repoProfileVersion: run.repoProfileVersion,
      provider: run.provider,
      model: run.model,
      externalId: newId("retry"),
    });
    return { run: retry };
  });

  return app;
}

async function generateContextArtifactsForRun(input: {
  repoId: string;
  profile: RepoProfile;
  provider: ModelProviderConfig;
  runId: string;
  context: "codex" | "claude" | "both" | undefined;
  skills: "codex" | "claude" | "both" | undefined;
}): Promise<GeneratedArtifact[]> {
  const repoFiles = store.repoFiles.get(input.repoId) ?? [];
  try {
    const modelProvider = buildProvider(input.provider, {
      cwd: store.repoWorktrees.get(input.repoId) ?? process.cwd(),
    });
    const orchestrator = createContextGenerationOrchestrator({
      events: {
        failed(error) {
          store.updateRun(input.runId, {
            status: "failed",
            safeMessage:
              error instanceof Error
                ? `Model synthesis failed: ${error.message}`
                : "Model synthesis failed.",
          });
        },
      },
    });
    const result = await orchestrator.generateFromProfile({
      repoId: input.repoId,
      profile: input.profile,
      files: repoFiles,
      model: {
        providerLabel: input.provider.displayName,
        model: input.provider.model,
        complete(prompt, options) {
          return modelProvider.complete(prompt, {
            outputSchema: options.outputSchema,
          });
        },
      },
      providerKind: input.provider.kind,
      selection: {
        ...(input.context ? { context: input.context } : {}),
        ...(input.skills ? { skills: input.skills } : {}),
      },
      nextArtifactVersion: (store.artifacts.get(input.repoId)?.length ?? 0) + 1,
      writeMode: { kind: "preview" },
    });

    store.updateRun(input.runId, {
      status: "succeeded",
      artifactVersions: result.artifacts.map((artifact) => artifact.version),
      safeMessage: "Context artifacts generated for preview.",
    });
    for (const artifact of result.artifacts) {
      store.addArtifact(artifact);
    }
    return result.artifacts;
  } catch (error) {
    if (store.runs.get(input.runId)?.status !== "failed") {
      store.updateRun(input.runId, {
        status: "failed",
        safeMessage:
          error instanceof Error
            ? `Model synthesis failed: ${error.message}`
            : "Model synthesis failed.",
      });
    }
    throw error;
  }
}

async function artifactsForContextPr(input: {
  repoId: string;
  profile: RepoProfile;
  worktreeRoot: string | undefined;
}): Promise<GeneratedArtifact[]> {
  const storedArtifacts = store.artifacts.get(input.repoId) ?? [];
  if (storedArtifacts.length >= 2) {
    return storedArtifacts;
  }
  if (!input.worktreeRoot) {
    return storedArtifacts;
  }

  const localArtifacts = await readContextArtifactsFromWorktree({
    repoId: input.repoId,
    profile: input.profile,
    worktreeRoot: input.worktreeRoot,
  });
  if (localArtifacts.length >= 2) {
    store.artifacts.set(input.repoId, localArtifacts);
    return localArtifacts;
  }
  return storedArtifacts;
}

async function readContextArtifactsFromWorktree(input: {
  repoId: string;
  profile: RepoProfile;
  worktreeRoot: string;
}): Promise<GeneratedArtifact[]> {
  const paths = await contextArtifactPathsInWorktree(input.worktreeRoot);
  const timestamp = nowIso();
  const artifacts: GeneratedArtifact[] = [];
  for (const [index, artifactPath] of paths.entries()) {
    artifacts.push({
      id: newId("artifact"),
      repoId: input.repoId,
      type: artifactPath,
      version: index + 1,
      content: await readFile(
        path.join(input.worktreeRoot, artifactPath),
        "utf8",
      ),
      sourceProfileVersion: input.profile.version,
      modelProvider: null,
      model: null,
      createdAt: timestamp,
    });
  }
  return artifacts;
}

async function contextArtifactPathsInWorktree(
  worktreeRoot: string,
): Promise<ArtifactType[]> {
  const files = await scanRepository(worktreeRoot, { maxFiles: 800 });
  return files
    .map((file) => ArtifactTypeSchema.safeParse(file.path))
    .filter((result) => result.success)
    .map((result) => result.data)
    .filter(isWritableContextArtifact);
}

function isWritableContextArtifact(type: ArtifactType): boolean {
  return type !== "repo_profile";
}

async function saveArtifactsToLocalWorktree(
  worktreeRoot: string,
  artifacts: GeneratedArtifact[],
): Promise<string[]> {
  const savedPaths: string[] = [];
  for (const artifact of artifacts) {
    const artifactPath =
      artifact.type === "repo_profile" ? null : artifact.type;
    if (!artifactPath) {
      continue;
    }
    const destination = path.join(worktreeRoot, artifactPath);
    const relativePath = path.relative(worktreeRoot, destination);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      throw new Error(
        `Refusing to write artifact outside repository: ${artifact.type}`,
      );
    }
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, artifact.content, "utf8");
    savedPaths.push(relativePath);
  }
  if (savedPaths.length === 0) {
    throw new Error("No writable context artifacts were generated.");
  }
  return savedPaths;
}

async function createLocalContextPrWithGh(input: {
  repoId: string;
  worktreeRoot: string;
  defaultBranch: string;
  profileVersion: number;
  artifacts: GeneratedArtifact[];
  runReference: string;
  generatedAt: string;
}) {
  await requireLocalGhPrReady(input.worktreeRoot);

  const originalBranch = await detectLocalDefaultBranch(input.worktreeRoot);
  const branchName = createContextBranchName(input.profileVersion);
  try {
    await runGit(input.worktreeRoot, [
      "checkout",
      "-B",
      branchName,
      input.defaultBranch,
    ]);
    const savedPaths = await saveArtifactsToLocalWorktree(
      input.worktreeRoot,
      input.artifacts,
    );
    await runGit(input.worktreeRoot, ["add", "--", ...savedPaths]);
    const hasStagedChanges = await gitHasStagedChanges(input.worktreeRoot);
    if (!hasStagedChanges) {
      throw new Error("generated context files did not change the worktree.");
    }
    await runGit(
      input.worktreeRoot,
      ["commit", "-m", "Update Open Maintainer context"],
      gitCommitIdentityEnv(),
    );
    const commitSha = (
      await runGit(input.worktreeRoot, ["rev-parse", "HEAD"])
    ).trim();
    await runGit(
      input.worktreeRoot,
      ["push", "--set-upstream", "origin", branchName],
      gitPushAuthEnv(),
    );

    const body = renderContextPrBody({
      repoProfileVersion: input.profileVersion,
      artifacts: input.artifacts,
      modelProvider: input.artifacts[0]?.modelProvider ?? null,
      model: input.artifacts[0]?.model ?? null,
      runReference: input.runReference,
      generatedAt: input.generatedAt,
    });
    const prUrl = await openOrUpdateGhPullRequest(input.worktreeRoot, {
      baseBranch: input.defaultBranch,
      headBranch: branchName,
      title: "Update Open Maintainer context",
      body,
    });

    return {
      id: newId("context_pr"),
      repoId: input.repoId,
      branchName,
      commitSha,
      prNumber: pullRequestNumber(prUrl),
      prUrl,
      artifactVersions: input.artifacts.map((artifact) => artifact.version),
      status: "succeeded" as const,
      createdAt: nowIso(),
    };
  } finally {
    if (originalBranch !== "local" && originalBranch !== branchName) {
      await runGit(input.worktreeRoot, ["checkout", originalBranch]).catch(
        () => undefined,
      );
    }
  }
}

async function openOrUpdateGhPullRequest(
  cwd: string,
  input: {
    baseBranch: string;
    headBranch: string;
    title: string;
    body: string;
  },
): Promise<string> {
  const existingPrUrl = await findExistingGhPullRequestUrl(
    cwd,
    input.headBranch,
  );
  if (existingPrUrl) {
    await runGh(cwd, [
      "pr",
      "edit",
      input.headBranch,
      "--title",
      input.title,
      "--body",
      input.body,
    ]);
    return existingPrUrl;
  }

  const prUrl = findFirstUrl(
    await runGh(cwd, [
      "pr",
      "create",
      "--base",
      input.baseBranch,
      "--head",
      input.headBranch,
      "--title",
      input.title,
      "--body",
      input.body,
    ]),
  );
  if (!prUrl) {
    throw new Error("gh did not return a pull request URL.");
  }
  return prUrl;
}

async function findExistingGhPullRequestUrl(
  cwd: string,
  headBranch: string,
): Promise<string | null> {
  try {
    return findFirstUrl(
      await runGh(cwd, [
        "pr",
        "view",
        headBranch,
        "--json",
        "url",
        "--jq",
        ".url",
      ]),
    );
  } catch {
    return null;
  }
}

async function requireLocalGhPrReady(cwd: string): Promise<void> {
  await requireGitRepository(cwd);
  await runGit(cwd, ["remote", "get-url", "origin"]);
  await requireGhAuthentication(cwd);
}

async function requireGhAuthentication(cwd: string): Promise<void> {
  try {
    await runGh(cwd, ["auth", "status"]);
  } catch {
    throw new Error(
      "gh is not authenticated in the API environment. Set GH_TOKEN in .env and recreate the API container, run gh auth login inside the API container, or mount an authenticated GitHub CLI config.",
    );
  }
}

async function requireGitRepository(cwd: string): Promise<void> {
  try {
    await runGit(cwd, ["rev-parse", "--show-toplevel"]);
  } catch {
    throw new Error(
      "the selected repository is not a Git checkout in the API environment. Add it by mounted path instead of browser upload.",
    );
  }
}

async function gitHasStagedChanges(cwd: string): Promise<boolean> {
  try {
    await runGit(cwd, ["diff", "--cached", "--quiet"]);
    return false;
  } catch {
    return true;
  }
}

async function runGit(
  cwd: string,
  args: string[],
  env?: Record<string, string>,
): Promise<string> {
  return runCommand(
    process.env.OPEN_MAINTAINER_GIT_COMMAND ?? "git",
    args,
    cwd,
    env,
  );
}

async function runGh(cwd: string, args: string[]): Promise<string> {
  return runCommand(process.env.OPEN_MAINTAINER_GH_COMMAND ?? "gh", args, cwd);
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env?: Record<string, string>,
): Promise<string> {
  try {
    const { stdout } = await execFileAsync(command, args, {
      cwd,
      ...(env ? { env: { ...process.env, ...env } } : {}),
      maxBuffer: 1024 * 1024,
      timeout: 120_000,
    });
    return stdout;
  } catch (error) {
    if (isExecError(error)) {
      const details = [error.stderr, error.stdout, error.message]
        .filter((part) => typeof part === "string" && part.trim().length > 0)
        .join("\n")
        .trim();
      throw new Error(`${command} ${args.join(" ")} failed: ${details}`);
    }
    throw error;
  }
}

function gitCommitIdentityEnv(): Record<string, string> {
  const name =
    process.env.OPEN_MAINTAINER_GIT_AUTHOR_NAME ??
    process.env.GIT_AUTHOR_NAME ??
    "Open Maintainer";
  const email =
    process.env.OPEN_MAINTAINER_GIT_AUTHOR_EMAIL ??
    process.env.GIT_AUTHOR_EMAIL ??
    "open-maintainer@users.noreply.github.com";
  return {
    GIT_AUTHOR_NAME: name,
    GIT_AUTHOR_EMAIL: email,
    GIT_COMMITTER_NAME: name,
    GIT_COMMITTER_EMAIL: email,
  };
}

function gitPushAuthEnv(): Record<string, string> | undefined {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token) {
    return undefined;
  }
  const credentials = Buffer.from(`x-access-token:${token}`, "utf8").toString(
    "base64",
  );
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${credentials}`,
  };
}

function isExecError(
  error: unknown,
): error is Error & { stdout?: string; stderr?: string } {
  return error instanceof Error;
}

function findFirstUrl(output: string): string | null {
  return output.match(/https?:\/\/\S+/)?.[0] ?? null;
}

function pullRequestNumber(prUrl: string): number {
  const match = prUrl.match(/\/pull\/(\d+)/);
  return match ? Number.parseInt(match[1] ?? "0", 10) : 0;
}

async function prepareReviewPreviewInput(input: {
  repoId: string;
  repo: Repo;
  repositorySources: RepositorySourceAnalysisRegistry;
  baseRef?: string;
  headRef?: string;
  prNumber?: number;
}): Promise<
  | {
      ok: true;
      profile: RepoProfile;
      reviewInput: ReviewInput;
      worktreeRoot: string | null;
    }
  | { ok: false; statusCode: 409 | 422; error: string }
> {
  if (input.prNumber) {
    const githubReviewInput = await githubReviewInputForPullRequest(input);
    if (githubReviewInput) {
      if (githubReviewInput.changedFiles.length === 0) {
        return {
          ok: false,
          statusCode: 422,
          error: `No changed files were detected for PR #${input.prNumber}. Check the pull request before creating a review preview.`,
        };
      }
      const profileResult = await latestOrCreateProfile({
        repoId: input.repoId,
        repositorySources: input.repositorySources,
        ref: githubReviewInput.baseRef,
      });
      if (!profileResult.ok) {
        return {
          ok: false,
          statusCode:
            profileResult.statusCode === 404 ? 409 : profileResult.statusCode,
          error: profileResult.message,
        };
      }
      return {
        ok: true,
        profile: profileResult.profile,
        reviewInput: githubReviewInput,
        worktreeRoot: null,
      };
    }
  }

  const worktreeRoot = store.repoWorktrees.get(input.repoId);
  if (!worktreeRoot) {
    return {
      ok: false,
      statusCode: 409,
      error: input.prNumber
        ? "PR number review requires GitHub App credentials or a registered local repository worktree with gh available."
        : "Review preview requires a registered local repository worktree in this release.",
    };
  }

  let localPullRequest: Awaited<
    ReturnType<typeof localPullRequestMetadata>
  > | null = null;
  let localPullRequestError: string | null = null;
  if (input.prNumber) {
    try {
      localPullRequest = await localPullRequestMetadata({
        worktreeRoot,
        prNumber: input.prNumber,
      });
    } catch (error) {
      localPullRequestError =
        error instanceof Error ? error.message : "Unable to resolve PR refs.";
    }
  }
  if (input.prNumber && !input.baseRef && !localPullRequest) {
    return {
      ok: false,
      statusCode: 422,
      error:
        `Unable to resolve the base ref for PR #${input.prNumber}. Enter a base ref manually or authenticate gh in the API environment. ${localPullRequestError ?? ""}`.trim(),
    };
  }
  const baseRef =
    input.baseRef ?? localPullRequest?.baseRef ?? input.repo.defaultBranch;
  const headRef = input.headRef ?? "HEAD";
  const profileResult = await latestOrCreateProfile({
    repoId: input.repoId,
    repositorySources: input.repositorySources,
  });
  if (!profileResult.ok) {
    return {
      ok: false,
      statusCode:
        profileResult.statusCode === 404 ? 409 : profileResult.statusCode,
      error: profileResult.message,
    };
  }
  const localReviewInput = await assembleLocalReviewInput({
    repoRoot: worktreeRoot,
    repoId: input.repoId,
    baseRef,
    headRef,
  });
  if (localReviewInput.changedFiles.length === 0) {
    return {
      ok: false,
      statusCode: 422,
      error: `No changed files were detected for ${baseRef}...${headRef}. Check the base/head refs before creating a review preview.`,
    };
  }

  return {
    ok: true,
    profile: profileResult.profile,
    reviewInput: {
      ...localReviewInput,
      owner: input.repo.owner,
      repo: input.repo.name,
      prNumber: input.prNumber ?? null,
      title: localPullRequest?.title ?? localReviewInput.title,
      body: localPullRequest?.body ?? localReviewInput.body,
      url: localPullRequest?.url ?? localReviewInput.url,
      author: localPullRequest?.author ?? localReviewInput.author,
      isDraft: localPullRequest?.isDraft ?? localReviewInput.isDraft,
      mergeable: localPullRequest?.mergeable ?? localReviewInput.mergeable,
      mergeStateStatus:
        localPullRequest?.mergeStateStatus ?? localReviewInput.mergeStateStatus,
      reviewDecision:
        localPullRequest?.reviewDecision ?? localReviewInput.reviewDecision,
    },
    worktreeRoot,
  };
}

async function githubReviewInputForPullRequest(input: {
  repoId: string;
  repo: Repo;
  prNumber?: number;
}): Promise<ReviewInput | null> {
  if (!input.prNumber) {
    return null;
  }
  const auth = githubAuthForInstallation(input.repo.installationId);
  if (!auth) {
    return null;
  }
  return fetchPullRequestReviewContext({
    repoId: input.repoId,
    owner: input.repo.owner,
    repo: input.repo.name,
    pullNumber: input.prNumber,
    auth,
  });
}

async function latestOrCreateProfile(input: {
  repoId: string;
  repositorySources: RepositorySourceAnalysisRegistry;
  ref?: string;
}) {
  return input.repositorySources.ensureProfile({
    repoId: input.repoId,
    ...(input.ref ? { ref: input.ref } : {}),
    createdRunMessage: "Repository profile generated for PR review preview.",
  });
}

async function localPullRequestMetadata(input: {
  worktreeRoot: string;
  prNumber: number;
}): Promise<{
  baseRef: string;
  title: string | null;
  body: string;
  url: string | null;
  author: string | null;
  isDraft: boolean | null;
  mergeable: string | null;
  mergeStateStatus: string | null;
  reviewDecision: string | null;
}> {
  const output = await runGh(input.worktreeRoot, [
    "pr",
    "view",
    String(input.prNumber),
    "--json",
    "baseRefName,title,body,url,author,isDraft,mergeable,mergeStateStatus,reviewDecision",
  ]);
  const parsed = z
    .object({
      baseRefName: z.string().min(1),
      title: z.string().nullable().optional(),
      body: z.string().nullable().optional(),
      url: z.string().url().nullable().optional(),
      author: z.object({ login: z.string().nullable().optional() }).optional(),
      isDraft: z.boolean().nullable().optional(),
      mergeable: z.string().nullable().optional(),
      mergeStateStatus: z.string().nullable().optional(),
      reviewDecision: z.string().nullable().optional(),
    })
    .parse(JSON.parse(output));
  return {
    baseRef: parsed.baseRefName,
    title: parsed.title ?? null,
    body: parsed.body ?? "",
    url: parsed.url ?? null,
    author: parsed.author?.login ?? null,
    isDraft: parsed.isDraft ?? null,
    mergeable: parsed.mergeable ?? null,
    mergeStateStatus: parsed.mergeStateStatus ?? null,
    reviewDecision: parsed.reviewDecision ?? null,
  };
}

async function reviewPromptContextForRepository(input: {
  repoId: string;
  profile: RepoProfile;
  worktreeRoot: string | null;
}) {
  const artifact = latestArtifactLookup(input.repoId);
  const readContext = async (repoPath: string, artifactFallback?: string) =>
    (input.worktreeRoot
      ? await readOptionalWorktreeFile(input.worktreeRoot, repoPath)
      : undefined) ??
    artifact(repoPath) ??
    (artifactFallback ? artifact(artifactFallback) : undefined);
  const skillPath = (name: string) =>
    `.agents/skills/${input.profile.name}-${name}/SKILL.md`;
  const generatedContext = [
    artifact(".open-maintainer/report.md"),
    artifact("CLAUDE.md"),
    artifact(".github/copilot-instructions.md"),
    artifact(".cursor/rules/open-maintainer.md"),
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  return {
    ...optionalContext(
      "openMaintainerConfig",
      await readContext(".open-maintainer.yml"),
    ),
    ...optionalContext("agentsMd", await readContext("AGENTS.md")),
    ...optionalContext(
      "repoPrReviewSkill",
      await readContext(
        skillPath("pr-review"),
        ".agents/skills/pr-review/SKILL.md",
      ),
    ),
    ...optionalContext(
      "repoTestingWorkflowSkill",
      await readContext(
        skillPath("testing-workflow"),
        ".agents/skills/testing-workflow/SKILL.md",
      ),
    ),
    ...optionalContext(
      "repoOverviewSkill",
      await readContext(
        skillPath("start-task"),
        ".agents/skills/repo-overview/SKILL.md",
      ),
    ),
    ...optionalContext(
      "copilotInstructions",
      await readContext(".github/copilot-instructions.md"),
    ),
    ...optionalContext(
      "cursorRule",
      await readContext(".cursor/rules/open-maintainer.md"),
    ),
    ...optionalContext("generatedContext", generatedContext || undefined),
  };
}

function latestArtifactLookup(repoId: string) {
  const artifacts = [...(store.artifacts.get(repoId) ?? [])].reverse();
  return (artifactType: string) =>
    artifacts.find((artifact) => artifact.type === artifactType)?.content ??
    artifacts.find(
      (artifact) =>
        typeof artifact.type === "string" &&
        artifact.type.endsWith(`/${artifactType}`),
    )?.content;
}

async function readOptionalWorktreeFile(
  worktreeRoot: string,
  repoPath: string,
): Promise<string | undefined> {
  return readFile(path.join(worktreeRoot, repoPath), "utf8").catch(
    () => undefined,
  );
}

function optionalContext(key: string, value: string | undefined) {
  return value ? { [key]: value } : {};
}

function githubAuthForInstallation(
  installationId: string,
): GitHubAppInstallationAuth | null {
  const appId = process.env.GITHUB_APP_ID;
  const privateKeyBase64 = process.env.GITHUB_PRIVATE_KEY_BASE64;
  if (!appId || !privateKeyBase64) {
    return null;
  }
  return {
    appId,
    installationId,
    privateKey: Buffer.from(privateKeyBase64, "base64").toString("utf8"),
  };
}

async function createGitHubAppContextPr(input: {
  repoId: string;
  repo: Repo;
  profile: RepoProfile;
  artifacts: GeneratedArtifact[];
  runId: string;
}): Promise<
  | { ok: true; contextPr: Awaited<ReturnType<typeof createContextPr>> }
  | { ok: false; statusCode: 422; error: string }
> {
  const auth = githubAuthForInstallation(input.repo.installationId);
  if (!auth) {
    return {
      ok: false,
      statusCode: 422,
      error:
        "GitHub App credentials are required to open a real context PR for this repository.",
    };
  }
  return {
    ok: true,
    contextPr: await createContextPr({
      repoId: input.repoId,
      owner: input.repo.owner,
      repo: input.repo.name,
      defaultBranch: input.repo.defaultBranch,
      profileVersion: input.profile.version,
      artifacts: input.artifacts,
      runReference: input.runId,
      generatedAt: nowIso(),
      mock: false,
      auth,
    }),
  };
}

async function detectLocalDefaultBranch(repoRoot: string): Promise<string> {
  try {
    return (await runGit(repoRoot, ["symbolic-ref", "--short", "HEAD"])).trim();
  } catch {
    return "local";
  }
}
