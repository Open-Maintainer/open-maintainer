import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { MemoryStore } from "@open-maintainer/db";
import type { Repo } from "@open-maintainer/shared";
import { newId, nowIso } from "@open-maintainer/shared";
import { afterEach, describe, expect, it } from "vitest";
import { createRepositorySourceAnalysisRegistry } from "../src/repository-source-analysis";

const execFileAsync = promisify(execFile);

const previousRepositoryCache = process.env.OPEN_MAINTAINER_LOCAL_REPO_CACHE;
const previousMountedRoots = process.env.OPEN_MAINTAINER_DASHBOARD_REPO_ROOTS;

afterEach(() => {
  restoreEnv("OPEN_MAINTAINER_LOCAL_REPO_CACHE", previousRepositoryCache);
  restoreEnv("OPEN_MAINTAINER_DASHBOARD_REPO_ROOTS", previousMountedRoots);
});

describe("repository source analysis registry", () => {
  it("registers local worktrees and invalidates derived state", async () => {
    const store = new MemoryStore();
    const registry = createRepositorySourceAnalysisRegistry({ store });
    const repoRoot = await createGitRepository("local-worktree-tool", {
      branch: "main",
      files: {
        "package.json": JSON.stringify({
          name: "local-worktree-tool",
          scripts: { test: "bun test" },
        }),
        "src/index.ts": "export const ok = true;\n",
      },
    });

    try {
      const registered = await registry.registerSource({
        kind: "local-worktree",
        repoRoot,
        owner: "local",
      });
      expect(registered.ok).toBe(true);
      if (!registered.ok) {
        return;
      }
      expect(registered.repo.id).toBe("local_local_local_worktree_tool");
      expect(registered.fileCount).toBeGreaterThan(0);
      expect(registered.source).toBe("local-worktree");
      expect(registered.worktreeRoot).toBe(repoRoot);
      expect(registered.repo.defaultBranch).toBe("main");
      expect(store.repoFiles.get(registered.repo.id)?.[0]?.path).toBe(
        "package.json",
      );

      const analysis = await registry.analyzeRepository({
        repoId: registered.repo.id,
      });
      expect(analysis.ok).toBe(true);
      if (!analysis.ok) {
        return;
      }
      store.addArtifact({
        id: newId("artifact"),
        repoId: registered.repo.id,
        type: "AGENTS.md",
        version: 1,
        content: "# stale\n",
        sourceProfileVersion: analysis.profile.version,
        modelProvider: null,
        model: null,
        createdAt: nowIso(),
      });

      const registeredAgain = await registry.registerSource({
        kind: "local-worktree",
        repoRoot,
        owner: "local",
      });
      expect(registeredAgain.ok).toBe(true);
      expect(store.profiles.get(registered.repo.id)).toBeUndefined();
      expect(store.artifacts.get(registered.repo.id)).toBeUndefined();
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("normalizes uploaded files and materializes the fallback worktree", async () => {
    const store = new MemoryStore();
    const cacheRoot = await mkdtemp(path.join(tmpdir(), "rsa-cache-"));
    process.env.OPEN_MAINTAINER_LOCAL_REPO_CACHE = cacheRoot;
    const registry = createRepositorySourceAnalysisRegistry({ store });

    try {
      const registered = await registry.registerSource({
        kind: "uploaded-files",
        name: "uploaded-tool",
        files: [
          { path: "/package.json", content: '{"name":"uploaded-tool"}' },
          { path: "src\\index.ts", content: "export const ok = true;\n" },
          { path: "../secret.txt", content: "nope" },
        ],
      });

      expect(registered.ok).toBe(true);
      if (!registered.ok) {
        return;
      }
      expect(registered.repo.id).toBe("local_local_uploaded_tool");
      expect(registered.fileCount).toBe(2);
      expect(registered.source).toBe("uploaded-files");
      expect(registered.worktreeRoot).toBe(
        path.join(cacheRoot, registered.repo.id),
      );
      expect(
        store.repoFiles.get(registered.repo.id)?.map((file) => file.path),
      ).toEqual(["package.json", "src/index.ts"]);
      await expect(
        readFile(path.join(registered.worktreeRoot, "src/index.ts"), "utf8"),
      ).resolves.toBe("export const ok = true;\n");
      await expect(
        readFile(path.join(cacheRoot, "secret.txt"), "utf8"),
      ).rejects.toThrow();
    } finally {
      await rm(cacheRoot, { recursive: true, force: true });
    }
  });

  it("uses a mounted worktree when browser uploads match it", async () => {
    const store = new MemoryStore();
    const repoRoot = await createGitRepository("mounted-dashboard-tool", {
      branch: "feature/context-base",
      files: {
        "package.json": JSON.stringify({
          name: "mounted-dashboard-tool",
          scripts: { test: "bun test" },
        }),
        "src/index.ts": "export const mounted = true;\n",
      },
    });
    process.env.OPEN_MAINTAINER_DASHBOARD_REPO_ROOTS = repoRoot;
    const registry = createRepositorySourceAnalysisRegistry({ store });

    try {
      const registered = await registry.registerSource({
        kind: "uploaded-files",
        name: "mounted-dashboard-tool",
        files: [
          {
            path: "package.json",
            content: JSON.stringify({ name: "mounted-dashboard-tool" }),
          },
        ],
      });

      expect(registered.ok).toBe(true);
      if (!registered.ok) {
        return;
      }
      expect(registered.source).toBe("uploaded-files-mounted-worktree");
      expect(registered.worktreeRoot).toBe(repoRoot);
      expect(registered.repo.defaultBranch).toBe("feature/context-base");
      expect(store.repoFiles.get(registered.repo.id)).toContainEqual({
        path: "src/index.ts",
        content: "export const mounted = true;\n",
      });
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("tracks analysis runs, profile versions, and lazy profile reuse", async () => {
    const store = new MemoryStore();
    const registry = createRepositorySourceAnalysisRegistry({ store });
    const registered = await registry.registerSource({
      kind: "uploaded-files",
      name: "profile-tool",
      files: [
        {
          path: "package.json",
          content: JSON.stringify({
            name: "profile-tool",
            dependencies: { fastify: "latest" },
          }),
        },
      ],
    });
    expect(registered.ok).toBe(true);
    if (!registered.ok) {
      return;
    }

    const firstAnalysis = await registry.analyzeRepository({
      repoId: registered.repo.id,
    });
    expect(firstAnalysis.ok).toBe(true);
    if (!firstAnalysis.ok) {
      return;
    }
    expect(firstAnalysis.run.status).toBe("succeeded");
    expect(firstAnalysis.run.repoProfileVersion).toBe(1);
    expect(firstAnalysis.profile.frameworks).toContain("fastify");

    const runsBeforeEnsure = store.listRuns(registered.repo.id).length;
    const ensuredExisting = await registry.ensureProfile({
      repoId: registered.repo.id,
    });
    expect(ensuredExisting.ok).toBe(true);
    if (!ensuredExisting.ok) {
      return;
    }
    expect(ensuredExisting.created).toBe(false);
    expect(ensuredExisting.run).toBeUndefined();
    expect(store.listRuns(registered.repo.id)).toHaveLength(runsBeforeEnsure);

    const reusedWorkspace = await registry.prepareAnalysis({
      repoId: registered.repo.id,
      profilePolicy: "reuse",
    });
    expect(reusedWorkspace.ok).toBe(true);
    if (!reusedWorkspace.ok) {
      return;
    }
    expect(reusedWorkspace.profileCreated).toBe(false);
    expect(reusedWorkspace.run).toBeUndefined();
    expect(reusedWorkspace.files[0]?.path).toBe("package.json");

    const refreshedWorkspace = await registry.prepareAnalysis({
      repoId: registered.repo.id,
      profilePolicy: "refresh",
      createdRunMessage: "Repository profile refreshed for test.",
    });
    expect(refreshedWorkspace.ok).toBe(true);
    if (!refreshedWorkspace.ok) {
      return;
    }
    expect(refreshedWorkspace.profileCreated).toBe(true);
    expect(refreshedWorkspace.profile.version).toBe(2);
    expect(refreshedWorkspace.run?.safeMessage).toBe(
      "Repository profile refreshed for test.",
    );
  });

  it("prepares generation, review, and context PR workspaces", async () => {
    const store = new MemoryStore();
    const registry = createRepositorySourceAnalysisRegistry({ store });
    const registered = await registry.registerSource({
      kind: "uploaded-files",
      name: "workspace-tool",
      files: [
        {
          path: "package.json",
          content: JSON.stringify({
            name: "workspace-tool",
            scripts: { test: "bun test" },
          }),
        },
      ],
    });
    expect(registered.ok).toBe(true);
    if (!registered.ok) {
      return;
    }

    const missingGeneration = await registry.prepareGeneration({
      repoId: registered.repo.id,
    });
    expect(missingGeneration.ok).toBe(false);
    if (!missingGeneration.ok) {
      expect(missingGeneration.code).toBe("NO_PROFILE");
    }

    const analysis = await registry.prepareAnalysis({
      repoId: registered.repo.id,
      profilePolicy: "refresh",
    });
    expect(analysis.ok).toBe(true);
    if (!analysis.ok) {
      return;
    }
    const generation = await registry.prepareGeneration({
      repoId: registered.repo.id,
    });
    expect(generation.ok).toBe(true);
    if (!generation.ok) {
      return;
    }
    expect(generation.profile.version).toBe(analysis.profile.version);
    expect(generation.files.map((file) => file.path)).toEqual(["package.json"]);
    expect(generation.worktreeRoot).toBe(registered.worktreeRoot);

    const review = await registry.prepareReview({ repoId: registered.repo.id });
    expect(review.ok).toBe(true);
    if (!review.ok) {
      return;
    }
    expect(review.profileCreated).toBe(false);
    expect(review.worktreeRoot).toBe(registered.worktreeRoot);

    const contextPr = await registry.prepareContextPr({
      repoId: registered.repo.id,
      requireWritableWorktree: true,
    });
    expect(contextPr.ok).toBe(true);
    if (!contextPr.ok) {
      return;
    }
    expect(contextPr.worktreeRoot).toBe(registered.worktreeRoot);
  });

  it("reports a domain error when context PR preparation requires a missing worktree", async () => {
    const store = new MemoryStore();
    const repo = remoteRepo("remote_context");
    store.repos.set(repo.id, repo);
    store.repoFiles.set(repo.id, [
      {
        path: "package.json",
        content: JSON.stringify({ scripts: { test: "bun test" } }),
      },
    ]);
    const registry = createRepositorySourceAnalysisRegistry({ store });

    const analysis = await registry.prepareAnalysis({
      repoId: repo.id,
      profilePolicy: "refresh",
    });
    expect(analysis.ok).toBe(true);
    if (!analysis.ok) {
      return;
    }

    const contextPr = await registry.prepareContextPr({
      repoId: repo.id,
      requireWritableWorktree: true,
    });
    expect(contextPr.ok).toBe(false);
    if (!contextPr.ok) {
      expect(contextPr.statusCode).toBe(409);
      expect(contextPr.code).toBe("WORKTREE_UNAVAILABLE");
    }
  });

  it("returns domain errors for unknown and unavailable repositories", async () => {
    const store = new MemoryStore();
    const registry = createRepositorySourceAnalysisRegistry({ store });

    const unknown = await registry.analyzeRepository({ repoId: "missing" });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.statusCode).toBe(404);
      expect(unknown.code).toBe("UNKNOWN_REPO");
    }

    const repo = remoteRepo("remote_unseeded");
    store.repos.set(repo.id, repo);
    const unavailable = await registry.analyzeRepository({ repoId: repo.id });
    expect(unavailable.ok).toBe(false);
    if (!unavailable.ok) {
      expect(unavailable.statusCode).toBe(409);
      expect(unavailable.code).toBe("REPOSITORY_FILES_UNAVAILABLE");
      expect(unavailable.run?.status).toBe("failed");
    }
  });

  it("creates missing profiles with a fake remote fetcher", async () => {
    const store = new MemoryStore();
    const repo = remoteRepo("remote_seeded");
    store.repos.set(repo.id, repo);
    const registry = createRepositorySourceAnalysisRegistry({
      store,
      getInstallationAuth: () => ({
        appId: "1",
        installationId: repo.installationId,
        privateKey: "fake",
      }),
      fetchRepositoryFiles: async (input) => {
        expect(input.owner).toBe("remote");
        expect(input.repo).toBe("seeded");
        expect(input.ref).toBe("feature/base");
        return {
          files: [
            {
              path: "package.json",
              content: JSON.stringify({ dependencies: { next: "latest" } }),
            },
          ],
        };
      },
    });

    const ensured = await registry.ensureProfile({
      repoId: repo.id,
      ref: "feature/base",
    });

    expect(ensured.ok).toBe(true);
    if (!ensured.ok) {
      return;
    }
    expect(ensured.created).toBe(true);
    expect(ensured.run?.status).toBe("succeeded");
    expect(ensured.profile.frameworks).toContain("next");
    expect(store.repoFiles.get(repo.id)?.[0]?.path).toBe("package.json");
  });
});

async function createGitRepository(
  name: string,
  input: { branch: string; files: Record<string, string> },
): Promise<string> {
  const parent = await mkdtemp(path.join(tmpdir(), "rsa-repo-"));
  const repoRoot = path.join(parent, name);
  await mkdir(repoRoot, { recursive: true });
  await execFileAsync("git", ["init", "-b", input.branch], { cwd: repoRoot });
  for (const [repoPath, content] of Object.entries(input.files)) {
    const destination = path.join(repoRoot, repoPath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf8");
  }
  await execFileAsync("git", ["add", "."], { cwd: repoRoot });
  await execFileAsync(
    "git",
    [
      "-c",
      "user.email=test@example.com",
      "-c",
      "user.name=Open Maintainer",
      "commit",
      "-m",
      "Initial commit",
    ],
    { cwd: repoRoot },
  );
  return repoRoot;
}

function remoteRepo(id: string): Repo {
  return {
    id,
    installationId: "installation_remote",
    owner: "remote",
    name: id.replace("remote_", ""),
    fullName: `remote/${id.replace("remote_", "")}`,
    defaultBranch: "main",
    private: false,
    permissions: { contents: true, metadata: true, pull_requests: true },
  };
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, key);
    return;
  }
  process.env[key] = value;
}
