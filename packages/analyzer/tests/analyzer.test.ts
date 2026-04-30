import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeRepo, scanRepository } from "../src";

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
        { path: "bun.lock", content: "" },
        {
          path: "apps/web/app/page.tsx",
          content: "export default function Page() {}",
        },
        { path: ".github/workflows/ci.yml", content: "name: CI" },
      ],
    });

    expect(profile.packageManager).toBe("bun");
    expect(profile.primaryLanguages).toContain("TypeScript");
    expect(profile.frameworks).toContain("next");
    expect(profile.commands.map((command) => command.name)).toContain("test");
    expect(profile.evidence.map((item) => item.path)).toContain("README.md");
    expect(profile.workspaceManifests).toEqual(["package.json"]);
    expect(profile.lockfiles).toEqual(["bun.lock"]);
    expect(profile.agentReadiness.score).toBeGreaterThan(40);
    expect(profile.agentReadiness.missingItems).toContain(
      "agent instructions: AGENTS.md is missing.",
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
    await writeFile(path.join(root, "node_modules/pkg/index.js"), "ignored");

    const files = await scanRepository(root);

    expect(files.map((file) => file.path).sort()).toEqual([
      "README.md",
      "package.json",
      "src/index.ts",
    ]);
  });
});
