import type { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { redirectToDashboard } from "../apps/web/app/redirect";

describe("dashboard redirects", () => {
  it("caps query parameters so action errors cannot overflow headers", () => {
    const request = new Request(
      "http://0.0.0.0:3000/repo-actions",
    ) as NextRequest;
    const response = redirectToDashboard(request, {
      repo: "repo_demo",
      actionError: `422:${"Codex CLI failed ".repeat(1_000)}`,
    });
    const location = response.headers.get("location");
    if (!location) {
      throw new Error("Expected redirect location");
    }
    const url = new URL(location);

    expect(response.status).toBe(303);
    expect(url.origin).toBe("http://localhost:3000");
    expect(url.searchParams.get("repo")).toBe("repo_demo");
    expect(url.searchParams.get("actionError")?.length).toBeLessThanOrEqual(
      500,
    );
    expect(url.searchParams.get("actionError")).toMatch(/\.\.\.$/);
    expect(location.length).toBeLessThan(800);
  });
});
