import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

const app = buildApp();

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("MVP API", () => {
  it("reports service health and worker heartbeat", async () => {
    await app.inject({ method: "POST", url: "/worker/heartbeat" });
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json().worker).toBe("ok");
  });

  it("rate-limits repo actions that can use GitHub installation authorization", async () => {
    await expectPostRouteIsRateLimited("/repos/missing/analyze");
    await expectPostRouteIsRateLimited("/repos/missing/open-context-pr");
  });

  it("accepts browser form submissions for dashboard actions", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/repos/repo_demo/open-context-pr",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "",
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("No repo profile available.");
  });

  it("accepts CLI model providers for dashboard setup", async () => {
    const codex = await app.inject({
      method: "POST",
      url: "/model-providers",
      payload: {
        kind: "codex-cli",
        displayName: "Codex CLI",
        baseUrl: "http://localhost",
        model: "codex-cli",
        apiKey: "local-cli",
        repoContentConsent: true,
      },
    });
    expect(codex.statusCode).toBe(200);
    expect(codex.json().provider.kind).toBe("codex-cli");
    expect(codex.json().provider.repoContentConsent).toBe(true);

    const claude = await app.inject({
      method: "POST",
      url: "/model-providers",
      payload: {
        kind: "claude-cli",
        displayName: "Claude CLI",
        baseUrl: "http://localhost",
        model: "claude-cli",
        apiKey: "local-cli",
        repoContentConsent: true,
      },
    });
    expect(claude.statusCode).toBe(200);
    expect(claude.json().provider.kind).toBe("claude-cli");
  });

  it("registers a local filesystem repository for dashboard selection", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/repos/local",
      payload: { repoRoot: `${process.cwd()}/tests/fixtures/low-context-ts` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().repo.id).toBe("local_fixtures_low_context_ts");
    expect(response.json().files).toBeGreaterThan(0);

    const analysis = await app.inject({
      method: "POST",
      url: "/repos/local_fixtures_low_context_ts/analyze",
    });
    expect(analysis.statusCode).toBe(200);
    expect(analysis.json().profile.name).toBe("low-context-ts");
  });

  it("registers browser-uploaded repository files for dashboard selection", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/repos/local-files",
      payload: {
        name: "uploaded-tool",
        files: [
          {
            path: "package.json",
            content: JSON.stringify({
              scripts: { test: "bun test" },
              dependencies: { fastify: "latest" },
            }),
          },
          { path: "README.md", content: "# Uploaded Tool\n" },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().repo.id).toBe("local_local_uploaded_tool");

    const analysis = await app.inject({
      method: "POST",
      url: "/repos/local_local_uploaded_tool/analyze",
    });
    expect(analysis.statusCode).toBe(200);
    expect(analysis.json().profile.frameworks).toContain("fastify");
  });

  it("persists verified GitHub installation webhooks and exposes repos", async () => {
    const payload = JSON.stringify({
      installation: {
        id: 99,
        account: { login: "acme", type: "Organization" },
        repository_selection: "selected",
        permissions: { contents: "write" },
      },
      repositories: [
        { id: 100, name: "tool", full_name: "acme/tool", private: false },
      ],
    });
    const signature = `sha256=${createHmac("sha256", "dev-webhook-secret").update(payload).digest("hex")}`;

    const webhook = await app.inject({
      method: "POST",
      url: "/github/webhook",
      headers: {
        "x-hub-signature-256": signature,
        "content-type": "application/json",
      },
      payload,
    });
    const repos = await app.inject({ method: "GET", url: "/repos" });

    expect(webhook.statusCode).toBe(200);
    expect(
      repos
        .json()
        .repos.some(
          (repo: { fullName: string }) => repo.fullName === "acme/tool",
        ),
    ).toBe(true);
  });

  it("runs analysis, requires consented LLM generation, then creates artifacts and a PR", async () => {
    const analysis = await app.inject({
      method: "POST",
      url: "/repos/repo_demo/analyze",
    });
    expect(analysis.statusCode).toBe(200);
    expect(analysis.json().profile.version).toBe(1);
    expect(analysis.json().profile.agentReadiness.score).toBeGreaterThan(0);

    const providerWithoutConsent = await app.inject({
      method: "POST",
      url: "/model-providers",
      payload: {
        kind: "local-openai-compatible",
        displayName: "Local mock",
        baseUrl: "http://localhost:11434/v1",
        model: "llama3.1",
        apiKey: "dev",
        repoContentConsent: false,
      },
    });
    const blocked = await app.inject({
      method: "POST",
      url: "/repos/repo_demo/generate-context",
      payload: { providerId: providerWithoutConsent.json().provider.id },
    });
    expect(blocked.statusCode).toBe(403);
    const retry = await app.inject({
      method: "POST",
      url: `/runs/${blocked.json().run.id}/retry`,
    });
    expect(retry.json().run.status).toBe("queued");

    const providerCalls: string[] = [];
    const server = createServer((request, response) => {
      request.on("data", (chunk) => providerCalls.push(String(chunk)));
      request.on("end", () => {
        const content =
          providerCalls.length === 1
            ? JSON.stringify({
                summary:
                  "demo-org/demo-repo is a Bun TypeScript repository inferred from the analyzed profile.",
                evidenceMap: [
                  {
                    claim: "Bun commands are available.",
                    evidence: ["package.json"],
                    confidence: "observed",
                  },
                ],
                repositoryMap: [
                  {
                    path: "apps",
                    purpose: "Application workspace paths.",
                    evidence: ["architecturePathGroups"],
                    confidence: "inferred",
                  },
                ],
                commands: [
                  {
                    name: "test",
                    command: "bun test",
                    scope: "tests",
                    source: "package.json",
                    purpose: "Run tests.",
                    confidence: "observed",
                  },
                ],
                setup: {
                  requirements: [
                    {
                      claim: "Use Bun for dependency and script commands.",
                      evidence: ["packageManager"],
                      confidence: "observed",
                    },
                  ],
                  unknowns: ["No environment example was detected."],
                },
                architecture: {
                  observed: [],
                  inferred: [
                    {
                      claim: "Application paths appear under apps.",
                      evidence: ["architecturePathGroups"],
                      confidence: "inferred",
                    },
                  ],
                  unknowns: ["Detailed data flow was not detected."],
                },
                changeRules: {
                  safeEditZones: [],
                  carefulEditZones: [
                    {
                      claim:
                        "Lockfiles require dependency-change justification.",
                      evidence: ["lockfiles"],
                      confidence: "inferred",
                    },
                  ],
                  doNotEditWithoutExplicitInstruction: [],
                  unknowns: ["Ownership boundaries were not detected."],
                },
                testingStrategy: {
                  locations: [],
                  commands: [
                    {
                      name: "test",
                      command: "bun test",
                      scope: "tests",
                      source: "package.json",
                      purpose: "Run tests.",
                      confidence: "observed",
                    },
                  ],
                  namingConventions: [],
                  regressionExpectations: [
                    "Add regression tests for behavior changes.",
                  ],
                  unknowns: ["Test naming conventions were not detected."],
                },
                validation: {
                  canonicalCommand: {
                    name: "test",
                    command: "bun test",
                    scope: "tests",
                    source: "package.json",
                    purpose: "Run tests.",
                    confidence: "observed",
                  },
                  scopedCommands: [],
                  unknowns: [],
                },
                prRules: ["Include test evidence in PR notes."],
                knownPitfalls: [],
                generatedFiles: [],
                highRiskAreas: [],
                documentationAlignment: [],
                unknowns: ["No PR template was detected."],
              })
            : providerCalls.length === 2
              ? JSON.stringify({
                  agentsMd:
                    "# AGENTS.md instructions for demo-org/demo-repo\n\nLLM-generated repository instructions with Bun, Fastify, Next.js, and CI context.",
                  claudeMd:
                    "# CLAUDE.md instructions for demo-org/demo-repo\n\nLLM-generated repository instructions with Bun, Fastify, Next.js, and CI context.",
                  copilotInstructions:
                    "# Copilot instructions for demo-org/demo-repo\n\nUse Bun scripts and inspect package manifests before editing.",
                  cursorRule:
                    "---\ndescription: demo repo rules\nalwaysApply: true\n---\n\nUse generated repo evidence and Bun quality gates.",
                })
              : JSON.stringify({
                  skills: [
                    {
                      path: ".agents/skills/demo-repo-start-task/SKILL.md",
                      name: "demo-repo-start-task",
                      description:
                        "Use before making bounded changes in demo-org/demo-repo.",
                      markdown:
                        "---\nname: demo-repo-start-task\ndescription: Use before making bounded changes in demo-org/demo-repo.\n---\n\n# Demo Repo Start Task\n\n## Use when\n- Starting a code or docs change.\n\n## Do not use when\n- Reviewing a PR.\n\n## Read first\n- README.md\n\n## Workflow\n- Inspect the changed surface.\n\n## Validation\n- Run bun test.\n\n## Documentation\n- Check README.md.\n\n## Risk checks\n- Keep generated context scoped.\n\n## Done when\n- Commands run are reported.",
                    },
                    {
                      path: ".agents/skills/demo-repo-testing-workflow/SKILL.md",
                      name: "demo-repo-testing-workflow",
                      description:
                        "Use when selecting validation for demo-org/demo-repo.",
                      markdown:
                        "---\nname: demo-repo-testing-workflow\ndescription: Use when selecting validation for demo-org/demo-repo.\n---\n\n# Demo Repo Testing Workflow\n\n## Use when\n- Tests or validation are changing.\n\n## Do not use when\n- Reviewing a PR.\n\n## Read first\n- package.json\n\n## Workflow\n- Map the changed surface to commands.\n\n## Validation\n- Run bun test.\n\n## Documentation\n- Check README.md.\n\n## Risk checks\n- Do not skip risky behavior tests.\n\n## Done when\n- Validation evidence is reported.",
                    },
                    {
                      path: ".agents/skills/demo-repo-pr-review/SKILL.md",
                      name: "demo-repo-pr-review",
                      description:
                        "Use when reviewing pull requests for demo-org/demo-repo.",
                      markdown:
                        "---\nname: demo-repo-pr-review\ndescription: Use when reviewing pull requests for demo-org/demo-repo.\n---\n\n# Demo Repo PR Review\n\n## Use when\n- Reviewing a completed diff.\n\n## Do not use when\n- Implementing the change.\n\n## Read first\n- The PR diff.\n\n## Workflow\n- Lead with correctness and security findings.\n\n## Validation\n- Check bun test evidence.\n\n## Documentation\n- Check README.md changes.\n\n## Risk checks\n- Watch generated context writes.\n\n## Done when\n- Findings and residual risks are clear.",
                    },
                  ],
                });
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ choices: [{ message: { content } }] }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected provider test server port");
    }
    const consentedProvider = await app.inject({
      method: "POST",
      url: "/model-providers",
      payload: {
        kind: "local-openai-compatible",
        displayName: "Consented local mock",
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        model: "mock-model",
        apiKey: "dev",
        repoContentConsent: true,
      },
    });

    const generated = await app.inject({
      method: "POST",
      url: "/repos/repo_demo/generate-context",
      payload: { providerId: consentedProvider.json().provider.id },
    });
    server.close();
    expect(generated.statusCode).toBe(200);
    expect(generated.json().artifacts).toHaveLength(7);
    expect(generated.json().artifacts[0].content).toContain("LLM-generated");

    const pr = await app.inject({
      method: "POST",
      url: "/repos/repo_demo/open-context-pr",
      payload: {},
    });
    expect(pr.statusCode).toBe(200);
    expect(pr.json().contextPr.branchName).toBe("open-maintainer/context-1");
  });
});

async function expectPostRouteIsRateLimited(url: string): Promise<void> {
  const limitedApp = buildApp();
  await limitedApp.ready();
  try {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await limitedApp.inject({ method: "POST", url });
      expect(response.statusCode).not.toBe(429);
    }

    const response = await limitedApp.inject({ method: "POST", url });
    expect(response.statusCode).toBe(429);
  } finally {
    await limitedApp.close();
  }
}
