import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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
  createContextBranchName,
  createContextPr,
  fetchRepositoryFilesForAnalysis,
  mapInstallationEvent,
  renderContextPrBody,
  verifyWebhookSignature,
} from "@open-maintainer/github";
import type { GitHubAppInstallationAuth } from "@open-maintainer/github";
import {
  type ArtifactType,
  ArtifactTypeSchema,
  type GeneratedArtifact,
  type Installation,
  type ModelProviderConfig,
  type Repo,
  type RepoProfile,
  newId,
  nowIso,
} from "@open-maintainer/shared";
import Fastify from "fastify";
import { z } from "zod";

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
        const repo = registerLocalRepository({
          owner,
          name,
          files,
          worktreeRoot: repoRoot,
          defaultBranch: await detectLocalDefaultBranch(repoRoot),
        });

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

        const repoName = body.name ?? "uploaded-repo";
        const mountedWorktree = await resolveMountedWorktreeForUploadedFiles({
          name: repoName,
          files,
        });
        const pendingRepo = localRepositoryRecord({
          owner: "local",
          name: repoName,
        });
        const worktreeRoot =
          mountedWorktree?.worktreeRoot ??
          (await materializeRepositoryFiles(pendingRepo.id, files));
        const repo = registerLocalRepository({
          owner: "local",
          name: repoName,
          files: mountedWorktree?.files ?? files,
          id: pendingRepo.id,
          worktreeRoot,
          ...(mountedWorktree
            ? { defaultBranch: mountedWorktree.defaultBranch }
            : {}),
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
        const auth = githubAuthForInstallation(repo.installationId);
        if (!auth) {
          store.updateRun(run.id, {
            status: "failed",
            safeMessage:
              "GitHub App credentials are required to open a real context PR for this repository.",
            externalId: null,
          });
          return reply.code(422).send({
            error: store.runs.get(run.id)?.safeMessage,
            run: store.runs.get(run.id),
          });
        }
        const contextPr = await createContextPr({
          repoId,
          owner: repo.owner,
          repo: repo.name,
          defaultBranch: repo.defaultBranch,
          profileVersion: profile.version,
          artifacts,
          runReference: run.id,
          generatedAt: nowIso(),
          mock: false,
          auth,
        });
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
  let output = deterministicContextOutput(input.profile);
  let modelArtifacts: ModelArtifactContent | undefined;
  let modelSkills: ModelSkillContent | undefined;
  try {
    const modelProvider = buildProvider(input.provider, {
      cwd: store.repoWorktrees.get(input.repoId) ?? process.cwd(),
    });
    const repoFiles = store.repoFiles.get(input.repoId) ?? [];
    const factsPrompt = buildRepoFactsSynthesisPrompt({
      profile: input.profile,
      files: repoFiles,
    });
    const factsCompletion = await modelProvider.complete(factsPrompt, {
      outputSchema: structuredRepoFactsJsonSchema,
    });
    const repoFacts = parseStructuredRepoFacts(factsCompletion.text);
    output = structuredContextOutputFromRepoFacts(input.profile, repoFacts);
    const artifactPrompt = buildArtifactSynthesisPrompt({
      profile: input.profile,
      repoFacts,
    });
    const artifactCompletion = await modelProvider.complete(artifactPrompt, {
      outputSchema: modelArtifactContentJsonSchema,
    });
    modelArtifacts = parseModelArtifactContent(artifactCompletion.text);
    try {
      const skillPrompt = buildSkillSynthesisPrompt({
        profile: input.profile,
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
    store.updateRun(input.runId, {
      status: "failed",
      safeMessage:
        error instanceof Error
          ? `Model synthesis failed: ${error.message}`
          : "Model synthesis failed.",
    });
    throw error;
  }

  const currentArtifactCount = store.artifacts.get(input.repoId)?.length ?? 0;
  const artifacts = createContextArtifacts({
    repoId: input.repoId,
    profile: input.profile,
    output,
    ...(modelArtifacts ? { modelArtifacts } : {}),
    ...(modelSkills ? { modelSkills } : {}),
    modelProvider: input.provider.displayName,
    model: input.provider.model,
    nextVersion: currentArtifactCount + 1,
    targets: artifactTargetsForDashboard({
      providerKind: input.provider.kind,
      context: input.context,
      skills: input.skills,
    }),
  });
  for (const artifact of artifacts) {
    store.addArtifact(artifact);
  }
  store.updateRun(input.runId, {
    status: "succeeded",
    artifactVersions: artifacts.map((artifact) => artifact.version),
    safeMessage: "Context artifacts generated for preview.",
  });
  return artifacts;
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
    const prUrl = findFirstUrl(
      await runGh(input.worktreeRoot, [
        "pr",
        "create",
        "--base",
        input.defaultBranch,
        "--head",
        branchName,
        "--title",
        "Update Open Maintainer context",
        "--body",
        body,
      ]),
    );
    if (!prUrl) {
      throw new Error("gh did not return a pull request URL.");
    }

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
  id?: string;
  worktreeRoot?: string;
  defaultBranch?: string;
}): Repo {
  const repo = localRepositoryRecord(input);

  store.installations.set(repo.installationId, localInstallation());
  store.repos.set(repo.id, repo);
  store.repoFiles.set(repo.id, input.files);
  if (input.worktreeRoot) {
    store.repoWorktrees.set(repo.id, input.worktreeRoot);
  } else {
    store.repoWorktrees.delete(repo.id);
  }
  store.profiles.delete(repo.id);
  store.artifacts.delete(repo.id);

  return repo;
}

function localRepositoryRecord(input: {
  owner: string;
  name: string;
  id?: string;
  defaultBranch?: string;
}): Repo {
  return {
    id: input.id ?? `local_${slugId(input.owner)}_${slugId(input.name)}`,
    installationId: "installation_local",
    owner: input.owner,
    name: input.name,
    fullName: `${input.owner}/${input.name}`,
    defaultBranch: input.defaultBranch ?? "local",
    private: true,
    permissions: { contents: true, metadata: true, pull_requests: false },
  };
}

async function detectLocalDefaultBranch(repoRoot: string): Promise<string> {
  try {
    return (await runGit(repoRoot, ["symbolic-ref", "--short", "HEAD"])).trim();
  } catch {
    return "local";
  }
}

function localInstallation(): Installation {
  const createdAt = nowIso();
  return {
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
}

async function resolveMountedWorktreeForUploadedFiles(input: {
  name: string;
  files: Array<{ path: string; content: string }>;
}): Promise<{
  worktreeRoot: string;
  files: Array<{ path: string; content: string }>;
  defaultBranch: string;
} | null> {
  for (const candidateRoot of mountedWorktreeCandidates()) {
    try {
      await requireGitRepository(candidateRoot);
      const candidateFiles = await scanRepository(candidateRoot, {
        maxFiles: 800,
      });
      if (
        uploadedFilesMatchMountedWorktree({
          uploadName: input.name,
          uploadedFiles: input.files,
          candidateRoot,
          candidateFiles,
        })
      ) {
        return {
          worktreeRoot: candidateRoot,
          files: candidateFiles,
          defaultBranch: await detectLocalDefaultBranch(candidateRoot),
        };
      }
    } catch {}
  }
  return null;
}

function mountedWorktreeCandidates(): string[] {
  const configuredRoots = (
    process.env.OPEN_MAINTAINER_DASHBOARD_REPO_ROOTS ??
    process.env.OPEN_MAINTAINER_DASHBOARD_REPO_ROOT ??
    ""
  )
    .split(path.delimiter)
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 0);
  const candidates = [...configuredRoots, process.cwd(), "/app"];
  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
}

function uploadedFilesMatchMountedWorktree(input: {
  uploadName: string;
  uploadedFiles: Array<{ path: string; content: string }>;
  candidateRoot: string;
  candidateFiles: Array<{ path: string; content: string }>;
}): boolean {
  const uploadedPackageName = packageNameFromFiles(input.uploadedFiles);
  const candidatePackageName = packageNameFromFiles(input.candidateFiles);
  if (
    uploadedPackageName &&
    candidatePackageName &&
    uploadedPackageName === candidatePackageName
  ) {
    return true;
  }

  const uploadedSlug = slugId(input.uploadName);
  const candidateSlug = slugId(path.basename(input.candidateRoot));
  const uploadedPackageJson = rootFileContent(
    input.uploadedFiles,
    "package.json",
  );
  const candidatePackageJson = rootFileContent(
    input.candidateFiles,
    "package.json",
  );
  return (
    uploadedSlug === candidateSlug &&
    !!uploadedPackageJson &&
    uploadedPackageJson === candidatePackageJson
  );
}

function packageNameFromFiles(
  files: Array<{ path: string; content: string }>,
): string | null {
  const packageJson = rootFileContent(files, "package.json");
  if (!packageJson) {
    return null;
  }
  try {
    const parsed = JSON.parse(packageJson) as { name?: unknown };
    return typeof parsed.name === "string" ? parsed.name : null;
  } catch {
    return null;
  }
}

function rootFileContent(
  files: Array<{ path: string; content: string }>,
  filePath: string,
): string | null {
  return files.find((file) => file.path === filePath)?.content ?? null;
}

async function materializeRepositoryFiles(
  repoId: string,
  files: Array<{ path: string; content: string }>,
): Promise<string> {
  const base =
    process.env.OPEN_MAINTAINER_LOCAL_REPO_CACHE ??
    path.join(tmpdir(), "open-maintainer", "local-repos");
  const root = path.join(base, repoId);
  await rm(root, { recursive: true, force: true });
  for (const file of files) {
    const normalizedPath = normalizeUploadedPath(file.path);
    if (!normalizedPath) {
      continue;
    }
    const destination = path.join(root, normalizedPath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.content, "utf8");
  }
  return root;
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
