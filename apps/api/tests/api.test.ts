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
                summary: "LLM summary for the demo repository.",
                qualityRules: ["Use Bun and inspect repo evidence."],
                commands: ["test: bun test"],
                notes: ["No special risks in the demo fixture."],
              })
            : JSON.stringify({
                agentsMd:
                  "# AGENTS.md instructions for demo-org/demo-repo\n\nLLM-generated repository instructions with Bun, Fastify, Next.js, and CI context.",
                copilotInstructions:
                  "# Copilot instructions for demo-org/demo-repo\n\nUse Bun scripts and inspect package manifests before editing.",
                cursorRule:
                  "---\ndescription: demo repo rules\nalwaysApply: true\n---\n\nUse generated repo evidence and Bun quality gates.",
                repoOverviewSkill:
                  "---\nname: repo-overview\ndescription: Use for demo-org/demo-repo overview.\n---\n\n# Repo Overview\n\nLLM-generated overview.",
                testingWorkflowSkill:
                  "---\nname: testing-workflow\ndescription: Use for demo-org/demo-repo testing.\n---\n\n# Testing Workflow\n\nRun Bun tests.",
                prReviewSkill:
                  "---\nname: pr-review\ndescription: Use for demo-org/demo-repo PR review.\n---\n\n# PR Review\n\nCheck generated context.",
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
    expect(generated.json().artifacts).toHaveLength(9);
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
