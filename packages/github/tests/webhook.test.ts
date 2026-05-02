import { createHmac } from "node:crypto";
import type { GeneratedArtifact } from "@open-maintainer/shared";
import { describe, expect, it } from "vitest";
import {
  type GitHubRepositoryClient,
  createContextBranchName,
  createContextPr,
  extractAcceptanceCriteria,
  extractLinkedIssueNumbers,
  fetchPullRequestReviewContext,
  fetchRepositoryContents,
  isOpenMaintainerReviewComment,
  mapInstallationEvent,
  renderContextPrBody,
  shouldSkipRepositoryPath,
  verifyWebhookSignature,
} from "../src";

function notFound(): Error & { status: number } {
  return Object.assign(new Error("not found"), { status: 404 });
}

function artifact(
  type: GeneratedArtifact["type"],
  version: number,
  content: string,
): GeneratedArtifact {
  return {
    id: `artifact_${version}`,
    repoId: "repo_1",
    type,
    version,
    content,
    sourceProfileVersion: 7,
    modelProvider: "local",
    model: "llama",
    createdAt: "2026-04-30T00:00:00.000Z",
  };
}

describe("github helpers", () => {
  it("verifies GitHub webhook signatures", () => {
    const payload = JSON.stringify({ action: "created" });
    const secret = "webhook-secret";
    const signature256 = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;

    expect(verifyWebhookSignature({ secret, payload, signature256 })).toBe(
      true,
    );
    expect(
      verifyWebhookSignature({
        secret,
        payload,
        signature256: signature256.replace(/.$/, "0"),
      }),
    ).toBe(false);
  });

  it("maps installation events to persisted records", () => {
    const mapped = mapInstallationEvent({
      installation: {
        id: 42,
        account: { login: "acme", type: "Organization" },
        repository_selection: "selected",
        permissions: { contents: "write" },
      },
      repositories: [
        {
          id: 10,
          name: "tool",
          full_name: "acme/tool",
          private: false,
          default_branch: "trunk",
        },
      ],
    });

    expect(mapped.installation.accountLogin).toBe("acme");
    expect(mapped.repos[0]?.defaultBranch).toBe("trunk");
  });

  it("renders predictable branch names and PR body metadata", () => {
    expect(createContextBranchName(3, 1)).toBe("open-maintainer/context-3-2");
    const body = renderContextPrBody({
      repoProfileVersion: 3,
      artifacts: [
        {
          id: "artifact_1",
          repoId: "repo_1",
          type: "AGENTS.md",
          version: 4,
          content: "test",
          sourceProfileVersion: 3,
          modelProvider: "local",
          model: "llama",
          createdAt: "2026-04-30T00:00:00.000Z",
        },
      ],
      modelProvider: "local",
      model: "llama",
      runReference: "run_1",
      generatedAt: "2026-04-30T00:00:00.000Z",
    });

    expect(body).toContain("Repo profile version: v3");
    expect(body).toContain("AGENTS.md");
    expect(body).toContain("| Artifact | Source |");
    expect(body).not.toContain("| Artifact | Version | Source |");
    expect(body).not.toContain("| AGENTS.md | v4 |");
  });

  it("filters generated and heavy paths before bounded content fetches", async () => {
    const requestedPaths: string[] = [];
    const contents = new Map([
      [
        "README.md",
        {
          type: "file",
          encoding: "base64",
          content: Buffer.from("hello").toString("base64"),
          size: 5,
          sha: "readme-sha",
        },
      ],
      [
        "src/big.ts",
        {
          type: "file",
          encoding: "base64",
          content: Buffer.from("01234567890123456789").toString("base64"),
          size: 20,
          sha: "big-sha",
        },
      ],
      [
        "src/second.ts",
        {
          type: "file",
          encoding: "base64",
          content: Buffer.from("second!").toString("base64"),
          size: 7,
          sha: "second-sha",
        },
      ],
    ]);
    const client: GitHubRepositoryClient = {
      repos: {
        async getContent(input) {
          requestedPaths.push(input.path);
          const content = contents.get(input.path);
          if (!content) {
            throw notFound();
          }
          return { data: content };
        },
        async createOrUpdateFileContents() {
          return { data: { commit: { sha: "unused" } } };
        },
      },
      git: {
        async getRef() {
          return { data: { object: { sha: "unused" } } };
        },
        async createRef() {
          return {};
        },
        async updateRef() {
          return {};
        },
      },
      pulls: {
        async list() {
          return { data: [] };
        },
        async create() {
          return {
            data: {
              number: 1,
              html_url: "https://github.com/acme/tool/pull/1",
            },
          };
        },
        async update() {
          return {
            data: {
              number: 1,
              html_url: "https://github.com/acme/tool/pull/1",
            },
          };
        },
      },
    };

    const fetched = await fetchRepositoryContents({
      owner: "acme",
      repo: "tool",
      ref: "main",
      paths: [
        "/README.md",
        "dist/app.js",
        "src/big.ts",
        "missing.md",
        "src/second.ts",
        "src/third.ts",
      ],
      limits: { maxFiles: 2, maxFileBytes: 10, maxTotalBytes: 12 },
      client,
    });

    expect(shouldSkipRepositoryPath("node_modules/pkg/index.js")).toBe(true);
    expect(shouldSkipRepositoryPath("bun.lock")).toBe(false);
    expect(shouldSkipRepositoryPath("Cargo.lock")).toBe(false);
    expect(fetched.files.map((file) => file.path)).toEqual([
      "README.md",
      "src/second.ts",
    ]);
    expect(fetched.skipped).toEqual([
      { path: "dist/app.js", reason: "filtered" },
      { path: "src/big.ts", reason: "max_file_bytes" },
      { path: "missing.md", reason: "not_found" },
      { path: "src/third.ts", reason: "max_files" },
    ]);
    expect(requestedPaths).toEqual([
      "README.md",
      "src/big.ts",
      "missing.md",
      "src/second.ts",
    ]);
  });

  it("updates a context branch, preserves existing context files, and updates an existing PR", async () => {
    const updatedRefs: Array<{ ref: string; sha: string; force: boolean }> = [];
    const writes: Array<{
      path: string;
      branch: string;
      sha?: string;
      content: string;
    }> = [];
    const updatedPulls: Array<{
      pull_number: number;
      title: string;
      body: string;
    }> = [];
    const branchName = createContextBranchName(7);
    const client: GitHubRepositoryClient = {
      repos: {
        async getContent(input) {
          if (input.path === "AGENTS.md" && input.ref === branchName) {
            return {
              data: {
                type: "file",
                encoding: "base64",
                content: Buffer.from("old").toString("base64"),
                size: 3,
                sha: "agents-existing-sha",
              },
            };
          }
          if (
            input.path === ".open-maintainer.yml" &&
            input.ref === branchName
          ) {
            return {
              data: {
                type: "file",
                encoding: "base64",
                content: Buffer.from(
                  "generated:\n  by: open-maintainer\n  artifactVersion: 1\n",
                ).toString("base64"),
                size: 50,
                sha: "config-existing-sha",
              },
            };
          }
          throw notFound();
        },
        async createOrUpdateFileContents(input) {
          writes.push({
            path: input.path,
            branch: input.branch,
            content: input.content,
            ...(input.sha ? { sha: input.sha } : {}),
          });
          return { data: { commit: { sha: `commit-${writes.length}` } } };
        },
      },
      git: {
        async getRef(input) {
          if (input.ref === "heads/main") {
            return { data: { object: { sha: "base-sha" } } };
          }
          if (input.ref === `heads/${branchName}`) {
            return { data: { object: { sha: "old-branch-sha" } } };
          }
          throw notFound();
        },
        async createRef() {
          throw new Error("branch should already exist");
        },
        async updateRef(input) {
          updatedRefs.push({
            ref: input.ref,
            sha: input.sha,
            force: input.force,
          });
          return {};
        },
      },
      pulls: {
        async list() {
          return {
            data: [
              {
                number: 12,
                html_url: "https://github.com/acme/tool/pull/12",
              },
            ],
          };
        },
        async create() {
          throw new Error("existing PR should be updated");
        },
        async update(input) {
          updatedPulls.push({
            pull_number: input.pull_number,
            title: input.title,
            body: input.body,
          });
          return {
            data: {
              number: input.pull_number,
              html_url: "https://github.com/acme/tool/pull/12",
            },
          };
        },
      },
    };

    const contextPr = await createContextPr({
      repoId: "repo_1",
      owner: "acme",
      repo: "tool",
      defaultBranch: "main",
      profileVersion: 7,
      artifacts: [
        artifact("repo_profile", 1, "{}"),
        artifact("AGENTS.md", 2, "# Agent instructions"),
        artifact(
          ".open-maintainer.yml",
          3,
          "generated:\n  artifactVersion: 3\n",
        ),
      ],
      runReference: "run_1",
      generatedAt: "2026-04-30T00:00:00.000Z",
      client,
    });

    expect(updatedRefs).toEqual([
      { ref: `heads/${branchName}`, sha: "base-sha", force: true },
    ]);
    expect(writes).toEqual([
      {
        path: ".open-maintainer.yml",
        branch: branchName,
        sha: "config-existing-sha",
        content: Buffer.from("generated:\n  artifactVersion: 3\n").toString(
          "base64",
        ),
      },
    ]);
    expect(updatedPulls[0]?.pull_number).toBe(12);
    expect(updatedPulls[0]?.body).toContain("Dashboard run: run_1");
    expect(updatedPulls[0]?.body).not.toContain("AGENTS.md");
    expect(contextPr.branchName).toBe(branchName);
    expect(contextPr.commitSha).toBe("commit-1");
    expect(contextPr.prNumber).toBe(12);
    expect(contextPr.artifactVersions).toEqual([3]);
  });

  it("assembles bounded pull request review context", async () => {
    const filePages = [
      Array.from({ length: 100 }, (_, index) => ({
        filename: `src/file-${index}.ts`,
        status: "modified",
        additions: 1,
        deletions: 0,
        patch: `@@ -1 +1 @@\n-export const value = ${index};\n+export const value = ${index + 1};`,
      })),
      [
        {
          filename: "dist/generated.js",
          status: "modified",
          additions: 1,
          deletions: 1,
          patch: "@@ generated",
        },
        {
          filename: "src/too-big.ts",
          status: "modified",
          additions: 1,
          deletions: 1,
          patch: "x".repeat(500),
        },
      ],
    ];
    const client: GitHubRepositoryClient = {
      repos: {
        async getContent() {
          throw notFound();
        },
        async createOrUpdateFileContents() {
          return { data: { commit: { sha: "unused" } } };
        },
        async getCombinedStatusForRef() {
          return {
            data: {
              statuses: [
                {
                  context: "ci/test",
                  state: "success",
                  target_url: "https://github.com/acme/tool/actions/runs/1",
                },
              ],
            },
          };
        },
      },
      git: {
        async getRef() {
          return { data: { object: { sha: "unused" } } };
        },
        async createRef() {
          return {};
        },
        async updateRef() {
          return {};
        },
      },
      pulls: {
        async get() {
          return {
            data: {
              number: 7,
              title: "Add review context",
              body: "Fixes #12",
              html_url: "https://github.com/acme/tool/pull/7",
              user: { login: "maintainer" },
              base: { ref: "main", sha: "base-sha" },
              head: { ref: "feature", sha: "head-sha" },
            },
          };
        },
        async list() {
          return { data: [] };
        },
        async listFiles(input) {
          return { data: filePages[(input.page ?? 1) - 1] ?? [] };
        },
        async listCommits() {
          return { data: [{ sha: "commit-1" }] };
        },
        async listReviewComments() {
          return {
            data: [
              {
                id: 33,
                body: "<!-- open-maintainer-review-inline -->\ninline",
                path: "src/file-1.ts",
                line: 4,
              },
            ],
          };
        },
        async create() {
          throw new Error("unused");
        },
        async update() {
          throw new Error("unused");
        },
      },
      issues: {
        async get() {
          return {
            data: {
              number: 12,
              title: "Review context",
              body: [
                "## Acceptance Criteria",
                "- PR files are collected",
                "- Checks are included",
                "",
                "## Notes",
                "Done",
              ].join("\n"),
              html_url: "https://github.com/acme/tool/issues/12",
            },
          };
        },
        async listComments() {
          return {
            data: [
              {
                id: 22,
                body: "<!-- open-maintainer-review-summary -->\nsummary",
              },
              { id: 23, body: "ordinary comment" },
            ],
          };
        },
      },
      checks: {
        async listForRef() {
          return {
            data: {
              check_runs: [
                {
                  name: "build",
                  status: "completed",
                  conclusion: "success",
                  html_url: "https://github.com/acme/tool/actions/runs/2",
                },
              ],
            },
          };
        },
      },
    };

    const context = await fetchPullRequestReviewContext({
      repoId: "repo_1",
      owner: "acme",
      repo: "tool",
      pullNumber: 7,
      limits: { maxFiles: 101, maxFileBytes: 200 },
      client,
    });

    expect(context.prNumber).toBe(7);
    expect(context.baseSha).toBe("base-sha");
    expect(context.headSha).toBe("head-sha");
    expect(context.changedFiles).toHaveLength(100);
    expect(context.changedFiles[0]).toEqual(
      expect.objectContaining({
        path: "src/file-0.ts",
        status: "modified",
      }),
    );
    expect(context.skippedFiles).toEqual([
      { path: "dist/generated.js", reason: "filtered" },
      { path: "src/too-big.ts", reason: "max_file_bytes" },
    ]);
    expect(context.commits).toEqual(["commit-1"]);
    expect(context.checkStatuses.map((check) => check.name).sort()).toEqual([
      "build",
      "ci/test",
    ]);
    expect(context.issueContext[0]?.acceptanceCriteria).toEqual([
      "PR files are collected",
      "Checks are included",
    ]);
    expect(context.existingComments).toEqual([
      {
        id: 22,
        kind: "summary",
        body: "<!-- open-maintainer-review-summary -->\nsummary",
        path: null,
        line: null,
      },
      {
        id: 33,
        kind: "inline",
        body: "<!-- open-maintainer-review-inline -->\ninline",
        path: "src/file-1.ts",
        line: 4,
      },
    ]);
  });

  it("extracts linked issues and acceptance criteria for review context", () => {
    expect(
      extractLinkedIssueNumbers("Fixes #12 and resolves acme/tool#15."),
    ).toEqual([12, 15]);
    expect(
      extractAcceptanceCriteria(
        "Intro\n## Acceptance Criteria\n- First item\n- [x] Done item\n## Other\nNope",
      ),
    ).toEqual(["First item", "Done item"]);
    expect(isOpenMaintainerReviewComment("ordinary comment")).toBe(false);
    expect(
      isOpenMaintainerReviewComment(
        "<!-- open-maintainer-review-summary -->\nbody",
      ),
    ).toBe(true);
  });
});
