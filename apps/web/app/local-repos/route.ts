import type { NextRequest } from "next/server";
import { dashboardApi } from "../dashboard-api";
import { redirectToDashboard } from "../redirect";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const repoRoot = String(form.get("repoRoot") ?? "").trim();
  if (!repoRoot) {
    return redirectToDashboard(request, { localRepoError: "missing-path" });
  }

  const response = await dashboardApi.postJson<{ repo?: { id?: unknown } }>(
    "/repos/local",
    { repoRoot },
  );
  if (!response.ok) {
    const localRepoError =
      response.status === null ? response.actionError : String(response.status);
    return redirectToDashboard(request, {
      localRepoError,
    });
  }

  const payload = response.payload;
  const repoId = typeof payload.repo?.id === "string" ? payload.repo.id : null;
  return redirectToDashboard(request, repoId ? { repo: repoId } : {});
}
