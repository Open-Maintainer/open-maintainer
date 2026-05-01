import { type NextRequest, NextResponse } from "next/server";

const serverApiBaseUrl =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:4000";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const repoRoot = String(form.get("repoRoot") ?? "").trim();
  if (!repoRoot) {
    return redirectHome(request, { localRepoError: "missing-path" });
  }

  const response = await fetch(`${serverApiBaseUrl}/repos/local`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repoRoot }),
  });
  if (!response.ok) {
    return redirectHome(request, { localRepoError: String(response.status) });
  }

  const payload = (await response.json()) as { repo?: { id?: unknown } };
  const repoId = typeof payload.repo?.id === "string" ? payload.repo.id : null;
  return redirectHome(request, repoId ? { repo: repoId } : {});
}

function redirectHome(
  request: NextRequest,
  params: Record<string, string>,
): NextResponse {
  const url = new URL("/", request.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url, { status: 303 });
}
