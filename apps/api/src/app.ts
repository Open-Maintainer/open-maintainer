import path from "node:path";
import cors from "@fastify/cors";
import formBody from "@fastify/formbody";
import rateLimit from "@fastify/rate-limit";
import {
  assertProviderConsent,
  assertProviderExecutableAvailable,
  buildProvider,
  createProviderConfig,
} from "@open-maintainer/ai";
import { analyzeRepo, scanRepository } from "@open-maintainer/analyzer";
import {
  type ContextArtifactTarget,
  type ModelArtifactContent,
  type ModelSkillContent,
  buildArtifactSynthesisPrompt,
  buildRepoFactsSynthesisPrompt,
  buildSkillSynthesisPrompt,
  createContextArtifacts,
  deterministicContextOutput,
  modelArtifactContentJsonSchema,
  modelSkillContentJsonSchema,
  parseModelArtifactContent,
  parseModelSkillContent,
  parseStructuredRepoFacts,
  structuredContextOutputFromRepoFacts,
  structuredRepoFactsJsonSchema,
} from "@open-maintainer/context";
import { checkDatabase, checkRedis, store } from "@open-maintainer/db";
import {
  createContextPr,
  fetchRepositoryFilesForAnalysis,
  mapInstallationEvent,
  verifyWebhookSignature,
} from "@open-maintainer/github";
import type { GitHubAppInstallationAuth } from "@open-maintainer/github";
import {
  type Installation,
  type Repo,
  newId,
  nowIso,
} from "@open-maintainer/shared";
import Fastify from "fastify";
import { z } from "zod";

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

  app.register(async (limitedRoutes) => {
    await limitedRoutes.register(rateLimit, { global: false });

    limitedRoutes.post(
      "/repos/local",
      { config: { rateLimit: sensitiveRouteRateLimit } },
      async (request, reply) => {
        const body = z
          .object({ repoRoot: z.string().min(1).max(500) })
          .parse(request.body ?? {});
        const repoRoot = path.resolve(body.repoRoot);
        const files = await scanRepository(repoRoot, { maxFiles: 800 });
        if (files.length === 0) {
          return reply.code(422).send({
            error:
              "No readable repository files were found at the selected path.",
          });
        }

        const owner = path.basename(path.dirname(repoRoot)) || "local";
        const name = path.basename(repoRoot) || "repository";
        const repo = registerLocalRepository({ owner, name, files });

        return { repo, files: files.length };
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
        const files = body.files.flatMap((file) => {
          const normalizedPath = normalizeUploadedPath(file.path);
          return normalizedPath ? [{ ...file, path: normalizedPath }] : [];
        });
        if (files.length === 0) {
          return reply.code(422).send({
            error:
              "No readable repository files were provided by the selected directory.",
          });
        }

        const repo = registerLocalRepository({
          owner: "local",
          name: body.name ?? "uploaded-repo",
          files,
        });
        return { repo, files: files.length };
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
        let files = store.repoFiles.get(repoId) ?? [];
        if (files.length === 0) {
          const auth = githubAuthForInstallation(repo.installationId);
          if (!auth) {
            store.updateRun(run.id, {
              status: "failed",
              safeMessage:
                "Repository files are unavailable. Configure GitHub App credentials with contents read permission or seed local files for development.",
            });
            return reply.code(409).send({
              error: store.runs.get(run.id)?.safeMessage,
              run: store.runs.get(run.id),
            });
          }
          const fetched = await fetchRepositoryFilesForAnalysis({
            owner: repo.owner,
            repo: repo.name,
            ref: repo.defaultBranch,
            auth,
          });
          files = fetched.files.map((file) => ({
            path: file.path,
            content: file.content,
          }));
          store.repoFiles.set(repoId, files);
        }
        const version = (store.profiles.get(repoId)?.length ?? 0) + 1;
        const profile = analyzeRepo({
          repoId,
          owner: repo.owner,
          name: repo.name,
          defaultBranch: repo.defaultBranch,
          version,
          files,
        });
        store.addProfile(profile);
        store.updateRun(run.id, {
          status: "succeeded",
          repoProfileVersion: profile.version,
          safeMessage: "Repository profile generated.",
        });
        return { run: store.runs.get(run.id), profile };
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
    let output = deterministicContextOutput(profile);
    let modelArtifacts: ModelArtifactContent | undefined;
    let modelSkills: ModelSkillContent | undefined;
    if (provider) {
      try {
        const modelProvider = buildProvider(provider);
        const repoFiles = store.repoFiles.get(repoId) ?? [];
        const factsPrompt = buildRepoFactsSynthesisPrompt({
          profile,
          files: repoFiles,
        });
        const factsCompletion = await modelProvider.complete(factsPrompt, {
          outputSchema: structuredRepoFactsJsonSchema,
        });
        const repoFacts = parseStructuredRepoFacts(factsCompletion.text);
        output = structuredContextOutputFromRepoFacts(profile, repoFacts);
        const artifactPrompt = buildArtifactSynthesisPrompt({
          profile,
          repoFacts,
        });
        const artifactCompletion = await modelProvider.complete(
          artifactPrompt,
          {
            outputSchema: modelArtifactContentJsonSchema,
          },
        );
        modelArtifacts = parseModelArtifactContent(artifactCompletion.text);
        try {
          const skillPrompt = buildSkillSynthesisPrompt({
            profile,
            repoFacts,
            agentsMd: modelArtifacts.agentsMd,
            files: repoFiles,
          });
          const skillCompletion = await modelProvider.complete(skillPrompt, {
            outputSchema: modelSkillContentJsonSchema,
          });
          modelSkills = parseModelSkillContent(skillCompletion.text);
        } catch {
          modelSkills = undefined;
        }
      } catch (error) {
        store.updateRun(run.id, {
          status: "failed",
          safeMessage:
            error instanceof Error
              ? `Model synthesis failed: ${error.message}`
              : "Model synthesis failed.",
        });
        return reply.code(502).send({
          error: store.runs.get(run.id)?.safeMessage,
          run: store.runs.get(run.id),
        });
      }
    }
    const currentArtifactCount = store.artifacts.get(repoId)?.length ?? 0;
    const artifacts = createContextArtifacts({
      repoId,
      profile,
      output,
      ...(modelArtifacts ? { modelArtifacts } : {}),
      ...(modelSkills ? { modelSkills } : {}),
      modelProvider: provider?.displayName ?? null,
      model: provider?.model ?? null,
      nextVersion: currentArtifactCount + 1,
      targets: artifactTargetsForDashboard({
        providerKind: provider.kind,
        context: body.context,
        skills: body.skills,
      }),
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
        const repo = store.repos.get(repoId);
        if (!repo) {
          return reply.code(404).send({ error: "Unknown repo." });
        }
        const auth = githubAuthForInstallation(repo.installationId);
        const contextPr = await createContextPr({
          repoId,
          owner: repo.owner,
          repo: repo.name,
          defaultBranch: repo.defaultBranch,
          profileVersion: profile.version,
          artifacts,
          runReference: run.id,
          generatedAt: nowIso(),
          mock: !auth,
          ...(auth ? { auth } : {}),
        });
        store.contextPrs.set(contextPr.id, contextPr);
        store.updateRun(run.id, {
          status: "succeeded",
          safeMessage: auth
            ? `Opened context PR at ${contextPr.prUrl}.`
            : `Created development mock context PR at ${contextPr.prUrl}; configure GitHub App credentials for a real PR.`,
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

function artifactTargetsForDashboard(input: {
  providerKind: string;
  context: "codex" | "claude" | "both" | undefined;
  skills: "codex" | "claude" | "both" | undefined;
}): ContextArtifactTarget[] {
  const defaultTarget =
    input.providerKind === "claude-cli" ? "claude" : "codex";
  const context = input.context ?? defaultTarget;
  const skills = input.skills ?? defaultTarget;
  const targets: ContextArtifactTarget[] = [];

  if (context === "codex" || context === "both") {
    targets.push("agents");
  }
  if (context === "claude" || context === "both") {
    targets.push("claude");
  }
  if (skills === "codex" || skills === "both") {
    targets.push("skills");
  }
  if (skills === "claude" || skills === "both") {
    targets.push("claude-skills");
  }
  targets.push("profile", "report", "config");
  return targets;
}

function registerLocalRepository(input: {
  owner: string;
  name: string;
  files: Array<{ path: string; content: string }>;
}): Repo {
  const createdAt = nowIso();
  const installation: Installation = {
    id: "installation_local",
    accountLogin: "local",
    accountType: "Local",
    repositorySelection: "selected",
    permissions: {
      contents: "local",
      metadata: "local",
      pull_requests: "mock",
    },
    createdAt,
  };
  const repo: Repo = {
    id: `local_${slugId(input.owner)}_${slugId(input.name)}`,
    installationId: installation.id,
    owner: input.owner,
    name: input.name,
    fullName: `${input.owner}/${input.name}`,
    defaultBranch: "local",
    private: true,
    permissions: { contents: true, metadata: true, pull_requests: false },
  };

  store.installations.set(installation.id, installation);
  store.repos.set(repo.id, repo);
  store.repoFiles.set(repo.id, input.files);
  store.profiles.delete(repo.id);
  store.artifacts.delete(repo.id);

  return repo;
}

function normalizeUploadedPath(value: string): string | null {
  const normalized = value.replaceAll("\\", "/").replace(/^\/+/, "");
  const parts = normalized
    .split("/")
    .filter((part) => part.length > 0 && part !== ".");
  if (parts.length === 0 || parts.some((part) => part === "..")) {
    return null;
  }
  return parts.join("/");
}

function slugId(value: string): string {
  let slug = "";
  let needsSeparator = false;

  for (const character of value.toLowerCase()) {
    const isAsciiLetter = character >= "a" && character <= "z";
    const isDigit = character >= "0" && character <= "9";
    if (isAsciiLetter || isDigit) {
      if (needsSeparator && slug.length > 0) {
        slug += "_";
      }
      slug += character;
      needsSeparator = false;
    } else {
      needsSeparator = slug.length > 0;
    }
  }

  return slug || "repo";
}
