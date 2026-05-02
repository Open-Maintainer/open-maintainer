import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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
    expect(markdown).toContain("## Open Maintainer PR Review");
    expect(markdown).toContain("Pull request: #44");
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

  it("rejects posting placeholders without writing to GitHub", async () => {
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
    expect(result.stderr).toContain("Review posting is not implemented yet");
  });
});
