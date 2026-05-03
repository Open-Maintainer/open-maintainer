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

async function writeClosureConfig(
  repoRoot: string,
  closure: Record<string, boolean | number>,
): Promise<void> {
  await writeFile(
    path.join(repoRoot, ".open-maintainer.yml"),
    [
      "version: 1",
      "repo:",
      "  profileVersion: 2",
      "  defaultBranch: main",
      "rules: []",
      "issueTriage:",
      "  closure:",
      ...Object.entries(closure).map(([key, value]) => `    ${key}: ${value}`),
      "generated:",
      "  by: open-maintainer",
      "  artifactVersion: 3",
      '  generatedAt: "2026-04-30T00:00:00.000Z"',
      "",
    ].join("\n"),
  );
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
const endpoint = args[1];
const methodIndex = args.indexOf("--method");
const method = methodIndex >= 0 ? args[methodIndex + 1] : "GET";
const inputIndex = args.indexOf("--input");
const input = inputIndex >= 0 ? JSON.parse(fs.readFileSync(args[inputIndex + 1], "utf8")) : null;
if (method === "POST" && endpoint === "repos/acme/triage-fixture/labels") {
  write({ name: input.name });
  process.exit(0);
}
if (method === "POST" && /^repos\\/acme\\/triage-fixture\\/issues\\/\\d+\\/labels$/.test(endpoint)) {
  write(input.labels.map((name) => ({ name })));
  process.exit(0);
}
if (method === "POST" && /^repos\\/acme\\/triage-fixture\\/issues\\/\\d+\\/comments$/.test(endpoint)) {
  write({ id: 900, html_url: "https://github.com/acme/triage-fixture/issues/42#issuecomment-900" });
  process.exit(0);
}
if (method === "PATCH" && endpoint === "repos/acme/triage-fixture/issues/comments/901") {
  write({ id: 901, html_url: "https://github.com/acme/triage-fixture/issues/42#issuecomment-901" });
  process.exit(0);
}
if (method === "PATCH" && /^repos\\/acme\\/triage-fixture\\/issues\\/(42|43|44)$/.test(endpoint)) {
  const number = Number(endpoint.split("/").at(-1));
  write({ number, state: "closed" });
  process.exit(0);
}
if (method !== "GET") {
  console.error("unexpected mutation: " + args.join(" "));
  process.exit(1);
}
if (endpoint === "repos/acme/triage-fixture/issues") {
  write([
    { number: 42, title: "Triage one issue locally", pull_request: null },
    { number: 43, title: "Invalid model issue", pull_request: null },
    { number: 44, title: "Ready batch issue", pull_request: null },
    { number: 45, title: "Beyond requested limit", pull_request: null }
  ]);
  process.exit(0);
}
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
    updated_at: process.env.OPEN_MAINTAINER_FAKE_ISSUE_42_UPDATED_AT ?? "2026-05-03T00:01:00.000Z"
  });
  process.exit(0);
}
if (endpoint === "repos/acme/triage-fixture/issues/43") {
  write({
    number: 43,
    title: "Invalid model issue",
    body: "## Feature request\\nThis issue is used to exercise per-issue batch errors.",
    html_url: "https://github.com/acme/triage-fixture/issues/43",
    user: { login: "author" },
    labels: [{ name: "enhancement" }],
    state: "open",
    created_at: "2026-05-03T00:00:00.000Z",
    updated_at: "2026-05-03T00:01:00.000Z"
  });
  process.exit(0);
}
if (endpoint === "repos/acme/triage-fixture/issues/44") {
  write({
    number: 44,
    title: "Ready batch issue",
    body: "## Feature request\\nThis issue includes enough scope.\\n\\n## Acceptance criteria\\n- Batch output records the next action",
    html_url: "https://github.com/acme/triage-fixture/issues/44",
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
if (endpoint === "repos/acme/triage-fixture/issues/42/comments?per_page=100") {
  if (process.env.OPEN_MAINTAINER_FAKE_EXISTING_TRIAGE_COMMENT === "1") {
    write([{
      id: 901,
      body: "<!-- open-maintainer:issue-triage -->\\nOld triage comment"
    }]);
  } else {
    write([]);
  }
  process.exit(0);
}
if (/^repos\\/acme\\/triage-fixture\\/issues\\/(43|44)\\/comments$/.test(endpoint)) {
  write([]);
  process.exit(0);
}
if (endpoint === "repos/acme/triage-fixture/labels?per_page=100") {
  write([
    { name: "open-maintainer/needs-author-input" },
    { name: "open-maintainer/ready-for-review" },
    { name: "open-maintainer/agent-ready" }
  ]);
  process.exit(0);
}
if (endpoint === "repos/acme/triage-fixture/issues/42/labels?per_page=100") {
  write([{ name: "open-maintainer/needs-author-input" }]);
  process.exit(0);
}
if (/^repos\\/acme\\/triage-fixture\\/issues\\/(43|44)\\/labels\\?per_page=100$/.test(endpoint)) {
  write([]);
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
    expect(result.stdout).toContain("Label actions: skipped");
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
    expect(
      triage.writeActions.some(
        (action) =>
          action.type === "apply_label" &&
          action.status === "skipped" &&
          action.reason.includes("Label is missing"),
      ),
    ).toBe(true);
    expect(triage.commentPreview.body).toContain(
      "<!-- open-maintainer:issue-triage -->",
    );
    expect(triage.commentPreview.body).toContain(
      "Minimal reproduction or exact expected behavior",
    );
    expect(triage.commentPreview.body.toLowerCase()).not.toContain("used ai");
    const ghCalls = await readFile(fakeGh.callsPath, "utf8");
    expect(ghCalls).not.toContain("--method");
  });

  it("requires label application before creating missing labels", async () => {
    const fixture = await createTriageRepo();

    const result = await runCli([
      "triage",
      "issue",
      fixture,
      "--number",
      "42",
      "--model",
      "codex",
      "--allow-model-content-transfer",
      "--create-labels",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--create-labels requires --apply-labels");
  });

  it("creates missing issue labels and applies labels only when requested", async () => {
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
        "--apply-labels",
        "--create-labels",
      ],
      { ...fakeCodex.env, ...fakeGh.env },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const artifact = JSON.parse(
      await readFile(
        path.join(fixture, ".open-maintainer/triage/issues/42.json"),
        "utf8",
      ),
    );
    const triage = IssueTriageResultSchema.parse(artifact.result);
    expect(
      triage.writeActions.some(
        (action) =>
          action.type === "create_label" &&
          action.status === "applied" &&
          action.target === "open-maintainer/needs-validation",
      ),
    ).toBe(true);
    expect(
      triage.writeActions.some(
        (action) =>
          action.type === "apply_label" &&
          action.status === "skipped" &&
          action.target === "open-maintainer/needs-author-input",
      ),
    ).toBe(true);
    expect(
      triage.writeActions.some(
        (action) =>
          action.type === "apply_label" &&
          action.status === "applied" &&
          action.target === "open-maintainer/needs-validation",
      ),
    ).toBe(true);
    const ghCalls = await readFile(fakeGh.callsPath, "utf8");
    expect(ghCalls).toContain("repos/acme/triage-fixture/labels");
    expect(ghCalls).toContain("repos/acme/triage-fixture/issues/42/labels");
    expect(ghCalls).not.toContain("/pulls/");
  });

  it("posts a marked deterministic issue triage comment only when requested", async () => {
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
        "--post-comment",
      ],
      { ...fakeCodex.env, ...fakeGh.env },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const artifact = JSON.parse(
      await readFile(
        path.join(fixture, ".open-maintainer/triage/issues/42.json"),
        "utf8",
      ),
    );
    const triage = IssueTriageResultSchema.parse(artifact.result);
    expect(
      triage.writeActions.some(
        (action) =>
          action.type === "post_comment" && action.status === "applied",
      ),
    ).toBe(true);
    expect(triage.commentPreview.body).toContain("Requested Author Actions");
    expect(triage.commentPreview.body.toLowerCase()).not.toContain(
      "authorship",
    );
    const ghCalls = await readFile(fakeGh.callsPath, "utf8");
    expect(ghCalls).toContain("repos/acme/triage-fixture/issues/42/comments");
    expect(ghCalls).toContain("--method");
    expect(ghCalls).toContain("POST");
  });

  it("updates an existing marked issue triage comment instead of duplicating", async () => {
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
        "--post-comment",
      ],
      {
        ...fakeCodex.env,
        ...fakeGh.env,
        OPEN_MAINTAINER_FAKE_EXISTING_TRIAGE_COMMENT: "1",
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const artifact = JSON.parse(
      await readFile(
        path.join(fixture, ".open-maintainer/triage/issues/42.json"),
        "utf8",
      ),
    );
    const triage = IssueTriageResultSchema.parse(artifact.result);
    expect(
      triage.writeActions.some(
        (action) =>
          action.type === "update_comment" && action.status === "applied",
      ),
    ).toBe(true);
    const ghCalls = await readFile(fakeGh.callsPath, "utf8");
    expect(ghCalls).toContain("repos/acme/triage-fixture/issues/comments/901");
    expect(ghCalls).toContain("PATCH");
  });

  it("skips issue closure without both CLI and config approval", async () => {
    const fixture = await createTriageRepo();
    const fakeCodex = await createFakeCodexCli();
    const fakeGh = await createFakeGhCli();

    const withoutFlag = await runCli(
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
        OPEN_MAINTAINER_FAKE_CODEX_ISSUE_TRIAGE: "spam",
      },
    );

    expect(withoutFlag.exitCode).toBe(0);
    expect(withoutFlag.stdout).toContain(
      "Closure action: skipped issue:42 (Closure requires explicit --close-allowed.)",
    );

    const withoutConfig = await runCli(
      [
        "triage",
        "issue",
        fixture,
        "--number",
        "42",
        "--model",
        "codex",
        "--allow-model-content-transfer",
        "--close-allowed",
      ],
      {
        ...fakeCodex.env,
        ...fakeGh.env,
        OPEN_MAINTAINER_FAKE_CODEX_ISSUE_TRIAGE: "spam",
      },
    );

    expect(withoutConfig.exitCode).toBe(0);
    expect(withoutConfig.stdout).toContain(
      "Closure action: skipped issue:42 (Closure requires .open-maintainer.yml issueTriage.closure config.)",
    );
    const ghCalls = await readFile(fakeGh.callsPath, "utf8");
    expect(ghCalls).not.toContain('"PATCH"');
    expect(ghCalls).not.toContain(
      'repos/acme/triage-fixture/issues/42","--method',
    );
  });

  it("closes possible spam only after posting the configured public comment", async () => {
    const fixture = await createTriageRepo();
    await writeClosureConfig(fixture, {
      allowPossibleSpam: true,
      maxClosuresPerRun: 1,
      requireCommentBeforeClose: true,
    });
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
        "--post-comment",
        "--close-allowed",
      ],
      {
        ...fakeCodex.env,
        ...fakeGh.env,
        OPEN_MAINTAINER_FAKE_CODEX_ISSUE_TRIAGE: "spam",
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Classification: possible_spam");
    expect(result.stdout).toContain("Closure action: applied issue:42");
    const artifact = JSON.parse(
      await readFile(
        path.join(fixture, ".open-maintainer/triage/issues/42.json"),
        "utf8",
      ),
    );
    const triage = IssueTriageResultSchema.parse(artifact.result);
    expect(
      triage.writeActions.some(
        (action) =>
          action.type === "post_comment" && action.status === "applied",
      ),
    ).toBe(true);
    expect(
      triage.writeActions.some(
        (action) =>
          action.type === "close_issue" && action.status === "applied",
      ),
    ).toBe(true);
    const ghCalls = await readFile(fakeGh.callsPath, "utf8");
    expect(ghCalls).toContain("repos/acme/triage-fixture/issues/42/comments");
    expect(ghCalls).toContain("repos/acme/triage-fixture/issues/42");
    expect(ghCalls).toContain("PATCH");
  });

  it("requires the configured public comment before issue closure", async () => {
    const fixture = await createTriageRepo();
    await writeClosureConfig(fixture, {
      allowPossibleSpam: true,
      maxClosuresPerRun: 1,
      requireCommentBeforeClose: true,
    });
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
        "--close-allowed",
      ],
      {
        ...fakeCodex.env,
        ...fakeGh.env,
        OPEN_MAINTAINER_FAKE_CODEX_ISSUE_TRIAGE: "spam",
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "Closure action: skipped issue:42 (Closure requires a posted or updated public triage comment.)",
    );
    const ghCalls = await readFile(fakeGh.callsPath, "utf8");
    expect(ghCalls).not.toContain('"PATCH"');
  });

  it("does not close fresh needs-author-input issues", async () => {
    const fixture = await createTriageRepo();
    await writeClosureConfig(fixture, {
      allowStaleAuthorInput: true,
      staleAuthorInputDays: 14,
      maxClosuresPerRun: 1,
      requireCommentBeforeClose: true,
    });
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
        "--post-comment",
        "--close-allowed",
      ],
      { ...fakeCodex.env, ...fakeGh.env },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "Closure action: skipped issue:42 (needs_author_input issue is not stale enough to close.)",
    );
    const artifact = JSON.parse(
      await readFile(
        path.join(fixture, ".open-maintainer/triage/issues/42.json"),
        "utf8",
      ),
    );
    const triage = IssueTriageResultSchema.parse(artifact.result);
    expect(
      triage.writeActions.some(
        (action) =>
          action.type === "close_issue" &&
          action.status === "skipped" &&
          action.reason.includes("not stale enough"),
      ),
    ).toBe(true);
  });

  it("closes stale needs-author-input issues when guardrails pass", async () => {
    const fixture = await createTriageRepo();
    await writeClosureConfig(fixture, {
      allowStaleAuthorInput: true,
      staleAuthorInputDays: 14,
      maxClosuresPerRun: 1,
      requireCommentBeforeClose: true,
    });
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
        "--post-comment",
        "--close-allowed",
      ],
      {
        ...fakeCodex.env,
        ...fakeGh.env,
        OPEN_MAINTAINER_FAKE_ISSUE_42_UPDATED_AT: "2026-04-01T00:01:00.000Z",
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Closure action: applied issue:42");
    const artifact = JSON.parse(
      await readFile(
        path.join(fixture, ".open-maintainer/triage/issues/42.json"),
        "utf8",
      ),
    );
    const triage = IssueTriageResultSchema.parse(artifact.result);
    expect(
      triage.writeActions.some(
        (action) =>
          action.type === "close_issue" && action.status === "applied",
      ),
    ).toBe(true);
    const ghCalls = await readFile(fakeGh.callsPath, "utf8");
    expect(ghCalls).toContain("repos/acme/triage-fixture/issues/42");
    expect(ghCalls).toContain("PATCH");
  });

  it("enforces the configured closure cap across batch triage", async () => {
    const fixture = await createTriageRepo();
    await writeClosureConfig(fixture, {
      allowPossibleSpam: true,
      maxClosuresPerRun: 1,
      requireCommentBeforeClose: false,
    });
    const fakeCodex = await createFakeCodexCli();
    const fakeGh = await createFakeGhCli();

    const result = await runCli(
      [
        "triage",
        "issues",
        fixture,
        "--state",
        "open",
        "--limit",
        "2",
        "--model",
        "codex",
        "--allow-model-content-transfer",
        "--close-allowed",
      ],
      {
        ...fakeCodex.env,
        ...fakeGh.env,
        OPEN_MAINTAINER_FAKE_CODEX_ISSUE_TRIAGE: "spam",
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const issue42 = IssueTriageResultSchema.parse(
      JSON.parse(
        await readFile(
          path.join(fixture, ".open-maintainer/triage/issues/42.json"),
          "utf8",
        ),
      ).result,
    );
    const issue43 = IssueTriageResultSchema.parse(
      JSON.parse(
        await readFile(
          path.join(fixture, ".open-maintainer/triage/issues/43.json"),
          "utf8",
        ),
      ).result,
    );
    expect(
      issue42.writeActions.some(
        (action) =>
          action.type === "close_issue" && action.status === "applied",
      ),
    ).toBe(true);
    expect(
      issue43.writeActions.some(
        (action) =>
          action.type === "close_issue" &&
          action.status === "skipped" &&
          action.reason.includes("Closure cap reached"),
      ),
    ).toBe(true);
    const ghCalls = await readFile(fakeGh.callsPath, "utf8");
    expect(
      ghCalls
        .split("\n")
        .filter((line) => line.includes("repos/acme/triage-fixture/issues/42"))
        .filter((line) => line.includes('"PATCH"')).length,
    ).toBe(1);
    expect(
      ghCalls
        .split("\n")
        .filter((line) => line.includes("repos/acme/triage-fixture/issues/43"))
        .filter((line) => line.includes('"PATCH"')).length,
    ).toBe(0);
  });

  it("runs bounded batch triage with grouped reports and per-issue errors", async () => {
    const fixture = await createTriageRepo();
    const fakeCodex = await createFakeCodexCli();
    const fakeGh = await createFakeGhCli();

    const result = await runCli(
      [
        "triage",
        "issues",
        fixture,
        "--state",
        "open",
        "--limit",
        "3",
        "--label",
        "enhancement",
        "--model",
        "codex",
        "--allow-model-content-transfer",
      ],
      {
        ...fakeCodex.env,
        ...fakeGh.env,
        OPEN_MAINTAINER_FAKE_CODEX_ISSUE_TRIAGE: "mixed",
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Issues: 3 (state=open, limit=3)");
    expect(result.stdout.indexOf("## Ready for review")).toBeLessThan(
      result.stdout.indexOf("## Needs author input"),
    );
    expect(result.stdout).toContain("#44 Ready batch issue");
    expect(result.stdout).toContain("#43 Invalid model issue: error:");
    const jsonPath = result.stdout
      .split("\n")
      .find((line) => line.startsWith("JSON report: "))
      ?.replace("JSON report: ", "");
    const markdownPath = result.stdout
      .split("\n")
      .find((line) => line.startsWith("Markdown report: "))
      ?.replace("Markdown report: ", "");
    expect(jsonPath).toBeTruthy();
    expect(markdownPath).toBeTruthy();
    const report = JSON.parse(
      await readFile(path.join(fixture, jsonPath as string), "utf8"),
    );
    expect(report.limit).toBe(3);
    expect(report.label).toBe("enhancement");
    expect(
      report.issues.map((issue: { issueNumber: number }) => issue.issueNumber),
    ).toEqual([42, 43, 44]);
    expect(
      report.issues.find(
        (issue: { issueNumber: number }) => issue.issueNumber === 43,
      ).status,
    ).toBe("failed");
    expect(
      report.issues.find(
        (issue: { issueNumber: number }) => issue.issueNumber === 44,
      ).classification,
    ).toBe("ready_for_review");
    const markdown = await readFile(
      path.join(fixture, markdownPath as string),
      "utf8",
    );
    expect(markdown).toContain("## Ready for review");
    expect(markdown).toContain("## Errors");
    expect(
      await readFile(
        path.join(fixture, ".open-maintainer/triage/issues/42.json"),
        "utf8",
      ),
    ).toContain("needs_author_input");
    await expect(
      readFile(
        path.join(fixture, ".open-maintainer/triage/issues/45.json"),
        "utf8",
      ),
    ).rejects.toThrow();
    const ghCalls = await readFile(fakeGh.callsPath, "utf8");
    expect(ghCalls).toContain("state=open");
    expect(ghCalls).toContain("per_page=3");
    expect(ghCalls).toContain("labels=enhancement");
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
