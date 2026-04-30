import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertGenerationAllowed,
  buildClaudeCliProvider,
  buildCodexCliProvider,
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

  it("runs Codex CLI provider through a schema-constrained output file", async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "codex-provider-test-"),
    );
    const command = path.join(directory, "fake-codex.js");
    await writeFile(
      command,
      `#!/usr/bin/env node
const fs = require("node:fs");
const outputIndex = process.argv.indexOf("--output-last-message");
const outputPath = process.argv[outputIndex + 1];
fs.writeFileSync(outputPath, JSON.stringify({ ok: true, source: "codex" }));
`,
    );
    await chmod(command, 0o755);

    const result = await buildCodexCliProvider({
      command,
      cwd: directory,
      outputSchema: {
        type: "object",
        required: ["ok", "source"],
        properties: { ok: { type: "boolean" }, source: { type: "string" } },
      },
    }).complete({ system: "Return JSON.", user: "Use schema." });

    expect(JSON.parse(result.text)).toEqual({ ok: true, source: "codex" });
    expect(result.model).toBe("codex-cli");
  });

  it("runs Claude CLI provider through schema-constrained print mode", async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "claude-provider-test-"),
    );
    const command = path.join(directory, "fake-claude.js");
    await writeFile(
      command,
      `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ ok: true, source: "claude" }));
`,
    );
    await chmod(command, 0o755);

    const result = await buildClaudeCliProvider({
      command,
      cwd: directory,
      outputSchema: {
        type: "object",
        required: ["ok", "source"],
        properties: { ok: { type: "boolean" }, source: { type: "string" } },
      },
    }).complete({ system: "Return JSON.", user: "Use schema." });

    expect(JSON.parse(result.text)).toEqual({ ok: true, source: "claude" });
    expect(result.model).toBe("claude-cli");
  });
});
