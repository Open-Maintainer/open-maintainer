import type { NextRequest } from "next/server";
import { redirectToDashboard } from "../redirect";

const serverApiBaseUrl =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:4000";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const repoId = String(form.get("repoId") ?? "").trim();
  const reviewId = String(form.get("reviewId") ?? "").trim();
  const findingId = String(form.get("findingId") ?? "").trim();
  const verdict = String(form.get("verdict") ?? "").trim();
  const reason = String(form.get("reason") ?? "").trim();
  let actionError: string | undefined;

  if (!reviewId || !findingId || !verdict) {
    actionError = "invalid-feedback";
  } else {
    try {
      const response = await fetch(
        `${serverApiBaseUrl}/reviews/${encodeURIComponent(reviewId)}/feedback`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            findingId,
            verdict,
            ...(reason ? { reason } : {}),
            actor: "dashboard",
          }),
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
  if (actionError) {
    params.actionError = actionError;
  }
  return redirectToDashboard(request, params);
}
