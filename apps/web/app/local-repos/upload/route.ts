import { type NextRequest, NextResponse } from "next/server";

const serverApiBaseUrl =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:4000";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as unknown;
  const response = await fetch(`${serverApiBaseUrl}/repos/local-files`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as unknown;
  return NextResponse.json(payload, { status: response.status });
}
