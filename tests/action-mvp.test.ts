import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function readYaml(relativePath: string) {
  return parse(await readFile(path.join(repoRoot, relativePath), "utf8"));
}

describe("GitHub Action MVP", () => {
  it("runs audit mode from the packaged action without default repository mutation", async () => {
    const action = await readYaml("action.yml");
    const steps = action.runs.steps;

    expect(action.name).toBe("Open Maintainer");
    expect(action.inputs["fail-on-score-below"].default).toBe("0");
    expect(action.inputs["report-path"].default).toBe(
      "$RUNNER_TEMP/open-maintainer-report.md",
    );

    expect(steps).toContainEqual(
      expect.objectContaining({
        name: "Set up Bun",
        uses: "oven-sh/setup-bun@v2",
      }),
    );
    expect(steps).toContainEqual(
      expect.objectContaining({
        name: "Install dependencies",
        "working-directory": "${{ github.action_path }}",
        run: "bun install --frozen-lockfile",
      }),
    );

    const auditStep = steps.find(
      (step: { name?: string }) => step.name === "Run audit",
    );
    expect(auditStep.run).toContain(
      'bun run --cwd "$GITHUB_ACTION_PATH" cli audit "$GITHUB_WORKSPACE"',
    );
    expect(auditStep.run).toContain("--no-profile-write");
    expect(auditStep.run).toContain(
      '--report-path "${{ inputs.report-path }}"',
    );
  });

  it("detects drift and supports optional pull request comments", async () => {
    const action = await readYaml("action.yml");
    const steps = action.runs.steps;

    expect(action.inputs["fail-on-drift"].default).toBe("false");
    expect(action.inputs["comment-on-pr"].default).toBe("false");

    const doctorStep = steps.find(
      (step: { name?: string }) => step.name === "Run drift check",
    );
    expect(doctorStep.run).toContain(
      'bun run --cwd "$GITHUB_ACTION_PATH" cli doctor "$GITHUB_WORKSPACE"',
    );
    expect(doctorStep.run).toContain("missing:*|drift:*");
    expect(doctorStep.run).toContain("::warning title=Open Maintainer::");

    expect(steps).toContainEqual(
      expect.objectContaining({
        name: "Compute base readiness",
        if: "${{ github.event_name == 'pull_request' }}",
      }),
    );
    expect(steps).toContainEqual(
      expect.objectContaining({
        name: "Comment on pull request",
        if: "${{ inputs.comment-on-pr == 'true' && github.event_name == 'pull_request' }}",
        uses: "actions/github-script@v7",
      }),
    );
  });

  it("dogfoods the public workflow shape", async () => {
    const workflow = await readYaml(
      ".github/workflows/open-maintainer-audit.yml",
    );
    const steps = workflow.jobs.audit.steps;

    expect(workflow.on).toEqual({
      pull_request: null,
      workflow_dispatch: null,
    });
    expect(steps).toContainEqual({ uses: "actions/checkout@v4" });
    expect(steps).toContainEqual(
      expect.objectContaining({
        uses: "./",
        with: {
          mode: "audit",
          "fail-on-score-below": "60",
        },
      }),
    );
    expect(steps).not.toContainEqual(
      expect.objectContaining({ uses: "oven-sh/setup-bun@v2" }),
    );
  });
});

describe("Quality workflows", () => {
  it("runs the root quality gates in CI", async () => {
    const workflow = await readYaml(".github/workflows/ci.yml");

    expect(Object.keys(workflow.jobs).sort()).toEqual([
      "build",
      "lint",
      "smoke-mvp",
      "test",
      "typecheck",
    ]);
    expect(workflow.jobs.lint.steps).toContainEqual({ run: "bun lint" });
    expect(workflow.jobs.typecheck.steps).toContainEqual({
      run: "bun typecheck",
    });
    expect(workflow.jobs.test.steps).toContainEqual({ run: "bun test" });
    expect(workflow.jobs.build.steps).toContainEqual({ run: "bun run build" });
    expect(workflow.jobs["smoke-mvp"].steps).toContainEqual({
      run: "bun run smoke:mvp",
    });
  });

  it("keeps stack and security checks in dedicated workflows", async () => {
    const compose = await readYaml(".github/workflows/compose-smoke.yml");
    const codeql = await readYaml(".github/workflows/codeql.yml");
    const dependencyReview = await readYaml(
      ".github/workflows/dependency-review.yml",
    );

    expect(compose.jobs["compose-smoke"].steps).toContainEqual({
      name: "Run compose smoke",
      run: "bun run smoke:compose",
    });
    expect(codeql.jobs.analyze.steps).toContainEqual(
      expect.objectContaining({
        uses: "github/codeql-action/analyze@v3",
      }),
    );
    expect(dependencyReview.jobs["dependency-review"].steps).toContainEqual(
      expect.objectContaining({
        uses: "actions/dependency-review-action@v4",
        with: {
          "fail-on-severity": "high",
        },
      }),
    );
  });
});

describe("Docker Compose MVP", () => {
  it("installs dependencies once before starting app services", async () => {
    const compose = await readYaml("docker-compose.yml");
    const services = compose.services;

    expect(services.deps).toEqual(
      expect.objectContaining({
        image: "oven/bun:1",
        working_dir: "/app",
        command: "bun install --frozen-lockfile",
      }),
    );
    expect(services.deps.volumes).toContain("node_modules:/app/node_modules");
    expect(compose.volumes).toHaveProperty("node_modules");

    for (const serviceName of ["api", "worker", "web"]) {
      const service = services[serviceName];

      expect(service.command).not.toContain("bun install");
      expect(service.volumes).toContain("node_modules:/app/node_modules");
    }

    expect(services.api.depends_on.deps).toEqual({
      condition: "service_completed_successfully",
    });
  });
});
