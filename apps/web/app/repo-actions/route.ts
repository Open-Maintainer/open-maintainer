import type { NextRequest } from "next/server";
import { redirectToDashboard } from "../redirect";

const serverApiBaseUrl =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:4000";

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
    try {
      const response = await fetch(
        `${serverApiBaseUrl}/repos/${encodeURIComponent(repoId)}/${actionPath}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
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
          ),
        },
      );
      if (!response.ok) {
        actionError = String(response.status);
        const payload = (await response.json().catch(() => ({}))) as {
          error?: unknown;
        };
        if (typeof payload.error === "string") {
          actionError = `${actionError}:${payload.error}`;
        }
      }
    } catch {
      actionError = "unreachable";
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
