import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertGenerationAllowed,
  buildProvider,
  createProviderConfig,
  testProviderConnection,
} from "../src";

let server: ReturnType<typeof createServer> | null = null;

afterEach(() => {
  server?.close();
  server = null;
});

describe("AI providers", () => {
  it("validates provider config and guards generation consent", () => {
    const provider = createProviderConfig({
      kind: "openai-compatible",
      displayName: "Local",
      baseUrl: "http://localhost:11434/v1",
      model: "llama3.1",
      apiKey: "dev-key",
      repoContentConsent: false,
    });

    expect(() => assertGenerationAllowed(null)).toThrow(/blocked/);
    expect(() => assertGenerationAllowed(provider)).toThrow(/consent/);
  });

  it("tests a local OpenAI-compatible mock without repo content", async () => {
    const bodies: string[] = [];
    server = createServer((request, response) => {
      request.on("data", (chunk) => bodies.push(String(chunk)));
      request.on("end", () => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        );
      });
    });
    await new Promise<void>((resolve) => server?.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected local test server port");
    }
    const config = createProviderConfig({
      kind: "local-openai-compatible",
      displayName: "Mock",
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      model: "mock-model",
      apiKey: "test",
      repoContentConsent: true,
    });

    const result = await testProviderConnection(buildProvider(config));

    expect(result.text).toBe("ok");
    expect(bodies.join("\n")).not.toContain("repo profile");
    expect(bodies.join("\n")).not.toContain("source code");
  });
});
