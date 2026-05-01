import { type NextRequest, NextResponse } from "next/server";

const serverApiBaseUrl =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:4000";

const actionPathByType = {
  analyze: "analyze",
  generateContext: "generate-context",
  openContextPr: "open-context-pr",
} as const;

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const repoId = String(form.get("repoId") ?? "").trim();
  const actionType = String(form.get("actionType") ?? "");
  const actionPath =
    actionPathByType[actionType as keyof typeof actionPathByType];

  if (repoId && actionPath) {
    await fetch(
      `${serverApiBaseUrl}/repos/${encodeURIComponent(repoId)}/${actionPath}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
    ).catch(() => undefined);
  }

  const url = new URL("/", request.url);
  if (repoId) {
    url.searchParams.set("repo", repoId);
  }
  return NextResponse.redirect(url, { status: 303 });
}
