import cors from "@fastify/cors";
import {
  assertGenerationAllowed,
  createProviderConfig,
} from "@open-maintainer/ai";
import { analyzeRepo } from "@open-maintainer/analyzer";
import {
  createContextArtifacts,
  deterministicContextOutput,
} from "@open-maintainer/context";
import { checkDatabase, checkRedis, store } from "@open-maintainer/db";
import {
  createMockContextPr,
  mapInstallationEvent,
  verifyWebhookSignature,
} from "@open-maintainer/github";
import { newId, nowIso } from "@open-maintainer/shared";
import Fastify from "fastify";
import { z } from "zod";

export function buildApp() {
  const app = Fastify({ logger: false });
  app.register(cors, { origin: true });

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
    store.recordRun({
      repoId: null,
      type: "worker",
      status: "succeeded",
      inputSummary: "Worker heartbeat",
      safeMessage: "Worker heartbeat recorded.",
      artifactVersions: [],
      repoProfileVersion: null,
      provider: null,
      model: null,
      externalId: null,
    });
    return { ok: true, workerHeartbeatAt: store.workerHeartbeatAt };
  });

  app.get("/installations", async () => ({
    installations: [...store.installations.values()],
  }));
  app.get("/repos", async () => ({ repos: [...store.repos.values()] }));

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

  app.post("/repos/:repoId/analyze", async (request, reply) => {
    const { repoId } = z.object({ repoId: z.string() }).parse(request.params);
    const repo = store.repos.get(repoId);
    if (!repo) {
      return reply.code(404).send({ error: "Unknown repo." });
    }
    const run = store.recordRun({
      repoId,
      type: "analysis",
      status: "running",
      inputSummary: `Analyze ${repo.fullName}`,
      safeMessage: null,
      artifactVersions: [],
      repoProfileVersion: null,
      provider: null,
      model: null,
      externalId: null,
    });
    const version = (store.profiles.get(repoId)?.length ?? 0) + 1;
    const profile = analyzeRepo({
      repoId,
      owner: repo.owner,
      name: repo.name,
      defaultBranch: repo.defaultBranch,
      version,
      files: store.repoFiles.get(repoId) ?? [],
    });
    store.addProfile(profile);
    store.updateRun(run.id, {
      status: "succeeded",
      repoProfileVersion: profile.version,
      safeMessage: "Repository profile generated.",
    });
    return { run: store.runs.get(run.id), profile };
  });

  app.get("/repos/:repoId/profile", async (request, reply) => {
    const { repoId } = z.object({ repoId: z.string() }).parse(request.params);
    const profile = store.latestProfile(repoId);
    if (!profile) {
      return reply.code(404).send({ error: "No profile has been generated." });
    }
    return { profile };
  });

  app.post("/model-providers", async (request) => {
    const body = z
      .object({
        kind: z.enum([
          "openai-compatible",
          "anthropic",
          "local-openai-compatible",
        ]),
        displayName: z.string(),
        baseUrl: z.string().url(),
        model: z.string(),
        apiKey: z.string(),
        repoContentConsent: z.boolean(),
      })
      .parse(request.body);
    const provider = createProviderConfig(body);
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
      .object({ providerId: z.string().optional() })
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
    try {
      assertGenerationAllowed(provider);
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

    const run = store.recordRun({
      repoId,
      type: "generation",
      status: "running",
      inputSummary: `Generate AGENTS.md and .open-maintainer.yml from profile v${profile.version}.`,
      safeMessage: null,
      artifactVersions: [],
      repoProfileVersion: profile.version,
      provider: provider.displayName,
      model: provider.model,
      externalId: null,
    });
    const currentArtifactCount = store.artifacts.get(repoId)?.length ?? 0;
    const artifacts = createContextArtifacts({
      repoId,
      profile,
      output: deterministicContextOutput(profile),
      modelProvider: provider.displayName,
      model: provider.model,
      nextVersion: currentArtifactCount + 1,
    });
    for (const artifact of artifacts) {
      store.addArtifact(artifact);
    }
    store.updateRun(run.id, {
      status: "succeeded",
      artifactVersions: artifacts.map((artifact) => artifact.version),
      safeMessage: "Context artifacts generated for preview.",
    });
    return { run: store.runs.get(run.id), artifacts };
  });

  app.get("/repos/:repoId/artifacts", async (request) => {
    const { repoId } = z.object({ repoId: z.string() }).parse(request.params);
    return { artifacts: store.artifacts.get(repoId) ?? [] };
  });

  app.post("/repos/:repoId/open-context-pr", async (request, reply) => {
    const { repoId } = z.object({ repoId: z.string() }).parse(request.params);
    const profile = store.latestProfile(repoId);
    if (!profile) {
      return reply.code(409).send({ error: "No repo profile available." });
    }
    const artifacts = (store.artifacts.get(repoId) ?? []).filter(
      (artifact) =>
        artifact.type === "AGENTS.md" ||
        artifact.type === ".open-maintainer.yml",
    );
    if (artifacts.length < 2) {
      return reply
        .code(409)
        .send({ error: "Generate artifacts before opening a context PR." });
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
    const contextPr = createMockContextPr({
      repoId,
      profileVersion: profile.version,
      artifacts,
    });
    store.contextPrs.set(contextPr.id, contextPr);
    store.updateRun(run.id, {
      status: "succeeded",
      safeMessage: `Opened context PR at ${contextPr.prUrl}.`,
      externalId: contextPr.prUrl,
    });
    return { run: store.runs.get(run.id), contextPr };
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
