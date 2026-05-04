import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import {
  type AnalyzeRepoInput,
  type AnalyzerFile,
  type ScanRepositoryOptions,
  analyzeRepo,
  createRepositoryProfiler,
  scanRepository,
} from "@open-maintainer/analyzer";
import type { RepoProfile } from "@open-maintainer/shared";

const execFileAsync = promisify(execFile);

type CliRepositoryScanOptions = Pick<
  ScanRepositoryOptions,
  "maxFiles" | "maxBytesPerFile"
>;

const defaultScanOptions = {
  maxFiles: 800,
} satisfies CliRepositoryScanOptions;

export interface CliRepositoryWorkspace {
  profile(repoRoot: string): Promise<RepoProfile>;
  profile(input: CliRepositoryProfileInput): Promise<RepoProfile>;
  scan(
    repoRoot: string,
    options?: CliRepositoryScanOptions,
  ): Promise<AnalyzerFile[]>;
  defaultBranch(repoRoot: string): Promise<string | null>;
}

export type CliRepositoryProfileInput = {
  repoRoot: string;
  files?: readonly AnalyzerFile[];
  scan?: CliRepositoryScanOptions;
  repoId?: string;
  version?: number;
};

export type CliRepositoryWorkspaceDeps = {
  scanRepository(
    repoRoot: string,
    options?: CliRepositoryScanOptions,
  ): Promise<AnalyzerFile[]>;
  analyzeRepo(input: AnalyzeRepoInput): RepoProfile;
  gitOutput(repoRoot: string, args: readonly string[]): Promise<string | null>;
};

export function createCliRepositoryWorkspace(
  deps: Partial<CliRepositoryWorkspaceDeps> = {},
): CliRepositoryWorkspace {
  const resolved: CliRepositoryWorkspaceDeps = {
    scanRepository: deps.scanRepository ?? scanRepository,
    analyzeRepo: deps.analyzeRepo ?? analyzeRepo,
    gitOutput: deps.gitOutput ?? defaultGitOutput,
  };
  const profiler = createRepositoryProfiler({
    scanRepository: resolved.scanRepository,
    analyzeRepo: resolved.analyzeRepo,
    resolveIdentity(repoRoot) {
      return resolveRepoIdentity(repoRoot, resolved.gitOutput);
    },
  });

  async function scan(
    repoRoot: string,
    options?: CliRepositoryScanOptions,
  ): Promise<AnalyzerFile[]> {
    return resolved.scanRepository(repoRoot, {
      ...defaultScanOptions,
      ...options,
    });
  }

  async function profile(repoRoot: string): Promise<RepoProfile>;
  async function profile(
    input: CliRepositoryProfileInput,
  ): Promise<RepoProfile>;
  async function profile(
    input: string | CliRepositoryProfileInput,
  ): Promise<RepoProfile> {
    const profileInput =
      typeof input === "string" ? { repoRoot: input } : input;
    const repoId = profileInput.repoId ?? "local";
    const version = profileInput.version ?? 1;
    if (profileInput.files) {
      const identity = await resolveRepoIdentity(
        profileInput.repoRoot,
        resolved.gitOutput,
      );
      const result = await profiler.prepare({
        files: profileInput.files,
        identity: {
          repoId,
          version,
          ...identity,
        },
      });
      return result.profile;
    }

    const result = await profiler.prepare({
      repoRoot: profileInput.repoRoot,
      identity: {
        repoId,
        version,
      },
      scan: {
        ...defaultScanOptions,
        ...profileInput.scan,
      },
    });
    return result.profile;
  }

  return {
    profile,
    scan,
    defaultBranch(repoRoot) {
      return detectDefaultBranch(repoRoot, resolved.gitOutput);
    },
  };
}

async function resolveRepoIdentity(
  repoRoot: string,
  gitOutput: CliRepositoryWorkspaceDeps["gitOutput"],
): Promise<{
  owner: string;
  name: string;
  defaultBranch: string;
}> {
  const fallback = {
    owner: path.basename(path.dirname(repoRoot)) || "local",
    name: path.basename(repoRoot),
    defaultBranch: "main",
  };
  const [remoteUrl, defaultBranch] = await Promise.all([
    safeGitOutput(gitOutput, repoRoot, ["remote", "get-url", "origin"]),
    detectDefaultBranch(repoRoot, gitOutput),
  ]);
  const remoteIdentity = remoteUrl ? parseGitHubRemote(remoteUrl) : null;
  return {
    owner: remoteIdentity?.owner ?? fallback.owner,
    name: remoteIdentity?.name ?? fallback.name,
    defaultBranch: defaultBranch ?? fallback.defaultBranch,
  };
}

async function detectDefaultBranch(
  repoRoot: string,
  gitOutput: CliRepositoryWorkspaceDeps["gitOutput"],
): Promise<string | null> {
  const symbolicRef = await safeGitOutput(gitOutput, repoRoot, [
    "symbolic-ref",
    "--short",
    "refs/remotes/origin/HEAD",
  ]);
  if (symbolicRef?.startsWith("origin/")) {
    return symbolicRef.slice("origin/".length);
  }
  return null;
}

async function safeGitOutput(
  gitOutput: CliRepositoryWorkspaceDeps["gitOutput"],
  repoRoot: string,
  args: readonly string[],
): Promise<string | null> {
  try {
    return await gitOutput(repoRoot, args);
  } catch {
    return null;
  }
}

async function defaultGitOutput(
  repoRoot: string,
  args: readonly string[],
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoRoot, ...args]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function parseGitHubRemote(
  remoteUrl: string,
): { owner: string; name: string } | null {
  const normalized = remoteUrl.trim().replace(/\.git$/, "");
  const sshMatch = /^git@[^:]+:([^/]+)\/(.+)$/.exec(normalized);
  if (sshMatch?.[1] && sshMatch[2]) {
    return { owner: sshMatch[1], name: sshMatch[2] };
  }
  try {
    const url = new URL(normalized);
    const [owner, name] = url.pathname.replace(/^\/+/, "").split("/");
    return owner && name ? { owner, name } : null;
  } catch {
    return null;
  }
}
