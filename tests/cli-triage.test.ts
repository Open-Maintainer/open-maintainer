import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { IssueTriageResultSchema } from "@open-maintainer/shared";
import { describe, expect, it } from "vitest";
import { createFakeCodexCli } from "./helpers/fake-model-cli";

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

async function createTriageRepo(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "om-cli-triage-"));
  await Bun.$`git init -b main`.cwd(directory).quiet();
  await Bun.$`git config user.email test@example.com`.cwd(directory).quiet();
  await Bun.$`git config user.name "Test User"`.cwd(directory).quiet();
  await Bun.$`git remote add origin https://github.com/acme/triage-fixture.git`
    .cwd(directory)
    .quiet();
  await mkdir(path.join(directory, "src"), { recursive: true });
  await writeFile(
    path.join(directory, "package.json"),
    JSON.stringify(
      {
        name: "triage-fixture",
        type: "module",
        scripts: { test: "vitest run", typecheck: "tsc -b" },
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(directory, "README.md"),
    "# Triage fixture\n\nUse this repository to test issue triage.\n",
  );
  await writeFile(
    path.join(directory, "src", "index.ts"),
    "export function value() {\n  return 1;\n}\n",
  );
  await Bun.$`git add .`.cwd(directory).quiet();
  await Bun.$`git commit -m initial`.cwd(directory).quiet();
  return directory;
}

async function createFakeGhCli(): Promise<{
  env: Record<string, string>;
  callsPath: string;
}> {
  const directory = await mkdtemp(path.join(tmpdir(), "om-fake-gh-triage-"));
  const command = path.join(directory, "gh");
  const callsPath = path.join(directory, "calls.jsonl");
  await writeFile(
    command,
    `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const callsPath = process.env.OPEN_MAINTAINER_FAKE_GH_CALLS;
fs.appendFileSync(callsPath, JSON.stringify({ args }) + "\\n");
function write(value) {
  process.stdout.write(JSON.stringify(value));
}
if (args[0] !== "api") {
  console.error("unexpected gh args: " + args.join(" "));
  process.exit(1);
}
if (args.includes("--method")) {
  console.error("unexpected mutation: " + args.join(" "));
  process.exit(1);
}
const endpoint = args[1];
if (endpoint === "repos/acme/triage-fixture/issues/42") {
  write({
    number: 42,
    title: "Triage one issue locally",
    body: "## Feature request\\nThe command should triage one issue locally and inspect \`apps/cli/src/index.ts\`.\\n\\n## Acceptance criteria\\n- The command is non-mutating by default",
    html_url: "https://github.com/acme/triage-fixture/issues/42",
    user: { login: "author" },
    labels: [{ name: "enhancement" }],
    state: "open",
    created_at: "2026-05-03T00:00:00.000Z",
    updated_at: "2026-05-03T00:01:00.000Z"
  });
  process.exit(0);
}
if (endpoint === "repos/acme/triage-fixture/issues/42/comments") {
  write([{
    id: 100,
    body: "Please include .open-maintainer/triage/issues/42.json in the artifact output.",
    html_url: "https://github.com/acme/triage-fixture/issues/42#issuecomment-100",
    user: { login: "maintainer" },
    created_at: "2026-05-03T00:02:00.000Z",
    updated_at: "2026-05-03T00:02:00.000Z"
  }]);
  process.exit(0);
}
if (endpoint === "search/issues") {
  write({ items: [] });
  process.exit(0);
}
console.error("unexpected gh endpoint: " + endpoint);
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

describe("CLI issue triage", () => {
  it("requires explicit model content-transfer consent", async () => {
    const fixture = await createTriageRepo();

    const result = await runCli([
      "triage",
      "issue",
      fixture,
      "--number",
      "42",
      "--model",
      "codex",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--allow-model-content-transfer");
  });

  it("runs single-issue triage and writes a preview artifact", async () => {
    const fixture = await createTriageRepo();
    const fakeCodex = await createFakeCodexCli();
    const fakeGh = await createFakeGhCli();

    const result = await runCli(
      [
        "triage",
        "issue",
        fixture,
        "--number",
        "42",
        "--model",
        "codex",
        "--allow-model-content-transfer",
      ],
      { ...fakeCodex.env, ...fakeGh.env },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Classification: needs_author_input");
    expect(result.stdout).toContain("Agent readiness: not_agent_ready");
    expect(result.stdout).toContain(
      "Artifact: .open-maintainer/triage/issues/42.json",
    );
    expect(result.stdout).toContain("GitHub writes: skipped");
    const artifact = JSON.parse(
      await readFile(
        path.join(fixture, ".open-maintainer/triage/issues/42.json"),
        "utf8",
      ),
    );
    const triage = IssueTriageResultSchema.parse(artifact.result);
    expect(triage.issueNumber).toBe(42);
    expect(triage.classification).toBe("needs_author_input");
    expect(
      triage.writeActions.every((action) => action.status === "skipped"),
    ).toBe(true);
    expect(artifact.input.evidence.referencedSurfaces).toContain(
      "apps/cli/src/index.ts",
    );
    const ghCalls = await readFile(fakeGh.callsPath, "utf8");
    expect(ghCalls).not.toContain("--method");
  });

  it("rejects invalid issue triage model JSON", async () => {
    const fixture = await createTriageRepo();
    const fakeCodex = await createFakeCodexCli();
    const fakeGh = await createFakeGhCli();

    const result = await runCli(
      [
        "triage",
        "issue",
        fixture,
        "--number",
        "42",
        "--model",
        "codex",
        "--allow-model-content-transfer",
      ],
      {
        ...fakeCodex.env,
        ...fakeGh.env,
        OPEN_MAINTAINER_FAKE_CODEX_ISSUE_TRIAGE: "invalid-json",
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Invalid issue triage model output");
  });

  it("rejects issue triage model output without evidence citations", async () => {
    const fixture = await createTriageRepo();
    const fakeCodex = await createFakeCodexCli();
    const fakeGh = await createFakeGhCli();

    const result = await runCli(
      [
        "triage",
        "issue",
        fixture,
        "--number",
        "42",
        "--model",
        "codex",
        "--allow-model-content-transfer",
      ],
      {
        ...fakeCodex.env,
        ...fakeGh.env,
        OPEN_MAINTAINER_FAKE_CODEX_ISSUE_TRIAGE: "no-evidence",
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Invalid issue triage model output");
    expect(result.stderr).toContain("evidence");
  });
});
