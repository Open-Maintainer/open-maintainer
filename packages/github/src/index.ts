import { createHmac, timingSafeEqual } from "node:crypto";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import type {
  ArtifactType,
  ContextPr,
  GeneratedArtifact,
  Installation,
  Repo,
} from "@open-maintainer/shared";
import { newId, nowIso } from "@open-maintainer/shared";

export type GitHubInstallationEvent = {
  installation: {
    id: number;
    account: { login: string; type: string } | null;
    repository_selection: string;
    permissions?: Record<string, string>;
  };
  repositories?: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    default_branch?: string;
    permissions?: Record<string, boolean>;
  }>;
};

export type GitHubAppInstallationAuth = {
  appId: string | number;
  privateKey: string;
  installationId: string | number;
};

type GitHubFileContent = {
  type?: string;
  encoding?: string;
  content?: string;
  size?: number;
  sha?: string;
  path?: string;
};

type GitHubContentData = GitHubFileContent | GitHubFileContent[];

export type GitHubRepositoryClient = {
  repos: {
    getContent(input: {
      owner: string;
      repo: string;
      path: string;
      ref?: string;
    }): Promise<{ data: GitHubContentData }>;
    createOrUpdateFileContents(input: {
      owner: string;
      repo: string;
      path: string;
      message: string;
      content: string;
      branch: string;
      sha?: string;
    }): Promise<{ data: { commit?: { sha?: string } } }>;
  };
  git: {
    getRef(input: {
      owner: string;
      repo: string;
      ref: string;
    }): Promise<{ data: { object: { sha: string } } }>;
    createRef(input: {
      owner: string;
      repo: string;
      ref: string;
      sha: string;
    }): Promise<unknown>;
    updateRef(input: {
      owner: string;
      repo: string;
      ref: string;
      sha: string;
      force: boolean;
    }): Promise<unknown>;
    getTree?(input: {
      owner: string;
      repo: string;
      tree_sha: string;
      recursive?: "true";
    }): Promise<{
      data: {
        tree: Array<{
          path?: string;
          type?: string;
          size?: number;
        }>;
      };
    }>;
  };
  pulls: {
    list(input: {
      owner: string;
      repo: string;
      state: "open";
      head: string;
      base: string;
    }): Promise<{ data: Array<{ number: number; html_url: string }> }>;
    create(input: {
      owner: string;
      repo: string;
      title: string;
      head: string;
      base: string;
      body: string;
    }): Promise<{ data: { number: number; html_url: string } }>;
    update(input: {
      owner: string;
      repo: string;
      pull_number: number;
      title: string;
      body: string;
    }): Promise<{ data: { number: number; html_url: string } }>;
  };
};

export type RepositoryContentLimits = {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
};

export type FetchedRepositoryFile = {
  path: string;
  content: string;
  size: number;
  sha: string | null;
};

export type SkippedRepositoryFile = {
  path: string;
  reason:
    | "filtered"
    | "max_files"
    | "max_file_bytes"
    | "max_total_bytes"
    | "not_file"
    | "not_found";
};

export const DEFAULT_REPOSITORY_CONTENT_LIMITS: RepositoryContentLimits = {
  maxFiles: 80,
  maxFileBytes: 128 * 1024,
  maxTotalBytes: 768 * 1024,
};

const SKIPPED_PATH_SEGMENTS = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
]);

const SKIPPED_EXTENSIONS = new Set([
  ".7z",
  ".avif",
  ".bin",
  ".bmp",
  ".class",
  ".dll",
  ".dmg",
  ".exe",
  ".gif",
  ".gz",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp4",
  ".pdf",
  ".png",
  ".so",
  ".tar",
  ".tgz",
  ".wasm",
  ".webp",
  ".zip",
]);

export function createGitHubInstallationClient(
  auth: GitHubAppInstallationAuth,
): GitHubRepositoryClient {
  return new Octokit({
    authStrategy: createAppAuth,
    auth,
  }) as GitHubRepositoryClient;
}

function resolveGitHubClient(input: {
  client?: GitHubRepositoryClient;
  auth?: GitHubAppInstallationAuth;
}): GitHubRepositoryClient {
  if (input.client) {
    return input.client;
  }
  if (input.auth) {
    return createGitHubInstallationClient(input.auth);
  }
  throw new Error(
    "Provide either a GitHub client or GitHub App installation auth.",
  );
}

export function verifyWebhookSignature(options: {
  secret: string;
  payload: string;
  signature256: string;
}): boolean {
  const expected = `sha256=${createHmac("sha256", options.secret).update(options.payload).digest("hex")}`;
  const actual = options.signature256;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

export function mapInstallationEvent(event: GitHubInstallationEvent): {
  installation: Installation;
  repos: Repo[];
} {
  const accountLogin = event.installation.account?.login ?? "unknown";
  const installation: Installation = {
    id: String(event.installation.id),
    accountLogin,
    accountType: event.installation.account?.type ?? "Unknown",
    repositorySelection: event.installation.repository_selection,
    permissions: event.installation.permissions ?? {},
    createdAt: nowIso(),
  };

  const repos = (event.repositories ?? []).map((repo) => {
    const [owner = accountLogin, name = repo.name] = repo.full_name.split("/");
    return {
      id: String(repo.id),
      installationId: installation.id,
      owner,
      name,
      fullName: repo.full_name,
      defaultBranch: repo.default_branch ?? "main",
      private: repo.private,
      permissions: repo.permissions ?? {},
    };
  });

  return { installation, repos };
}

export function shouldSkipRepositoryPath(path: string): boolean {
  const normalizedPath = path.replace(/^\/+/, "");
  const segments = normalizedPath
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());
  const fileName = segments.at(-1)?.toLowerCase() ?? "";
  const lowerPath = normalizedPath.toLowerCase();
  const extension = fileName.includes(".")
    ? `.${fileName.split(".").at(-1) ?? ""}`
    : "";

  return (
    segments.some((segment) => SKIPPED_PATH_SEGMENTS.has(segment)) ||
    SKIPPED_EXTENSIONS.has(extension) ||
    lowerPath.endsWith(".min.js") ||
    lowerPath.endsWith(".min.css")
  );
}

export const DEFAULT_REPOSITORY_ANALYSIS_PATHS = [
  "README.md",
  "CONTRIBUTING.md",
  "AGENTS.md",
  "package.json",
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "tsconfig.json",
  "biome.json",
  "docker-compose.yml",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
  "Scarb.toml",
  ".github/copilot-instructions.md",
  ".github/workflows/ci.yml",
  ".github/workflows/test.yml",
  ".github/workflows/build.yml",
  ".open-maintainer.yml",
  ".open-maintainer/profile.json",
  ".open-maintainer/report.md",
];

export async function listRepositoryTreePaths(input: {
  owner: string;
  repo: string;
  ref: string;
  client?: GitHubRepositoryClient;
  auth?: GitHubAppInstallationAuth;
}): Promise<string[]> {
  const client = resolveGitHubClient(input);
  if (!client.git.getTree) {
    return DEFAULT_REPOSITORY_ANALYSIS_PATHS;
  }
  const tree = await client.git.getTree({
    owner: input.owner,
    repo: input.repo,
    tree_sha: input.ref,
    recursive: "true",
  });
  const paths = tree.data.tree
    .filter((item) => item.type === "blob" && item.path)
    .map((item) => item.path as string)
    .filter((repoPath) => !shouldSkipRepositoryPath(repoPath));
  return paths.length > 0 ? paths : DEFAULT_REPOSITORY_ANALYSIS_PATHS;
}

export async function fetchRepositoryFilesForAnalysis(input: {
  owner: string;
  repo: string;
  ref: string;
  limits?: Partial<RepositoryContentLimits>;
  client?: GitHubRepositoryClient;
  auth?: GitHubAppInstallationAuth;
}): Promise<{
  files: FetchedRepositoryFile[];
  skipped: SkippedRepositoryFile[];
}> {
  const client = resolveGitHubClient(input);
  const paths = await listRepositoryTreePaths({
    owner: input.owner,
    repo: input.repo,
    ref: input.ref,
    client,
  });
  return fetchRepositoryContents({
    owner: input.owner,
    repo: input.repo,
    ref: input.ref,
    paths,
    client,
    ...(input.limits ? { limits: input.limits } : {}),
  });
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 404
  );
}

function getContentFile(data: GitHubContentData): GitHubFileContent | null {
  if (Array.isArray(data)) {
    return null;
  }
  if (data.type && data.type !== "file") {
    return null;
  }
  return data;
}

function decodeGitHubContent(file: GitHubFileContent): string | null {
  if (!file.content || file.encoding !== "base64") {
    return null;
  }
  return Buffer.from(file.content.replace(/\s/g, ""), "base64").toString(
    "utf8",
  );
}

export async function fetchRepositoryContents(input: {
  owner: string;
  repo: string;
  ref?: string;
  paths: string[];
  limits?: Partial<RepositoryContentLimits>;
  client?: GitHubRepositoryClient;
  auth?: GitHubAppInstallationAuth;
}): Promise<{
  files: FetchedRepositoryFile[];
  skipped: SkippedRepositoryFile[];
}> {
  const client = resolveGitHubClient(input);
  const limits = {
    ...DEFAULT_REPOSITORY_CONTENT_LIMITS,
    ...input.limits,
  };
  const files: FetchedRepositoryFile[] = [];
  const skipped: SkippedRepositoryFile[] = [];
  const seenPaths = new Set<string>();
  let totalBytes = 0;

  for (const path of input.paths) {
    const normalizedPath = path.replace(/^\/+/, "");
    if (!normalizedPath || seenPaths.has(normalizedPath)) {
      continue;
    }
    seenPaths.add(normalizedPath);

    if (shouldSkipRepositoryPath(normalizedPath)) {
      skipped.push({ path: normalizedPath, reason: "filtered" });
      continue;
    }
    if (files.length >= limits.maxFiles) {
      skipped.push({ path: normalizedPath, reason: "max_files" });
      continue;
    }

    try {
      const response = await client.repos.getContent({
        owner: input.owner,
        repo: input.repo,
        path: normalizedPath,
        ...(input.ref ? { ref: input.ref } : {}),
      });
      const file = getContentFile(response.data);
      const content = file ? decodeGitHubContent(file) : null;
      if (!file || content === null) {
        skipped.push({ path: normalizedPath, reason: "not_file" });
        continue;
      }

      const size = file.size ?? Buffer.byteLength(content, "utf8");
      if (size > limits.maxFileBytes) {
        skipped.push({ path: normalizedPath, reason: "max_file_bytes" });
        continue;
      }
      if (totalBytes + size > limits.maxTotalBytes) {
        skipped.push({ path: normalizedPath, reason: "max_total_bytes" });
        continue;
      }

      totalBytes += size;
      files.push({
        path: normalizedPath,
        content,
        size,
        sha: file.sha ?? null,
      });
    } catch (error) {
      if (isNotFoundError(error)) {
        skipped.push({ path: normalizedPath, reason: "not_found" });
        continue;
      }
      throw error;
    }
  }

  return { files, skipped };
}

export function createContextBranchName(
  profileVersion: number,
  attempt = 0,
): string {
  const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
  return `open-maintainer/context-${profileVersion}${suffix}`;
}

export function renderContextPrBody(input: {
  repoProfileVersion: number;
  artifacts: GeneratedArtifact[];
  modelProvider: string | null;
  model: string | null;
  runReference: string;
  generatedAt: string;
}): string {
  const artifactRows = input.artifacts
    .map(
      (artifact) =>
        `| ${artifact.type} | profile v${artifact.sourceProfileVersion} |`,
    )
    .join("\n");
  const modelLine =
    input.modelProvider && input.model
      ? `${input.modelProvider} / ${input.model}`
      : "No external model metadata recorded";

  return [
    "## Open Maintainer Context Update",
    "",
    `Repo profile version: v${input.repoProfileVersion}`,
    `Generated at: ${input.generatedAt}`,
    `Dashboard run: ${input.runReference}`,
    `Model: ${modelLine}`,
    "",
    "| Artifact | Source |",
    "| --- | --- |",
    artifactRows,
    "",
    "This PR writes generated Open Maintainer context artifacts for review.",
    "`.open-maintainer.yml` is maintainer-editable before merge and becomes the repo-local source of truth after approval.",
  ].join("\n");
}

export function createMockContextPr(input: {
  repoId: string;
  profileVersion: number;
  artifacts: GeneratedArtifact[];
}): ContextPr {
  const branchName = createContextBranchName(input.profileVersion);
  return {
    id: newId("context_pr"),
    repoId: input.repoId,
    branchName,
    commitSha: `mock-${input.profileVersion}`,
    prNumber: input.profileVersion,
    prUrl: `https://github.com/mock/repo/pull/${input.profileVersion}`,
    artifactVersions: input.artifacts.map((artifact) => artifact.version),
    status: "succeeded",
    createdAt: nowIso(),
  };
}

function contextArtifactPath(type: ArtifactType): string | null {
  if (type === "AGENTS.md" || type === ".open-maintainer.yml") {
    return type;
  }
  return null;
}

async function getExistingFileSha(input: {
  client: GitHubRepositoryClient;
  owner: string;
  repo: string;
  branchName: string;
  path: string;
}): Promise<{ sha: string; content: string } | undefined> {
  try {
    const response = await input.client.repos.getContent({
      owner: input.owner,
      repo: input.repo,
      path: input.path,
      ref: input.branchName,
    });
    const file = getContentFile(response.data);
    if (!file?.sha) {
      return undefined;
    }
    return {
      sha: file.sha,
      content: decodeGitHubContent(file) ?? file.content ?? "",
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined;
    }
    throw error;
  }
}

export async function createContextPr(input: {
  repoId: string;
  owner: string;
  repo: string;
  defaultBranch: string;
  profileVersion: number;
  artifacts: GeneratedArtifact[];
  repoProfileVersion?: number;
  modelProvider?: string | null;
  model?: string | null;
  runReference?: string;
  generatedAt?: string;
  mock?: boolean;
  client?: GitHubRepositoryClient;
  auth?: GitHubAppInstallationAuth;
}): Promise<ContextPr> {
  if (input.mock) {
    return createMockContextPr({
      repoId: input.repoId,
      profileVersion: input.profileVersion,
      artifacts: input.artifacts,
    });
  }

  const client = resolveGitHubClient(input);
  const branchName = createContextBranchName(input.profileVersion);
  const writableArtifacts = input.artifacts.flatMap((artifact) => {
    const path = contextArtifactPath(artifact.type);
    return path ? [{ artifact, path }] : [];
  });

  if (writableArtifacts.length === 0) {
    throw new Error("No context artifact files were provided.");
  }

  const baseRef = await client.git.getRef({
    owner: input.owner,
    repo: input.repo,
    ref: `heads/${input.defaultBranch}`,
  });
  const baseSha = baseRef.data.object.sha;

  try {
    await client.git.getRef({
      owner: input.owner,
      repo: input.repo,
      ref: `heads/${branchName}`,
    });
    await client.git.updateRef({
      owner: input.owner,
      repo: input.repo,
      ref: `heads/${branchName}`,
      sha: baseSha,
      force: true,
    });
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
    await client.git.createRef({
      owner: input.owner,
      repo: input.repo,
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    });
  }

  let commitSha: string | null = null;
  const writtenArtifacts: typeof writableArtifacts = [];
  for (const { artifact, path } of writableArtifacts) {
    const existingFile = await getExistingFileSha({
      client,
      owner: input.owner,
      repo: input.repo,
      branchName,
      path,
    });
    if (existingFile && !isOpenMaintainerGeneratedFile(existingFile.content)) {
      continue;
    }
    const writeInput = {
      owner: input.owner,
      repo: input.repo,
      path,
      message: `Update Open Maintainer context ${path}`,
      content: Buffer.from(artifact.content, "utf8").toString("base64"),
      branch: branchName,
      ...(existingFile ? { sha: existingFile.sha } : {}),
    };
    const writeResponse =
      await client.repos.createOrUpdateFileContents(writeInput);
    commitSha = writeResponse.data.commit?.sha ?? commitSha;
    writtenArtifacts.push({ artifact, path });
  }
  if (writtenArtifacts.length === 0) {
    throw new Error(
      "No context artifact files were written because existing files are preserved by default.",
    );
  }

  const modelProvider =
    input.modelProvider ?? writtenArtifacts[0]?.artifact.modelProvider ?? null;
  const model = input.model ?? writtenArtifacts[0]?.artifact.model ?? null;
  const body = renderContextPrBody({
    repoProfileVersion: input.repoProfileVersion ?? input.profileVersion,
    artifacts: writtenArtifacts.map(({ artifact }) => artifact),
    modelProvider,
    model,
    runReference: input.runReference ?? `context-pr:${input.repoId}`,
    generatedAt: input.generatedAt ?? nowIso(),
  });
  const title = `Update Open Maintainer context v${input.profileVersion}`;
  const existingPulls = await client.pulls.list({
    owner: input.owner,
    repo: input.repo,
    state: "open",
    head: `${input.owner}:${branchName}`,
    base: input.defaultBranch,
  });
  const existingPull = existingPulls.data[0];
  const pull = existingPull
    ? await client.pulls.update({
        owner: input.owner,
        repo: input.repo,
        pull_number: existingPull.number,
        title,
        body,
      })
    : await client.pulls.create({
        owner: input.owner,
        repo: input.repo,
        title,
        head: branchName,
        base: input.defaultBranch,
        body,
      });

  return {
    id: newId("context_pr"),
    repoId: input.repoId,
    branchName,
    commitSha,
    prNumber: pull.data.number,
    prUrl: pull.data.html_url,
    artifactVersions: writtenArtifacts.map(({ artifact }) => artifact.version),
    status: "succeeded",
    createdAt: nowIso(),
  };
}

function isOpenMaintainerGeneratedFile(content: string): boolean {
  return (
    content.includes("generated by open-maintainer") ||
    content.includes("by: open-maintainer") ||
    content.includes('"openMaintainerProfileHash"') ||
    content.includes("# Open Maintainer Readiness Report") ||
    content.includes("# Open Maintainer Report:")
  );
}
