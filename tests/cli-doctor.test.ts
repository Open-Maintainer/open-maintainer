import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

describe("CLI doctor", () => {
  it("detects generated artifact drift from the current profile", async () => {
    const workdir = await mkdtemp(
      path.join(tmpdir(), "open-maintainer-doctor-"),
    );
    await cp(fixtureRoot, workdir, { recursive: true });

    const generate = await runCli([
      "generate",
      workdir,
      "--deterministic",
      "--context",
      "codex",
      "--skills",
      "codex",
    ]);
    expect(generate.exitCode).toBe(0);

    const packageJsonPath = path.join(workdir, "package.json");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
    packageJson.scripts.typecheck = "tsc --noEmit";
    await writeFile(
      packageJsonPath,
      `${JSON.stringify(packageJson, null, 2)}\n`,
    );

    const doctor = await runCli(["doctor", workdir]);

    expect(doctor.exitCode).toBe(1);
    expect(doctor.stderr).toBe("");
    expect(doctor.stdout).toContain(
      'drift: command package.json script typecheck was added: "tsc --noEmit"',
    );
    expect(doctor.stdout).toContain(
      "drift: .open-maintainer/profile.json was generated from a different repository profile",
    );
    expect(doctor.stdout).toContain(
      "drift: AGENTS.md was generated from a different repository profile",
    );
    expect(doctor.stdout).toContain("drift: .agents/skills/");
    expect(doctor.stdout).toContain(
      "-start-task/SKILL.md was generated from a different repository profile",
    );
  });

  it("names CI workflow drift from the stored profile", async () => {
    const workdir = await mkdtemp(
      path.join(tmpdir(), "open-maintainer-doctor-ci-"),
    );
    await cp(fixtureRoot, workdir, { recursive: true });
    const workflowDir = path.join(workdir, ".github/workflows");
    await mkdir(workflowDir, { recursive: true });
    await writeFile(
      path.join(workflowDir, "ci.yml"),
      "name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n",
    );
    await writeFile(
      path.join(workflowDir, "lint.yml"),
      "name: Lint\non: [push]\njobs:\n  lint:\n    runs-on: ubuntu-latest\n",
    );

    const generate = await runCli([
      "generate",
      workdir,
      "--deterministic",
      "--context",
      "codex",
      "--skills",
      "codex",
    ]);
    expect(generate.exitCode).toBe(0);

    await writeFile(
      path.join(workflowDir, "ci.yml"),
      "name: CI\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n",
    );
    await rm(path.join(workflowDir, "lint.yml"));
    await writeFile(
      path.join(workflowDir, "release.yml"),
      "name: Release\non: [workflow_dispatch]\njobs:\n  build:\n    runs-on: ubuntu-latest\n",
    );

    const doctor = await runCli(["doctor", workdir]);

    expect(doctor.exitCode).toBe(1);
    expect(doctor.stderr).toBe("");
    expect(doctor.stdout).toContain(
      "drift: CI workflow .github/workflows/ci.yml was changed",
    );
    expect(doctor.stdout).toContain(
      "drift: CI workflow .github/workflows/lint.yml was removed",
    );
    expect(doctor.stdout).toContain(
      "drift: CI workflow .github/workflows/release.yml was added",
    );
    expect(doctor.stdout).toContain(
      "drift: .open-maintainer/profile.json was generated from a different repository profile",
    );
  });

  it("names docs, templates, and generated context artifact drift", async () => {
    const workdir = await mkdtemp(
      path.join(tmpdir(), "open-maintainer-doctor-docs-"),
    );
    await cp(fixtureRoot, workdir, { recursive: true });
    const templateDir = path.join(workdir, ".github/ISSUE_TEMPLATE");
    await mkdir(templateDir, { recursive: true });
    await writeFile(
      path.join(templateDir, "bug.yml"),
      "name: Bug report\ndescription: Report a reproducible bug.\n",
    );

    const generate = await runCli([
      "generate",
      workdir,
      "--deterministic",
      "--context",
      "codex",
      "--skills",
      "codex",
    ]);
    expect(generate.exitCode).toBe(0);

    await writeFile(
      path.join(workdir, "README.md"),
      "# Low Context TS\n\nUpdated setup guidance.\n",
    );
    await writeFile(
      path.join(templateDir, "bug.yml"),
      "name: Bug report\ndescription: Report a reproducible bug with logs.\n",
    );
    await writeFile(
      path.join(workdir, ".github/pull_request_template.md"),
      "## Validation\n\nList commands run.\n",
    );
    await writeFile(
      path.join(workdir, "AGENTS.md"),
      `${await readFile(path.join(workdir, "AGENTS.md"), "utf8")}\nManual local note.\n`,
    );

    const doctor = await runCli(["doctor", workdir]);

    expect(doctor.exitCode).toBe(1);
    expect(doctor.stderr).toBe("");
    expect(doctor.stdout).toContain(
      "drift: docs README.md was changed; review generated context against updated docs",
    );
    expect(doctor.stdout).toContain(
      "drift: template .github/ISSUE_TEMPLATE/bug.yml was changed; review issue and PR guidance",
    );
    expect(doctor.stdout).toContain(
      "drift: template .github/pull_request_template.md was added; review issue and PR guidance",
    );
    expect(doctor.stdout).toContain(
      "drift: context artifact AGENTS.md was changed; rerun generation or review the artifact",
    );
  });
});
