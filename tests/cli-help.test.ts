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
    for (const command of ["audit", "generate", "init", "doctor", "pr"]) {
      for (const helpToken of ["--help", "-h", "help"]) {
        const result = await runCli([command, helpToken]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe("");
        expect(result.stdout).toContain(`open-maintainer ${command}`);
        expect(result.stdout).not.toContain("ENOENT");
      }
    }
  });

  it("prints targeted help through the help command", async () => {
    const result = await runCli(["help", "generate"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("open-maintainer generate <repo>");
    expect(result.stdout).toContain("--context codex|claude|both");
    expect(result.stdout).toContain("--skills codex|claude|both");
    expect(result.stdout).toContain("--allow-write");
  });
});
