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
    expect(action.inputs.mode.default).toBe("audit");
    expect(action.inputs["fail-on-score-below"].default).toBe("0");
    expect(action.inputs["report-path"].default).toBe(
      "$RUNNER_TEMP/open-maintainer-report.md",
    );
    expect(action.inputs["generation-provider"].default).toBe("codex");
    expect(action.inputs["allow-model-content-transfer"].default).toBe("false");
    expect(action.inputs["review-provider"]).toBeUndefined();
    expect(action.inputs["allow-review-content-transfer"]).toBeUndefined();
    expect(action.inputs["review-comment-on-pr"]).toBeUndefined();
    expect(action.inputs["review-inline-comments"]).toBeUndefined();
    expect(action.inputs["issue-apply-labels"].default).toBe("false");
    expect(action.inputs["issue-post-comment"].default).toBe("false");
    expect(action.inputs["issue-close-allowed"].default).toBe("false");

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

  it("detects drift and publishes summaries with optional pull request comments", async () => {
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
    const summaryStep = steps.find(
      (step: { name?: string }) => step.name === "Render action summary",
    );
    expect(summaryStep.run).toContain("$GITHUB_STEP_SUMMARY");
    expect(summaryStep.run).toContain("### Changed Surface");
    expect(summaryStep.run).toContain("### Likely Tests");
    expect(summaryStep.run).toContain("### Docs Impact");
    expect(summaryStep.run).toContain("### Missing Validation Evidence");
    expect(summaryStep.run).toContain("### Refresh Recommendation");
    expect(summaryStep.run).toContain(
      "bun run cli generate . --model codex --context codex --skills codex --allow-write --refresh-generated",
    );
    expect(summaryStep.run).toContain("bun run cli doctor .");

    expect(steps).toContainEqual(
      expect.objectContaining({
        name: "Comment on pull request",
        if: "${{ inputs.comment-on-pr == 'true' && github.event_name == 'pull_request' }}",
        uses: "actions/github-script@v8",
      }),
    );
  });

  it("requires explicit refresh mode and model-backed consent before write paths", async () => {
    const action = await readYaml("action.yml");
    const steps = action.runs.steps;

    const validateStep = steps.find(
      (step: { name?: string }) => step.name === "Validate inputs",
    );
    expect(validateStep.run).toContain("audit|refresh|issue-triage");
    expect(validateStep.run).toContain("Unsupported mode");
    expect(validateStep.run).toContain(
      "Refresh requires allow-model-content-transfer",
    );
    expect(validateStep.run).not.toContain("Review requires");
    expect(validateStep.run).not.toContain(
      "Review inline comments are not implemented yet",
    );
    expect(validateStep.run).toContain(
      "Issue triage requires allow-model-content-transfer",
    );
    expect(validateStep.run).toContain(
      "Issue triage mode is for issue, schedule, or workflow_dispatch events",
    );
    expect(validateStep.run).toContain(
      "issue-create-labels requires issue-apply-labels",
    );

    const refreshStep = steps.find(
      (step: { name?: string }) => step.name === "Generate refresh artifacts",
    );
    expect(refreshStep.if).toBe("${{ inputs.mode == 'refresh' }}");
    expect(refreshStep.run).toContain("--refresh-generated");
    expect(refreshStep.run).toContain("--model");
    expect(refreshStep.run).toContain("--allow-write");

    const prStep = steps.find(
      (step: { name?: string }) => step.name === "Open refresh pull request",
    );
    expect(prStep.if).toBe("${{ inputs.mode == 'refresh' }}");
    expect(prStep.run).toContain('"context-pr"');
    expect(prStep.run).toContain("--refresh-branch");
    expect(prStep.run).toContain("--base-ref");
    expect(prStep.run).toContain("--audit-summary-path");
    expect(prStep.run).not.toContain("git push origin main");
  });

  it("adds explicit issue triage mode with read-only defaults and opt-in writes", async () => {
    const action = await readYaml("action.yml");
    const steps = action.runs.steps;

    expect(action.inputs["issue-number"].default).toBe("");
    expect(action.inputs["issue-state"].default).toBe("open");
    expect(action.inputs["issue-limit"].default).toBe("10");
    expect(action.inputs["issue-label"].default).toBe("");
    expect(action.outputs["issue-triage-output"].value).toBe(
      "${{ steps.issue-triage.outputs.output-path }}",
    );

    const triageStep = steps.find(
      (step: { name?: string }) => step.name === "Run issue triage",
    );
    expect(triageStep.if).toBe("${{ inputs.mode == 'issue-triage' }}");
    expect(triageStep.run).toContain('args=("triage")');
    expect(triageStep.run).toContain('"issue" "$GITHUB_WORKSPACE"');
    expect(triageStep.run).toContain('"issues" "$GITHUB_WORKSPACE"');
    expect(triageStep.run).toContain("--allow-model-content-transfer");
    expect(triageStep.run).toContain("--apply-labels");
    expect(triageStep.run).toContain("--create-labels");
    expect(triageStep.run).toContain("--post-comment");
    expect(triageStep.run).toContain("--close-allowed");
    expect(triageStep.run).toContain("$GITHUB_STEP_SUMMARY");
  });

  it("keeps the public workflow audit-only for release dogfooding", async () => {
    const workflow = await readYaml(
      ".github/workflows/open-maintainer-audit.yml",
    );
    const auditSteps = workflow.jobs.audit.steps;

    expect(workflow.on).toEqual({
      pull_request: null,
      schedule: [{ cron: "17 9 * * 1" }],
      workflow_dispatch: null,
    });
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(auditSteps).toContainEqual({ uses: "actions/checkout@v6" });
    expect(auditSteps).toContainEqual(
      expect.objectContaining({
        uses: "./",
        with: {
          mode: "audit",
          "fail-on-drift": "true",
          "fail-on-score-below": "60",
        },
      }),
    );
    expect(auditSteps).not.toContainEqual(
      expect.objectContaining({ uses: "oven-sh/setup-bun@v2" }),
    );
    expect(workflow.jobs.review).toBeUndefined();
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
