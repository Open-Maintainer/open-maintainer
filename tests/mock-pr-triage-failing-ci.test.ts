import { describe, expect, it } from "vitest";

describe("mock PR triage failing CI fixture", () => {
  it("intentionally fails so PR labelling can detect failed checks", () => {
    expect("failed-check-gate").toBe("ready");
  });
});
