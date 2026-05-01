import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeRepo, scanRepository } from "@open-maintainer/analyzer";
import { compareProfileDrift } from "@open-maintainer/context";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function analyzeFixture(name: string) {
  const fixtureRoot = path.join(repoRoot, "tests/fixtures", name);
  const files = await scanRepository(fixtureRoot);
  return analyzeRepo({
    repoId: name,
    owner: "demo",
    name,
    defaultBranch: "main",
    version: 1,
    files,
  });
}

describe("v0.2 readiness quality fixtures", () => {
  it("covers high-readiness, low-readiness, and missing-context cases", async () => {
    const high = await analyzeFixture("high-readiness-ts");
    const low = await analyzeFixture("low-context-ts");
    const missingContext = await analyzeFixture("missing-context-ts");

    expect(high.agentReadiness.score).toBe(100);
    expect(
      high.agentReadiness.categories.map((category) => category.name),
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
    expect(high.environmentVariables).toEqual(["DATABASE_URL"]);
    expect(high.environmentFiles).toEqual([".env.example"]);
    expect(high.ownershipHints).toEqual(["CODEOWNERS"]);

    expect(low.agentReadiness.score).toBeLessThan(
      missingContext.agentReadiness.score,
    );
    expect(missingContext.agentReadiness.score).toBeLessThan(
      high.agentReadiness.score,
    );
    expect(missingContext.agentReadiness.missingItems).toContain(
      "agent instructions: AGENTS.md or CLAUDE.md is missing.",
    );
    expect(missingContext.agentReadiness.missingItems).toContain(
      "agent instructions: Repo-local skills are missing.",
    );
    expect(missingContext.agentReadiness.missingItems).toContain(
      "generated-file handling: .open-maintainer.yml policy file is missing.",
    );
  });

  it("identifies changed drift surfaces instead of only profile hash drift", async () => {
    const fixtureRoot = path.join(repoRoot, "tests/fixtures/high-readiness-ts");
    const files = await scanRepository(fixtureRoot);
    const stored = await analyzeFixture("high-readiness-ts");
    const packageJson = files.find((file) => file.path === "package.json");
    if (!packageJson) {
      throw new Error("fixture package.json was not scanned");
    }
    const manifest = JSON.parse(packageJson.content) as {
      scripts: Record<string, string>;
    };
    manifest.scripts.typecheck = "tsc --noEmit";
    const current = analyzeRepo({
      repoId: "high-readiness-ts",
      owner: "demo",
      name: "high-readiness-ts",
      defaultBranch: "main",
      version: 2,
      files: files.map((file) =>
        file.path === "package.json"
          ? {
              ...file,
              content: `${JSON.stringify(manifest, null, 2)}\n`,
            }
          : file,
      ),
    });

    expect(compareProfileDrift({ stored, current })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          group: "commands",
          changeType: "added",
          path: "package.json",
          subject: "package.json script typecheck",
          currentValue: "tsc --noEmit",
        }),
      ]),
    );
  });

  it("keeps roadmap v0.2 completion evidence present in the repository", async () => {
    const roadmap = await readFile(
      path.join(repoRoot, "docs/ROADMAP.md"),
      "utf8",
    );

    expect(roadmap).toContain(
      "representative fixtures cover high-readiness, low-readiness, drift, and missing-context cases",
    );
  });
});
