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

  it("parses supported issue triage closure guardrails", () => {
    const config = parseOpenMaintainerConfig(`
version: 1
repo:
  profileVersion: 2
  defaultBranch: main
rules: []
issueTriage:
  closure:
    allowPossibleSpam: true
    allowStaleAuthorInput: true
    staleAuthorInputDays: 21
    maxClosuresPerRun: 3
    requireCommentBeforeClose: true
generated:
  by: open-maintainer
  artifactVersion: 3
  generatedAt: "2026-04-30T00:00:00.000Z"
`);

    expect(config.issueTriage?.closure.maxClosuresPerRun).toBe(3);
    expect(config.issueTriage?.closure.staleAuthorInputDays).toBe(21);
  });

  it("rejects invalid issue triage closure config values", () => {
    expect(() =>
      parseOpenMaintainerConfig(`
version: 1
repo:
  profileVersion: 2
  defaultBranch: main
issueTriage:
  closure:
    maxClosuresPerRun: -1
generated:
  by: open-maintainer
  artifactVersion: 3
  generatedAt: "2026-04-30T00:00:00.000Z"
`),
    ).toThrow();
  });
});
