import type { NextRequest } from "next/server";
import { dashboardApi } from "../dashboard-api";
import { redirectToDashboard } from "../redirect";

const actionPathByType = {
  analyze: "analyze",
  generateContext: "generate-context",
  openContextPr: "open-context-pr",
  createReview: "reviews",
} as const;

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const repoId = String(form.get("repoId") ?? "").trim();
  const providerId = String(form.get("providerId") ?? "").trim();
  const context = String(form.get("context") ?? "").trim();
  const skills = String(form.get("skills") ?? "").trim();
  const baseRef = String(form.get("baseRef") ?? "").trim();
  const headRef = String(form.get("headRef") ?? "").trim();
  const prNumber = String(form.get("prNumber") ?? "").trim();
  const actionType = String(form.get("actionType") ?? "");
  const actionPath =
    actionPathByType[actionType as keyof typeof actionPathByType];
  let actionError: string | undefined;

  if (!repoId || !actionPath) {
    actionError = "invalid-action";
  } else if (
    (actionType === "generateContext" || actionType === "createReview") &&
    !providerId
  ) {
    actionError = "missing-provider";
  } else {
    const result = await dashboardApi.postJson(
      `/repos/${encodeURIComponent(repoId)}/${actionPath}`,
      actionType === "generateContext"
        ? {
            ...(providerId ? { providerId } : {}),
            async: true,
            ...(context ? { context } : {}),
            ...(skills ? { skills } : {}),
          }
        : actionType === "createReview"
          ? {
              ...(baseRef ? { baseRef } : {}),
              ...(headRef ? { headRef } : {}),
              ...(prNumber ? { prNumber: Number(prNumber) } : {}),
              ...(providerId ? { providerId } : {}),
            }
          : {},
    );
    if (!result.ok) {
      actionError = result.actionError;
    }
  }

  const params: Record<string, string> = {};
  if (repoId) {
    params.repo = repoId;
  }
  if (providerId) {
    params.providerId = providerId;
  }
  if (actionError) {
    params.actionError = actionError;
  }
  return redirectToDashboard(request, params);
}
