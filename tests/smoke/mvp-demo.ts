import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  codexGenerateArgs,
  createFakeCodexCli,
} from "../helpers/fake-model-cli";

const repoRoot = path.resolve(import.meta.dir, "../..");
const fixture = path.join(repoRoot, "tests/fixtures/low-context-ts");
const workdir = await mkdtemp(path.join(tmpdir(), "open-maintainer-mvp-"));

await cp(fixture, workdir, { recursive: true });

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
  if (exitCode !== 0) {
    throw new Error(`CLI failed (${args.join(" ")}):\n${stdout}\n${stderr}`);
  }
  return stdout;
}

function scoreFrom(output: string): number {
  const match = /Agent Readiness: (?<score>\d+)\/100/.exec(output);
  if (!match?.groups?.score) {
    throw new Error(`No readiness score in output:\n${output}`);
  }
  return Number(match.groups.score);
}

const before = scoreFrom(await runCli(["audit", workdir]));
const fakeCodex = await createFakeCodexCli();
await runCli(
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
const after = scoreFrom(await runCli(["audit", workdir]));
const doctor = await runCli(["doctor", workdir]);
await runCli(["pr", workdir, "--create"]);

const repoSlug = path
  .basename(workdir)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");
const required = [
  "AGENTS.md",
  `.agents/skills/${repoSlug}-start-task/SKILL.md`,
  `.agents/skills/${repoSlug}-testing-workflow/SKILL.md`,
  `.agents/skills/${repoSlug}-pr-review/SKILL.md`,
  ".open-maintainer/profile.json",
  ".open-maintainer/report.md",
];

for (const artifactPath of required) {
  const content = await readFile(path.join(workdir, artifactPath), "utf8");
  if (!content.includes("open-maintainer") && artifactPath !== "AGENTS.md") {
    throw new Error(`${artifactPath} does not look repo-specific.`);
  }
}

if (after <= before) {
  throw new Error(
    `Expected readiness score to improve, before=${before}, after=${after}`,
  );
}
if (!doctor.includes("all required artifacts are present")) {
  throw new Error(`Doctor did not pass:\n${doctor}`);
}

console.log(`MVP smoke passed: ${before}/100 -> ${after}/100`);
