import { createHmac, timingSafeEqual } from "node:crypto";
import type {
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
        `| ${artifact.type} | v${artifact.version} | profile v${artifact.sourceProfileVersion} |`,
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
    "| Artifact | Version | Source |",
    "| --- | --- | --- |",
    artifactRows,
    "",
    "This PR only writes the MVP default context files: `AGENTS.md` and `.open-maintainer.yml`.",
    "` .open-maintainer.yml` is maintainer-editable before merge and becomes the repo-local source of truth after approval.",
  ]
    .join("\n")
    .replace("` .open-maintainer.yml`", "`.open-maintainer.yml`");
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
