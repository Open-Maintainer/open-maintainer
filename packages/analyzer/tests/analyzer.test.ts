import { describe, expect, it } from "vitest";
import { analyzeRepo } from "../src";

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
        {
          path: "package.json",
          content: JSON.stringify({
            scripts: { test: "bun test", build: "tsc -b" },
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
  });
});
