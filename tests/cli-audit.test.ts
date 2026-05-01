import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixtureRoot = path.join(repoRoot, "tests/fixtures/low-context-ts");

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

describe("CLI audit", () => {
  it("prints concrete next steps for missing readiness items", async () => {
    const workdir = await mkdtemp(
      path.join(tmpdir(), "open-maintainer-audit-"),
    );
    await cp(fixtureRoot, workdir, { recursive: true });

    const result = await runCli(["audit", workdir]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Agent Readiness:");
    expect(result.stdout).toContain("Report: .open-maintainer/report.md");
    expect(result.stdout).toContain("Next steps:");
    expect(result.stdout).toContain(
      "- Add a `docs/` directory with architecture, operations, or runbook notes.",
    );
    expect(result.stdout).toContain(
      "- Add `.github/workflows/ci.yml` running the repository's install and validation commands.",
    );
    expect(result.stdout).toContain(
      "- Add `AGENTS.md` or `CLAUDE.md` with repo-specific agent instructions.",
    );
    expect(result.stdout).toContain(".agents/skills/");
    expect(result.stdout).toContain("-start-task/SKILL.md");
    expect(result.stdout).toContain(
      "- Add `.open-maintainer.yml` with repository policy and generated-context metadata.",
    );
    expect(result.stdout).toContain(
      "- Add `CONTRIBUTING.md` with PR workflow, review rules, and validation commands.",
    );
  });

  it("re-audits after init generates context artifacts", async () => {
    const workdir = await mkdtemp(path.join(tmpdir(), "open-maintainer-init-"));
    await cp(fixtureRoot, workdir, { recursive: true });

    const result = await runCli([
      "init",
      workdir,
      "--deterministic",
      "--context",
      "codex",
      "--skills",
      "codex",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const profile = JSON.parse(
      await readFile(
        path.join(workdir, ".open-maintainer/profile.json"),
        "utf8",
      ),
    ) as { existingContextFiles: string[] };
    expect(profile.existingContextFiles).toContain("AGENTS.md");
    expect(profile.existingContextFiles).toContain(".open-maintainer.yml");
  });
});
