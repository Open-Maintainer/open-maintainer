import type { NextRequest } from "next/server";
import { redirectToDashboard } from "../redirect";

const serverApiBaseUrl =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:4000";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const repoRoot = String(form.get("repoRoot") ?? "").trim();
  if (!repoRoot) {
    return redirectToDashboard(request, { localRepoError: "missing-path" });
  }

  const response = await fetch(`${serverApiBaseUrl}/repos/local`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repoRoot }),
  });
  if (!response.ok) {
    return redirectToDashboard(request, {
      localRepoError: String(response.status),
    });
  }

  const payload = (await response.json()) as { repo?: { id?: unknown } };
  const repoId = typeof payload.repo?.id === "string" ? payload.repo.id : null;
  return redirectToDashboard(request, repoId ? { repo: repoId } : {});
}
