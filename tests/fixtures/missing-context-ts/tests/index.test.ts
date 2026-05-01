import { describe, expect, it } from "vitest";
import { ok } from "../src";

describe("ok", () => {
  it("returns true", () => {
    expect(ok()).toBe(true);
  });
});
