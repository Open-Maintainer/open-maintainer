import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function runCli(args: string[]) {
  const process = Bun.spawn(["bun", "apps/cli/src/index.ts", ...args], {
    cwd: repoRoot,
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

describe("CLI help", () => {
  it("prints root help without requiring a repository path", async () => {
    for (const args of [["--help"], ["-h"], ["help"]]) {
      const result = await runCli(args);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("open-maintainer <command> <repo>");
      expect(result.stdout).toContain("open-maintainer help <command>");
    }
  });

  it("prints command help before resolving repository paths", async () => {
    for (const command of [
      "audit",
      "generate",
      "init",
      "doctor",
      "review",
      "triage",
      "pr",
    ]) {
      for (const helpToken of ["--help", "-h", "help"]) {
        const result = await runCli([command, helpToken]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe("");
        expect(result.stdout).toContain(`open-maintainer ${command}`);
        expect(result.stdout).not.toContain("ENOENT");
      }
    }
  });

  it("documents issue triage safety defaults", async () => {
    const result = await runCli(["help", "triage"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("open-maintainer triage issue <repo>");
    expect(result.stdout).toContain("open-maintainer triage issues <repo>");
    expect(result.stdout).toContain("--number <n>");
    expect(result.stdout).toContain("--state open|closed|all");
    expect(result.stdout).toContain("--limit <n>");
    expect(result.stdout).toContain("--model codex|claude");
    expect(result.stdout).toContain("--allow-model-content-transfer");
    expect(result.stdout).toContain("non-mutating");
  });

  it("prints targeted help through the help command", async () => {
    const result = await runCli(["help", "generate"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("open-maintainer generate <repo>");
    expect(result.stdout).toContain("--context codex|claude|both");
    expect(result.stdout).toContain("--skills codex|claude|both");
    expect(result.stdout).toContain("--allow-write");
    expect(result.stdout).toContain("--refresh-generated");
  });

  it("documents review safety defaults", async () => {
    const result = await runCli(["help", "review"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("open-maintainer review <repo>");
    expect(result.stdout).toContain("--base-ref <ref>");
    expect(result.stdout).toContain("--pr <number>");
    expect(result.stdout).toContain("--json");
    expect(result.stdout).toContain("--dry-run");
    expect(result.stdout).toContain("--model codex|claude");
    expect(result.stdout).toContain("--llm-model <model>");
    expect(result.stdout).toContain("--allow-model-content-transfer");
    expect(result.stdout).toContain("--review-provider codex|claude");
    expect(result.stdout).toContain("Alias for --model");
    expect(result.stdout).toContain("--review-apply-triage-label");
    expect(result.stdout).toContain("--review-create-triage-labels");
    expect(result.stdout).toContain("Local ref review is non-mutating");
  });

  it("rejects missing and invalid option values", async () => {
    const missing = await runCli(["audit", ".", "--report-path"]);
    expect(missing.exitCode).toBe(1);
    expect(missing.stderr).toContain("Missing value for --report-path.");

    const invalid = await runCli([
      "audit",
      ".",
      "--fail-on-score-below",
      "not-a-number",
    ]);
    expect(invalid.exitCode).toBe(1);
    expect(invalid.stderr).toContain(
      "Invalid value for --fail-on-score-below.",
    );
  });
});
