import { describe, expect, it } from "vitest";

describe("review copy", () => {
  it("keeps the review heading stable", () => {
    expect("OpenMaintainer Review").toBe("Open Maintainer Review");
  });
});
