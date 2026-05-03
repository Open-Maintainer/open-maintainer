import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { repoRoot, runCli } from "./helpers/cli";
import {
  codexGenerateArgs,
  createFakeCodexCli,
} from "./helpers/fake-model-cli";

const execFileAsync = promisify(execFile);

const fixtureRoot = path.join(repoRoot, "tests/fixtures/low-context-ts");

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
    const fakeCodex = await createFakeCodexCli();

    const result = await runCli(
      [
        "init",
        workdir,
        ...codexGenerateArgs,
        "--context",
        "codex",
        "--skills",
        "codex",
      ],
      fakeCodex.env,
    );

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

  it("uses Git remote identity instead of checkout path identity", async () => {
    const workdir = await mkdtemp(
      path.join(tmpdir(), "open-maintainer-identity-"),
    );
    await cp(fixtureRoot, workdir, { recursive: true });
    await execFileAsync("git", ["init"], { cwd: workdir });
    await execFileAsync(
      "git",
      [
        "remote",
        "add",
        "origin",
        "https://github.com/Open-Maintainer/open-maintainer.git",
      ],
      { cwd: workdir },
    );
    await execFileAsync("git", ["add", "."], { cwd: workdir });

    const result = await runCli(["audit", workdir]);

    expect(result.exitCode).toBe(0);
    const profile = JSON.parse(
      await readFile(
        path.join(workdir, ".open-maintainer/profile.json"),
        "utf8",
      ),
    ) as { owner: string; name: string };
    expect(profile.owner).toBe("Open-Maintainer");
    expect(profile.name).toBe("open-maintainer");
  });

  it("refreshes generated context while preserving maintainer-owned files", async () => {
    const workdir = await mkdtemp(
      path.join(tmpdir(), "open-maintainer-refresh-generated-"),
    );
    await cp(fixtureRoot, workdir, { recursive: true });
    const fakeCodex = await createFakeCodexCli();

    const initial = await runCli(
      [
        "generate",
        workdir,
        ...codexGenerateArgs,
        "--context",
        "codex",
        "--skills",
        "codex",
      ],
      fakeCodex.env,
    );
    expect(initial.exitCode).toBe(0);

    const agentsPath = path.join(workdir, "AGENTS.md");
    await writeFile(agentsPath, "# Maintainer-owned instructions\n");
    const configPath = path.join(workdir, ".open-maintainer.yml");
    const staleGeneratedConfig = `${await readFile(configPath, "utf8")}\n# stale generated note\n`;
    await writeFile(configPath, staleGeneratedConfig);

    const refresh = await runCli(
      [
        "generate",
        workdir,
        ...codexGenerateArgs,
        "--context",
        "codex",
        "--skills",
        "codex",
        "--refresh-generated",
      ],
      fakeCodex.env,
    );

    expect(refresh.exitCode).toBe(0);
    expect(refresh.stderr).toBe("");
    expect(refresh.stdout).toContain(
      "skip: AGENTS.md (existing maintainer-owned file preserved",
    );
    expect(refresh.stdout).toContain(
      "overwrite: .open-maintainer.yml (existing generated file)",
    );
    expect(await readFile(agentsPath, "utf8")).toBe(
      "# Maintainer-owned instructions\n",
    );
    expect(await readFile(configPath, "utf8")).not.toContain(
      "# stale generated note",
    );
  });

  it("includes drift findings and remediation in the report", async () => {
    const workdir = await mkdtemp(
      path.join(tmpdir(), "open-maintainer-audit-drift-"),
    );
    await cp(fixtureRoot, workdir, { recursive: true });
    const fakeCodex = await createFakeCodexCli();

    const generate = await runCli(
      [
        "generate",
        workdir,
        ...codexGenerateArgs,
        "--context",
        "codex",
        "--skills",
        "codex",
      ],
      fakeCodex.env,
    );
    expect(generate.exitCode).toBe(0);

    const packageJsonPath = path.join(workdir, "package.json");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
    packageJson.scripts.typecheck = "tsc --noEmit";
    await writeFile(
      packageJsonPath,
      `${JSON.stringify(packageJson, null, 2)}\n`,
    );

    const audit = await runCli(["audit", workdir]);

    expect(audit.exitCode).toBe(0);
    expect(audit.stderr).toBe("");
    const report = await readFile(
      path.join(workdir, ".open-maintainer/report.md"),
      "utf8",
    );
    expect(report).toContain("## Drift");
    expect(report).toContain(
      "Commands: package.json script typecheck was added. Evidence: package.json.",
    );
    expect(report).toContain(
      "Next action: review the changed command and refresh generated context if validation expectations changed.",
    );
  });
});
