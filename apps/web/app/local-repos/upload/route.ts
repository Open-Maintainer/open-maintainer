import { type NextRequest, NextResponse } from "next/server";
import { dashboardApi } from "../../dashboard-api";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as unknown;
  const response = await fetch(dashboardApi.url("/repos/local-files"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as unknown;
  return NextResponse.json(payload, { status: response.status });
}
