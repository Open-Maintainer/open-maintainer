import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
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
});
