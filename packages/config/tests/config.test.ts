import { describe, expect, it } from "vitest";
import {
  parseOpenMaintainerConfig,
  stringifyOpenMaintainerConfig,
} from "../src";

describe(".open-maintainer.yml config", () => {
  it("round-trips valid MVP config", () => {
    const source = stringifyOpenMaintainerConfig({
      version: 1,
      repo: { profileVersion: 2, defaultBranch: "main" },
      rules: ["Run bun test before finishing."],
      generated: {
        by: "open-maintainer",
        artifactVersion: 3,
        generatedAt: "2026-04-30T00:00:00.000Z",
      },
    });

    expect(parseOpenMaintainerConfig(source).generated.artifactVersion).toBe(3);
  });
});
