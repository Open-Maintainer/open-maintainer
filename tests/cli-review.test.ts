import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { ReviewResultSchema } from "@open-maintainer/shared";
import { describe, expect, it } from "vitest";
import { createFakeCodexCli } from "./helpers/fake-model-cli";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dir, "..");

async function runCli(args: string[], env: Record<string, string> = {}) {
  const process = Bun.spawn(["bun", "apps/cli/src/index.ts", ...args], {
    cwd: repoRoot,
    env: { ...Bun.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { stdout, stderr, exitCode };
}

async function createReviewRepo(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "om-cli-review-"));
  await execFileAsync("git", ["init", "-b", "main"], { cwd: directory });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], {
    cwd: directory,
  });
  await execFileAsync("git", ["config", "user.name", "Test User"], {
    cwd: directory,
  });
  await mkdir(path.join(directory, "src"), { recursive: true });
  await writeFile(
    path.join(directory, "package.json"),
    JSON.stringify(
      {
        name: "cli-review-fixture",
        type: "module",
        scripts: { test: "vitest run", typecheck: "tsc -b" },
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(directory, "src", "index.ts"),
    "export function value() {\n  return 1;\n}\n",
  );
  await execFileAsync("git", ["add", "."], { cwd: directory });
  await execFileAsync("git", ["commit", "-m", "initial"], { cwd: directory });
  await writeFile(
    path.join(directory, "src", "index.ts"),
    "export function value() {\n  return 2;\n}\n",
  );
  await execFileAsync("git", ["add", "."], { cwd: directory });
  await execFileAsync("git", ["commit", "-m", "change value"], {
    cwd: directory,
  });
  return directory;
}

async function attachPullRequestRemote(
  directory: string,
  prNumber: number,
): Promise<{ baseSha: string; headSha: string }> {
  const remote = await mkdtemp(path.join(tmpdir(), "om-cli-review-remote-"));
  await execFileAsync("git", ["init", "--bare"], { cwd: remote });
  await execFileAsync("git", ["remote", "add", "origin", remote], {
    cwd: directory,
  });
  await execFileAsync("git", ["push", "origin", "main"], { cwd: directory });
  const { stdout: baseSha } = await execFileAsync(
    "git",
    ["rev-parse", "HEAD~1"],
    { cwd: directory },
  );
  const { stdout: headSha } = await execFileAsync(
    "git",
    ["rev-parse", "HEAD"],
    { cwd: directory },
  );
  await execFileAsync(
    "git",
    ["update-ref", `refs/pull/${prNumber}/head`, headSha.trim()],
    { cwd: remote },
  );
  return { baseSha: baseSha.trim(), headSha: headSha.trim() };
}

async function createFakeGhCli(input: {
  prNumber: number;
  baseSha: string;
  headSha: string;
}): Promise<{ env: Record<string, string>; callsPath: string }> {
  const directory = await mkdtemp(path.join(tmpdir(), "om-fake-gh-"));
  const command = path.join(directory, "gh");
  const callsPath = path.join(directory, "calls.jsonl");
  await writeFile(
    command,
    `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const callsPath = process.env.OPEN_MAINTAINER_FAKE_GH_CALLS;
function write(value) {
  process.stdout.write(JSON.stringify(value));
}
function record(kind, endpoint, inputPath) {
  const input = inputPath ? JSON.parse(fs.readFileSync(inputPath, "utf8")) : null;
  fs.appendFileSync(callsPath, JSON.stringify({ kind, endpoint, input }) + "\\n");
}
if (args[0] === "repo" && args[1] === "view") {
  write({ owner: { login: "Open-Maintainer" }, name: "cli-review-fixture" });
  process.exit(0);
}
if (args[0] === "pr" && args[1] === "view") {
  write({
    number: ${input.prNumber},
    title: "Review fixture PR",
    body: "Acceptance criteria: keep the value intentional.",
    url: "https://github.com/Open-Maintainer/cli-review-fixture/pull/${input.prNumber}",
    author: { login: "maintainer" },
    baseRefName: "main",
    headRefName: "feature",
    baseRefOid: "${input.baseSha}",
    headRefOid: "${input.headSha}",
    comments: [],
    statusCheckRollup: [{ name: "Tests", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: "https://example.test/check" }]
  });
  process.exit(0);
}
if (args[0] === "api") {
  const endpoint = args[1];
  const inputIndex = args.indexOf("--input");
  const methodIndex = args.indexOf("--method");
  const method = methodIndex >= 0 ? args[methodIndex + 1] : "GET";
  if (method === "GET") {
    write([]);
    process.exit(0);
  }
  record(method, endpoint, inputIndex >= 0 ? args[inputIndex + 1] : null);
  write({ ok: true });
  process.exit(0);
}
console.error("unexpected gh args: " + args.join(" "));
process.exit(1);
`,
  );
  await chmod(command, 0o755);
  return {
    callsPath,
    env: {
      OPEN_MAINTAINER_FAKE_GH_CALLS: callsPath,
      PATH: `${directory}:${process.env.PATH ?? ""}`,
    },
  };
}

describe("CLI review", () => {
  it("writes markdown output without GitHub credentials", async () => {
    const fixture = await createReviewRepo();
    const outputPath = ".open-maintainer/review.md";
    const fakeCodex = await createFakeCodexCli();

    const result = await runCli(
      [
        "review",
        fixture,
        "--base-ref",
        "HEAD~1",
        "--head-ref",
        "HEAD",
        "--pr-number",
        "44",
        "--output-path",
        outputPath,
        "--review-provider",
        "codex",
        "--allow-model-content-transfer",
      ],
      fakeCodex.env,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Review: .open-maintainer/review.md");
    const markdown = await readFile(path.join(fixture, outputPath), "utf8");
    expect(markdown).toContain("## OpenMaintainer Review #44");
    expect(markdown).toContain("### Required Validation For This PR");
    expect(markdown).toContain("src/index.ts");
  });

  it("prints ReviewResult JSON", async () => {
    const fixture = await createReviewRepo();
    const fakeCodex = await createFakeCodexCli();

    const result = await runCli(
      [
        "review",
        fixture,
        "--base-ref",
        "HEAD~1",
        "--head-ref",
        "HEAD",
        "--json",
        "--review-provider",
        "codex",
        "--allow-model-content-transfer",
      ],
      fakeCodex.env,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const review = ReviewResultSchema.parse(JSON.parse(result.stdout));
    expect(review.changedFiles.map((file) => file.path)).toEqual([
      "src/index.ts",
    ]);
    expect(review.modelProvider).toBe("Codex CLI");
  });

  it("prints actionable errors for missing refs", async () => {
    const fixture = await createReviewRepo();

    const result = await runCli([
      "review",
      fixture,
      "--base-ref",
      "missing-ref",
      "--head-ref",
      "HEAD",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "Unable to assemble review diff for missing-ref...HEAD",
    );
    expect(result.stderr).toContain("Verify --base-ref and --head-ref");
  });

  it("requires explicit content-transfer consent for provider review", async () => {
    const fixture = await createReviewRepo();

    const result = await runCli([
      "review",
      fixture,
      "--base-ref",
      "HEAD~1",
      "--head-ref",
      "HEAD",
      "--review-provider",
      "codex",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "--review-provider requires --allow-model-content-transfer",
    );
  });

  it("fetches a pull request with gh and posts summary plus inline review comments", async () => {
    const fixture = await createReviewRepo();
    const prNumber = 12;
    const refs = await attachPullRequestRemote(fixture, prNumber);
    const fakeCodex = await createFakeCodexCli();
    const fakeGh = await createFakeGhCli({ prNumber, ...refs });

    const result = await runCli(
      [
        "review",
        fixture,
        "--pr",
        String(prNumber),
        "--review-provider",
        "codex",
        "--allow-model-content-transfer",
      ],
      {
        ...fakeCodex.env,
        ...fakeGh.env,
        OPEN_MAINTAINER_FAKE_CODEX_FINDING: "1",
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Review generated for pull request #12.");
    expect(result.stdout).toContain(
      "PR comments posted: summary comment, 1 inline comment.",
    );
    expect(result.stdout).not.toContain("## OpenMaintainer Review #12");
    expect(result.stdout).not.toContain("### Findings");

    const calls = (await readFile(fakeGh.callsPath, "utf8"))
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line) as { endpoint: string; input: unknown });
    expect(calls).toHaveLength(2);
    expect(calls[0].endpoint).toBe(
      "repos/Open-Maintainer/cli-review-fixture/issues/12/comments",
    );
    expect(JSON.stringify(calls[0].input)).toContain(
      "open-maintainer-review-summary",
    );
    expect(calls[1].endpoint).toBe(
      "repos/Open-Maintainer/cli-review-fixture/pulls/12/reviews",
    );
    expect(JSON.stringify(calls[1].input)).toContain(
      "open-maintainer-review-inline",
    );
    expect(JSON.stringify(calls[1].input)).toContain(
      "Add or adjust tests and confirm the changed value is intended.",
    );
  });

  it("requires a pull request target for posting flags", async () => {
    const fixture = await createReviewRepo();

    const result = await runCli([
      "review",
      fixture,
      "--base-ref",
      "HEAD~1",
      "--head-ref",
      "HEAD",
      "--review-post-summary",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Review posting requires --pr");
  });
});
