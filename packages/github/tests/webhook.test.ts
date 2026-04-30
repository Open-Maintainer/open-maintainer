import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createContextBranchName,
  mapInstallationEvent,
  renderContextPrBody,
  verifyWebhookSignature,
} from "../src";

describe("github helpers", () => {
  it("verifies GitHub webhook signatures", () => {
    const payload = JSON.stringify({ action: "created" });
    const secret = "webhook-secret";
    const signature256 = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;

    expect(verifyWebhookSignature({ secret, payload, signature256 })).toBe(
      true,
    );
    expect(
      verifyWebhookSignature({
        secret,
        payload,
        signature256: signature256.replace(/.$/, "0"),
      }),
    ).toBe(false);
  });

  it("maps installation events to persisted records", () => {
    const mapped = mapInstallationEvent({
      installation: {
        id: 42,
        account: { login: "acme", type: "Organization" },
        repository_selection: "selected",
        permissions: { contents: "write" },
      },
      repositories: [
        {
          id: 10,
          name: "tool",
          full_name: "acme/tool",
          private: false,
          default_branch: "trunk",
        },
      ],
    });

    expect(mapped.installation.accountLogin).toBe("acme");
    expect(mapped.repos[0]?.defaultBranch).toBe("trunk");
  });

  it("renders predictable branch names and PR body metadata", () => {
    expect(createContextBranchName(3, 1)).toBe("open-maintainer/context-3-2");
    const body = renderContextPrBody({
      repoProfileVersion: 3,
      artifacts: [
        {
          id: "artifact_1",
          repoId: "repo_1",
          type: "AGENTS.md",
          version: 4,
          content: "test",
          sourceProfileVersion: 3,
          modelProvider: "local",
          model: "llama",
          createdAt: "2026-04-30T00:00:00.000Z",
        },
      ],
      modelProvider: "local",
      model: "llama",
      runReference: "run_1",
      generatedAt: "2026-04-30T00:00:00.000Z",
    });

    expect(body).toContain("Repo profile version: v3");
    expect(body).toContain("AGENTS.md");
  });
});
