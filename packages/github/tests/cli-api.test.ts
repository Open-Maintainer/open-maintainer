import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createGitHubCliApi, gitHubCliEnv } from "../src";

describe("GitHub CLI API adapter", () => {
  it("executes GET API calls through one JSON boundary", async () => {
    const observedCalls: string[][] = [];
    const api = createGitHubCliApi({
      repoRoot: "/repo",
      async execGh(args) {
        observedCalls.push([...args]);
        return JSON.stringify([{ name: "triaged" }]);
      },
    });

    await expect(
      api.json("repos/acme/tool/labels?per_page=100"),
    ).resolves.toEqual([{ name: "triaged" }]);
    expect(observedCalls).toEqual([
      ["api", "repos/acme/tool/labels?per_page=100", "--method", "GET"],
    ]);
  });

  it("passes JSON request bodies through temporary gh input files", async () => {
    const api = createGitHubCliApi({
      repoRoot: "/repo",
      async execGh(args) {
        const inputIndex = args.indexOf("--input");
        const inputPath = inputIndex >= 0 ? args[inputIndex + 1] : null;
        if (!inputPath) {
          throw new Error("missing --input");
        }
        await expect(readFile(inputPath, "utf8")).resolves.toBe(
          JSON.stringify({ labels: ["agent-ready"] }),
        );
        return JSON.stringify({ ok: true });
      },
    });

    await expect(
      api.jsonWithBody("repos/acme/tool/issues/1/labels", "POST", {
        labels: ["agent-ready"],
      }),
    ).resolves.toEqual({ ok: true });
  });

  it("removes ambient GitHub tokens outside CI unless explicitly allowed", () => {
    expect(
      gitHubCliEnv({
        GH_TOKEN: "secret",
        GITHUB_TOKEN: "secret",
      }).GH_TOKEN,
    ).toBeUndefined();
    expect(
      gitHubCliEnv({
        CI: "true",
        GH_TOKEN: "secret",
      }).GH_TOKEN,
    ).toBe("secret");
    expect(
      gitHubCliEnv({
        OPEN_MAINTAINER_USE_ENV_GH_TOKEN: "1",
        GITHUB_TOKEN: "secret",
      }).GITHUB_TOKEN,
    ).toBe("secret");
  });
});
