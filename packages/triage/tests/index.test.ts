import { describe, expect, it } from "vitest";
import {
  mapIssueTriageLabelIntents,
  parseIssueTriageModelResult,
  safeParseIssueTriageModelResult,
} from "../src";
import * as triage from "../src";

const validModelResult = {
  classification: "needs_maintainer_design",
  agentReadiness: "needs_human_design",
  confidence: 0.84,
  riskFlags: ["broad_scope"],
  labelIntents: ["needs_maintainer_design", "needs_human_design"],
  recommendation: "Ask a maintainer to make the product decision first.",
  rationale: "The issue requests a roadmap choice without acceptance criteria.",
  evidence: [
    {
      source: "github_issue",
      path: null,
      url: "https://github.com/Open-Maintainer/open-maintainer/issues/10",
      excerpt: "Decide what the dashboard should do here.",
      reason: "The issue asks for a design decision.",
    },
  ],
  missingInformation: ["Maintainer-approved desired behavior"],
  requiredAuthorActions: [],
  nextAction: "Route to maintainer design before implementation.",
  commentPreview: {
    marker: "<!-- open-maintainer:issue-triage -->",
    summary: "Needs maintainer design.",
    body: "This needs a maintainer decision before implementation.",
    artifactPath: ".open-maintainer/triage/issues/10.json",
  },
};

describe("issue triage package", () => {
  it("validates model output without assigning a classification", () => {
    expect(parseIssueTriageModelResult(validModelResult).classification).toBe(
      "needs_maintainer_design",
    );
    expect(
      safeParseIssueTriageModelResult({
        ...validModelResult,
        classification: "looks_good",
      }).success,
    ).toBe(false);
  });

  it("maps known label intents to default or configured issue labels", () => {
    expect(
      mapIssueTriageLabelIntents(["needs_author_input", "security_sensitive"]),
    ).toEqual([
      {
        intent: "needs_author_input",
        label: "open-maintainer/needs-author-input",
      },
      {
        intent: "security_sensitive",
        label: "open-maintainer/security-sensitive",
      },
    ]);

    expect(
      mapIssueTriageLabelIntents(["needs_author_input"], {
        needs_author_input: "needs-info",
      }),
    ).toEqual([{ intent: "needs_author_input", label: "needs-info" }]);
  });

  it("does not expose a deterministic issue quality classifier", () => {
    expect(Object.keys(triage).some((name) => /^classify/i.test(name))).toBe(
      false,
    );
  });
});
