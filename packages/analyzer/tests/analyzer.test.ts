import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { analyzeRepo, scanRepository } from "../src";

const execFileAsync = promisify(execFile);

describe("analyzeRepo", () => {
  it("emits a deterministic profile with evidence and commands", () => {
    const profile = analyzeRepo({
      repoId: "repo_1",
      owner: "acme",
      name: "tool",
      defaultBranch: "main",
      version: 1,
      files: [
        { path: "README.md", content: "# Tool" },
        { path: "CONTRIBUTING.md", content: "Run tests before PRs." },
        {
          path: "package.json",
          content: JSON.stringify({
            scripts: {
              test: "bun test",
              build: "tsc -b",
              lint: "biome check .",
            },
            workspaces: ["apps/*"],
            dependencies: { next: "15.0.0" },
          }),
        },
        {
          path: "packages/npm-tool/package.json",
          content: JSON.stringify({ scripts: { test: "npm test" } }),
        },
        { path: "bun.lock", content: "" },
        { path: ".gitignore", content: "dist\n.next\n" },
        { path: ".env.example", content: "DATABASE_URL=\n" },
        { path: ".github/CODEOWNERS", content: "* @acme/maintainers\n" },
        {
          path: "Makefile",
          content: "build:\n\tcd contracts && scarb build\n",
        },
        {
          path: "contracts/Scarb.toml",
          content:
            '[package]\nname = "tool"\n\n[scripts]\ntest = "snforge test"\n',
        },
        {
          path: "apps/web/app/page.tsx",
          content: "export default function Page() {}",
        },
        {
          path: "src/auth.ts",
          content: "export const auth = process.env.DATABASE_URL;",
        },
        {
          path: "scripts/deploy.sh",
          content: "echo ${GH_TOKEN:?missing} ${APP_ENV:-local}",
        },
        {
          path: "tests/auth.test.ts",
          content: "import { describe } from 'vitest';",
        },
        {
          path: "apps/web/next-env.d.ts",
          content:
            '/// <reference types="next" />\n// This file is auto-generated.\n',
        },
        { path: ".github/workflows/ci.yml", content: "name: CI" },
        {
          path: ".github/pull_request_template.md",
          content: "## Validation",
        },
        {
          path: ".claude/skills/repo-overview/SKILL.md",
          content:
            "---\nname: repo-overview\ndescription: Claude project skill.\n---\n\n# Repo Overview",
        },
      ],
    });

    expect(profile.packageManager).toBe("bun");
    expect(profile.primaryLanguages).toContain("TypeScript");
    expect(profile.frameworks).toContain("next");
    expect(profile.commands.map((command) => command.name)).toContain("test");
    expect(profile.evidence.map((item) => item.path)).toContain("README.md");
    expect(profile.workspaceManifests).toEqual(["package.json"]);
    expect(profile.lockfiles).toEqual(["bun.lock"]);
    expect(profile.trackedFileHashes.map((item) => item.path)).toContain(
      ".github/workflows/ci.yml",
    );
    expect(profile.repoTemplates).toEqual([".github/pull_request_template.md"]);
    expect(profile.riskHintPaths).toEqual(["src/auth.ts"]);
    expect(profile.ownershipHints).toEqual([".github/CODEOWNERS"]);
    expect(profile.environmentFiles).toEqual([".env.example"]);
    expect(profile.environmentVariables).toEqual([
      "APP_ENV",
      "DATABASE_URL",
      "GH_TOKEN",
    ]);
    expect(profile.ignoreFiles).toEqual([".gitignore"]);
    expect(profile.testFilePaths).toEqual(["tests/auth.test.ts"]);
    expect(profile.generatedFilePaths).toEqual(["apps/web/next-env.d.ts"]);
    expect(profile.frameworks).toContain("Scarb");
    expect(profile.commands.map((command) => command.command)).toContain(
      "make build",
    );
    expect(profile.commands.map((command) => command.command)).toContain(
      "cd contracts && snforge test",
    );
    expect(profile.commands.map((command) => command.command)).toContain(
      "cd packages/npm-tool && npm test",
    );
    expect(profile.agentReadiness.score).toBeGreaterThan(40);
    expect(
      profile.agentReadiness.categories.map((category) => category.name),
    ).toEqual([
      "setup clarity",
      "architecture clarity",
      "testing",
      "CI",
      "docs",
      "risk handling",
      "generated-file handling",
      "agent instructions",
    ]);
    expect(profile.generatedFileHints).not.toContain(
      ".claude/skills/repo-overview/SKILL.md",
    );
    expect(profile.existingContextFiles).toContain(
      ".claude/skills/repo-overview/SKILL.md",
    );
    expect(profile.agentReadiness.missingItems).toContain(
      "agent instructions: AGENTS.md or CLAUDE.md is missing.",
    );
  });

  it("scans a real filesystem repo while ignoring generated directories", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "open-maintainer-fixture-"));
    await mkdir(path.join(root, "src"), { recursive: true });
    await mkdir(path.join(root, "node_modules/pkg"), { recursive: true });
    await writeFile(path.join(root, "README.md"), "# Fixture");
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ scripts: { test: "bun test" } }),
    );
    await writeFile(path.join(root, "src/index.ts"), "export const ok = true;");
    await writeFile(path.join(root, "src/unreadable.ts"), "skip me");
    await chmod(path.join(root, "src/unreadable.ts"), 0o000);
    await writeFile(path.join(root, "node_modules/pkg/index.js"), "ignored");

    let files: Awaited<ReturnType<typeof scanRepository>> = [];
    try {
      files = await scanRepository(root);
    } finally {
      await chmod(path.join(root, "src/unreadable.ts"), 0o644);
    }

    expect(files.map((file) => file.path).sort()).toEqual([
      "README.md",
      "package.json",
      "src/index.ts",
    ]);
  });

  it("uses Git excludes when scanning a worktree", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "open-maintainer-git-"));
    const excludesPath = path.join(root, "global-ignore");
    await mkdir(path.join(root, "local-docs"), { recursive: true });
    await writeFile(path.join(root, "README.md"), "# Fixture");
    await writeFile(path.join(root, "visible.md"), "# Visible");
    await writeFile(path.join(root, "local-docs/ignored.md"), "# Local notes");
    await writeFile(excludesPath, "local-docs/\n");
    await execFileAsync("git", ["init"], { cwd: root });
    await execFileAsync("git", ["config", "core.excludesFile", excludesPath], {
      cwd: root,
    });
    await execFileAsync("git", ["add", "README.md"], { cwd: root });

    const files = await scanRepository(root);

    expect(files.map((file) => file.path).sort()).toEqual([
      "README.md",
      "visible.md",
    ]);
  });
});
