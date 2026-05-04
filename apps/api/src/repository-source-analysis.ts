import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  prepareRepositoryProfile,
  scanRepository,
} from "@open-maintainer/analyzer";
import type { MemoryStore } from "@open-maintainer/db";
import {
  type GitHubAppInstallationAuth,
  fetchRepositoryFilesForAnalysis,
} from "@open-maintainer/github";
import type {
  Installation,
  Repo,
  RepoProfile,
  RunRecord,
} from "@open-maintainer/shared";
import { nowIso } from "@open-maintainer/shared";

export type RepositoryFile = {
  path: string;
  content: string;
};

export type RegisterRepositorySourceInput =
  | {
      kind: "local-worktree";
      repoRoot: string;
      owner?: string;
      name?: string;
    }
  | {
      kind: "uploaded-files";
      name?: string;
      files: RepositoryFile[];
    };

export type RepositorySourceAnalysisError = {
  statusCode: 404 | 409 | 422;
  code:
    | "UNKNOWN_REPO"
    | "NO_PROFILE"
    | "NO_READABLE_FILES"
    | "REPOSITORY_FILES_UNAVAILABLE"
    | "WORKTREE_UNAVAILABLE";
  message: string;
  run?: RunRecord;
};

export type RepositorySourceAnalysisResult<T> =
  | ({ ok: true } & T)
  | ({ ok: false } & RepositorySourceAnalysisError);

export type RepositoryAnalysisWorkspace = {
  repo: Repo;
  files: RepositoryFile[];
  profile: RepoProfile;
  profileCreated: boolean;
  run?: RunRecord;
  worktreeRoot: string | null;
};

export type RepositoryGenerationWorkspace = RepositoryAnalysisWorkspace;

export type RepositoryReviewWorkspace = RepositoryAnalysisWorkspace;

export type RepositoryContextPrWorkspace = RepositoryAnalysisWorkspace;

export interface RepositoryOperations {
  registerSource(input: RegisterRepositorySourceInput): Promise<
    RepositorySourceAnalysisResult<{
      repo: Repo;
      fileCount: number;
      source:
        | "local-worktree"
        | "uploaded-files"
        | "uploaded-files-mounted-worktree";
      worktreeRoot: string | null;
    }>
  >;

  prepareAnalysis(input: {
    repoId: string;
    ref?: string;
    profilePolicy: "reuse" | "refresh";
    createdRunMessage?: string;
  }): Promise<RepositorySourceAnalysisResult<RepositoryAnalysisWorkspace>>;

  prepareGeneration(input: {
    repoId: string;
  }): Promise<RepositorySourceAnalysisResult<RepositoryGenerationWorkspace>>;

  prepareReview(input: {
    repoId: string;
    ref?: string;
    baseRef?: string;
    headRef?: string;
    prNumber?: number;
  }): Promise<RepositorySourceAnalysisResult<RepositoryReviewWorkspace>>;

  prepareContextPr(input: {
    repoId: string;
    requireWritableWorktree?: boolean;
  }): Promise<RepositorySourceAnalysisResult<RepositoryContextPrWorkspace>>;
}

export interface RepositorySourceAnalysisRegistry extends RepositoryOperations {
  analyzeRepository(input: {
    repoId: string;
    ref?: string;
  }): Promise<
    RepositorySourceAnalysisResult<{
      repo: Repo;
      run: RunRecord;
      profile: RepoProfile;
    }>
  >;

  ensureProfile(input: {
    repoId: string;
    ref?: string;
    createdRunMessage?: string;
  }): Promise<
    RepositorySourceAnalysisResult<{
      repo: Repo;
      profile: RepoProfile;
      created: boolean;
      run?: RunRecord;
    }>
  >;
}

type RepositoryFilesFetcher = (input: {
  owner: string;
  repo: string;
  ref: string;
  auth?: GitHubAppInstallationAuth;
}) => Promise<{ files: RepositoryFile[] }>;

type RegistryOptions = {
  store: MemoryStore;
  state?: RepositorySourceStorePort;
  fetchRepositoryFiles?: RepositoryFilesFetcher;
  getInstallationAuth?: (
    installationId: string,
  ) => GitHubAppInstallationAuth | null;
};

export type RepositorySourceStorePort = {
  repo(repoId: string): Repo | null;
  files(repoId: string): RepositoryFile[];
  saveFiles(repoId: string, files: RepositoryFile[]): void;
  worktreeRoot(repoId: string): string | null;
  saveWorktreeRoot(repoId: string, worktreeRoot: string | null): void;
  latestProfile(repoId: string): RepoProfile | null;
  profileCount(repoId: string): number;
  addProfile(profile: RepoProfile): void;
  recordRun(
    input: Omit<RunRecord, "id" | "createdAt" | "updatedAt">,
  ): RunRecord;
  updateRun(id: string, patch: Partial<RunRecord>): RunRecord;
  saveRegisteredRepository(input: {
    repo: Repo;
    installation: Installation;
    files: RepositoryFile[];
    worktreeRoot: string | null;
  }): void;
  clearDerivedRepositoryState(repoId: string): void;
};

const execFileAsync = promisify(execFile);
const maxRepositoryFiles = 800;

export function createRepositoryOperations(
  options: RegistryOptions,
): RepositorySourceAnalysisRegistry {
  const state =
    options.state ?? repositorySourceStoreFromMemoryStore(options.store);
  const fetchRepositoryFiles =
    options.fetchRepositoryFiles ?? defaultRepositoryFilesFetcher;
  const getInstallationAuth = options.getInstallationAuth ?? (() => null);

  async function registerSource(input: RegisterRepositorySourceInput) {
    if (input.kind === "local-worktree") {
      const repoRoot = path.resolve(input.repoRoot);
      const files = await scanRepository(repoRoot, {
        maxFiles: maxRepositoryFiles,
      });
      if (files.length === 0) {
        return noReadableFiles(
          "No readable repository files were found at the selected path.",
        );
      }

      const owner =
        (input.owner ?? path.basename(path.dirname(repoRoot))) || "local";
      const name = (input.name ?? path.basename(repoRoot)) || "repository";
      const repo = await registerLocalRepository({
        owner,
        name,
        files,
        worktreeRoot: repoRoot,
        defaultBranch: await detectLocalDefaultBranch(repoRoot),
      });

      return {
        ok: true as const,
        repo,
        fileCount: files.length,
        source: "local-worktree" as const,
        worktreeRoot: repoRoot,
      };
    }

    const files = input.files.flatMap((file) => {
      const normalizedPath = normalizeUploadedPath(file.path);
      return normalizedPath ? [{ ...file, path: normalizedPath }] : [];
    });
    if (files.length === 0) {
      return noReadableFiles(
        "No readable repository files were provided by the selected directory.",
      );
    }

    const repoName = input.name ?? "uploaded-repo";
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
    const repo = await registerLocalRepository({
      owner: "local",
      name: repoName,
      files: mountedWorktree?.files ?? files,
      id: pendingRepo.id,
      worktreeRoot,
      ...(mountedWorktree
        ? { defaultBranch: mountedWorktree.defaultBranch }
        : {}),
    });

    return {
      ok: true as const,
      repo,
      fileCount: files.length,
      source: mountedWorktree
        ? ("uploaded-files-mounted-worktree" as const)
        : ("uploaded-files" as const),
      worktreeRoot,
    };
  }

  async function analyzeRepository(input: { repoId: string; ref?: string }) {
    const result = await prepareAnalysis({
      repoId: input.repoId,
      ...(input.ref ? { ref: input.ref } : {}),
      profilePolicy: "refresh",
    });
    if (!result.ok) {
      return result;
    }
    return {
      ok: true as const,
      repo: result.repo,
      run: result.run as RunRecord,
      profile: result.profile,
    };
  }

  async function ensureProfile(input: {
    repoId: string;
    ref?: string;
    createdRunMessage?: string;
  }) {
    const result = await prepareAnalysis({
      repoId: input.repoId,
      ...(input.ref ? { ref: input.ref } : {}),
      profilePolicy: "reuse",
      ...(input.createdRunMessage
        ? { createdRunMessage: input.createdRunMessage }
        : {}),
    });
    if (!result.ok) {
      return result;
    }
    return {
      ok: true as const,
      repo: result.repo,
      profile: result.profile,
      created: result.profileCreated,
      ...(result.run ? { run: result.run } : {}),
    };
  }

  async function prepareAnalysis(input: {
    repoId: string;
    ref?: string;
    profilePolicy: "reuse" | "refresh";
    createdRunMessage?: string;
  }): Promise<RepositorySourceAnalysisResult<RepositoryAnalysisWorkspace>> {
    const repo = state.repo(input.repoId);
    if (!repo) {
      return unknownRepo();
    }

    const existingProfile = state.latestProfile(input.repoId);
    const shouldCreateProfile =
      input.profilePolicy === "refresh" || !existingProfile;
    const run = shouldCreateProfile
      ? state.recordRun({
          repoId: input.repoId,
          type: "analysis",
          status: "running",
          inputSummary: `Analyze ${repo.fullName}`,
          safeMessage: null,
          artifactVersions: [],
          repoProfileVersion: null,
          provider: null,
          model: null,
          externalId: null,
        })
      : undefined;
    const filesResult = await repositoryFilesForAnalysis({
      repo,
      repoId: input.repoId,
      ...(input.ref ? { ref: input.ref } : {}),
    });
    if (!filesResult.ok) {
      const failedRun = run
        ? state.updateRun(run.id, {
            status: "failed",
            safeMessage: filesResult.message,
          })
        : undefined;
      return {
        ...filesResult,
        ...(failedRun ? { run: failedRun } : {}),
      };
    }

    const profile = shouldCreateProfile
      ? await createProfile({
          repo,
          repoId: input.repoId,
          files: filesResult.files,
        })
      : existingProfile;
    const updatedRun = run
      ? state.updateRun(run.id, {
          status: "succeeded",
          repoProfileVersion: profile.version,
          safeMessage:
            input.createdRunMessage ?? "Repository profile generated.",
        })
      : undefined;
    return {
      ok: true as const,
      repo,
      files: filesResult.files,
      profile,
      profileCreated: shouldCreateProfile,
      ...(updatedRun ? { run: updatedRun } : {}),
      worktreeRoot: state.worktreeRoot(input.repoId),
    };
  }

  async function prepareGeneration(input: {
    repoId: string;
  }): Promise<RepositorySourceAnalysisResult<RepositoryGenerationWorkspace>> {
    return existingProfileWorkspace({
      repoId: input.repoId,
      missingProfileMessage:
        "Generate a repo profile before context artifacts.",
    });
  }

  async function prepareReview(input: {
    repoId: string;
    ref?: string;
    baseRef?: string;
    headRef?: string;
    prNumber?: number;
  }): Promise<RepositorySourceAnalysisResult<RepositoryReviewWorkspace>> {
    return prepareAnalysis({
      repoId: input.repoId,
      ...((input.ref ?? input.baseRef)
        ? { ref: input.ref ?? input.baseRef }
        : {}),
      profilePolicy: "reuse",
      createdRunMessage: "Repository profile generated for PR review preview.",
    });
  }

  async function prepareContextPr(input: {
    repoId: string;
    requireWritableWorktree?: boolean;
  }): Promise<RepositorySourceAnalysisResult<RepositoryContextPrWorkspace>> {
    const workspace = await existingProfileWorkspace({
      repoId: input.repoId,
      missingProfileMessage: "No repo profile available.",
    });
    if (!workspace.ok) {
      return workspace;
    }
    if (input.requireWritableWorktree && !workspace.worktreeRoot) {
      return worktreeUnavailable();
    }
    return workspace;
  }

  async function existingProfileWorkspace(input: {
    repoId: string;
    missingProfileMessage: string;
  }): Promise<RepositorySourceAnalysisResult<RepositoryAnalysisWorkspace>> {
    const repo = state.repo(input.repoId);
    if (!repo) {
      return unknownRepo();
    }
    const profile = state.latestProfile(input.repoId);
    if (!profile) {
      return noProfile(input.missingProfileMessage);
    }
    const filesResult = await repositoryFilesForAnalysis({
      repo,
      repoId: input.repoId,
    });
    if (!filesResult.ok) {
      return filesResult;
    }
    return {
      ok: true as const,
      repo,
      files: filesResult.files,
      profile,
      profileCreated: false,
      worktreeRoot: state.worktreeRoot(input.repoId),
    };
  }

  async function repositoryFilesForAnalysis(input: {
    repoId: string;
    repo: Repo;
    ref?: string;
  }): Promise<
    | { ok: true; files: RepositoryFile[] }
    | {
        ok: false;
        statusCode: 409;
        code: "REPOSITORY_FILES_UNAVAILABLE";
        message: string;
      }
  > {
    const auth = getInstallationAuth(input.repo.installationId);
    if (!auth) {
      const files = state.files(input.repoId);
      if (files.length > 0) {
        return { ok: true, files };
      }
      return repositoryFilesUnavailable();
    }
    const fetched = await fetchRepositoryFiles({
      owner: input.repo.owner,
      repo: input.repo.name,
      ref: input.ref ?? input.repo.defaultBranch,
      auth,
    });
    const files = fetched.files.map((file) => ({
      path: file.path,
      content: file.content,
    }));
    state.saveFiles(input.repoId, files);
    return { ok: true, files };
  }

  async function createProfile(input: {
    repoId: string;
    repo: Repo;
    files: RepositoryFile[];
  }): Promise<RepoProfile> {
    const version = state.profileCount(input.repoId) + 1;
    const result = await prepareRepositoryProfile({
      files: input.files,
      identity: {
        repoId: input.repoId,
        owner: input.repo.owner,
        name: input.repo.name,
        defaultBranch: input.repo.defaultBranch,
        version,
      },
    });
    const profile = result.profile;
    state.addProfile(profile);
    return profile;
  }

  async function registerLocalRepository(input: {
    owner: string;
    name: string;
    files: RepositoryFile[];
    id?: string;
    worktreeRoot?: string;
    defaultBranch?: string;
  }): Promise<Repo> {
    const repo = localRepositoryRecord(input);

    state.saveRegisteredRepository({
      repo,
      installation: localInstallation(),
      files: input.files,
      worktreeRoot: input.worktreeRoot ?? null,
    });
    state.clearDerivedRepositoryState(repo.id);

    return repo;
  }

  return {
    registerSource,
    prepareAnalysis,
    prepareGeneration,
    prepareReview,
    prepareContextPr,
    analyzeRepository,
    ensureProfile,
  };
}

export const createRepositorySourceAnalysisRegistry =
  createRepositoryOperations;

export function repositorySourceStoreFromMemoryStore(
  store: MemoryStore,
): RepositorySourceStorePort {
  const saveWorktreeRoot = (repoId: string, worktreeRoot: string | null) => {
    if (worktreeRoot) {
      store.repoWorktrees.set(repoId, worktreeRoot);
    } else {
      store.repoWorktrees.delete(repoId);
    }
  };
  return {
    repo(repoId) {
      return store.repos.get(repoId) ?? null;
    },
    files(repoId) {
      return store.repoFiles.get(repoId) ?? [];
    },
    saveFiles(repoId, files) {
      store.repoFiles.set(repoId, files);
    },
    worktreeRoot(repoId) {
      return store.repoWorktrees.get(repoId) ?? null;
    },
    saveWorktreeRoot,
    latestProfile(repoId) {
      return store.latestProfile(repoId);
    },
    profileCount(repoId) {
      return store.profiles.get(repoId)?.length ?? 0;
    },
    addProfile(profile) {
      store.addProfile(profile);
    },
    recordRun(input) {
      return store.recordRun(input);
    },
    updateRun(id, patch) {
      return store.updateRun(id, patch);
    },
    saveRegisteredRepository(input) {
      store.installations.set(input.repo.installationId, input.installation);
      store.repos.set(input.repo.id, input.repo);
      store.repoFiles.set(input.repo.id, input.files);
      saveWorktreeRoot(input.repo.id, input.worktreeRoot);
    },
    clearDerivedRepositoryState(repoId) {
      store.profiles.delete(repoId);
      store.artifacts.delete(repoId);
    },
  };
}

async function defaultRepositoryFilesFetcher(input: {
  owner: string;
  repo: string;
  ref: string;
  auth?: GitHubAppInstallationAuth;
}): Promise<{ files: RepositoryFile[] }> {
  const fetched = await fetchRepositoryFilesForAnalysis(input);
  return {
    files: fetched.files.map((file) => ({
      path: file.path,
      content: file.content,
    })),
  };
}

function unknownRepo(): RepositorySourceAnalysisResult<never> {
  return {
    ok: false,
    statusCode: 404,
    code: "UNKNOWN_REPO",
    message: "Unknown repo.",
  };
}

function noProfile(message: string): RepositorySourceAnalysisResult<never> {
  return {
    ok: false,
    statusCode: 409,
    code: "NO_PROFILE",
    message,
  };
}

function noReadableFiles(
  message: string,
): RepositorySourceAnalysisResult<never> {
  return {
    ok: false,
    statusCode: 422,
    code: "NO_READABLE_FILES",
    message,
  };
}

function worktreeUnavailable(): RepositorySourceAnalysisResult<never> {
  return {
    ok: false,
    statusCode: 409,
    code: "WORKTREE_UNAVAILABLE",
    message:
      "A writable local repository worktree is required for this operation.",
  };
}

function repositoryFilesUnavailable(): {
  ok: false;
  statusCode: 409;
  code: "REPOSITORY_FILES_UNAVAILABLE";
  message: string;
} {
  return {
    ok: false,
    statusCode: 409,
    code: "REPOSITORY_FILES_UNAVAILABLE",
    message:
      "Repository files are unavailable. Configure GitHub App credentials with contents read permission or seed local files for development.",
  };
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
  files: RepositoryFile[];
}): Promise<{
  worktreeRoot: string;
  files: RepositoryFile[];
  defaultBranch: string;
} | null> {
  for (const candidateRoot of mountedWorktreeCandidates()) {
    try {
      await requireGitRepository(candidateRoot);
      const candidateFiles = await scanRepository(candidateRoot, {
        maxFiles: maxRepositoryFiles,
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
  uploadedFiles: RepositoryFile[];
  candidateRoot: string;
  candidateFiles: RepositoryFile[];
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

function packageNameFromFiles(files: RepositoryFile[]): string | null {
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
  files: RepositoryFile[],
  filePath: string,
): string | null {
  return files.find((file) => file.path === filePath)?.content ?? null;
}

async function materializeRepositoryFiles(
  repoId: string,
  files: RepositoryFile[],
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

async function detectLocalDefaultBranch(repoRoot: string): Promise<string> {
  try {
    return (await runGit(repoRoot, ["symbolic-ref", "--short", "HEAD"])).trim();
  } catch {
    return "local";
  }
}

async function requireGitRepository(cwd: string): Promise<void> {
  try {
    await runGit(cwd, ["rev-parse", "--show-toplevel"]);
  } catch {
    throw new Error("Not a Git checkout.");
  }
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      process.env.OPEN_MAINTAINER_GIT_COMMAND ?? "git",
      args,
      {
        cwd,
        maxBuffer: 1024 * 1024,
        timeout: 120_000,
      },
    );
    return stdout;
  } catch {
    throw new Error(`git ${args.join(" ")} failed.`);
  }
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
