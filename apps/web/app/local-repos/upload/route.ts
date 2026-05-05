import { RepositoryUploadRequestSchema } from "@open-maintainer/shared";
import { type NextRequest, NextResponse } from "next/server";
import { dashboardApi } from "../../dashboard-api";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as unknown;
  const parsed = RepositoryUploadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid repository upload payload." },
      { status: 422 },
    );
  }
  const response = await dashboardApi.postJson<{ repo?: { id?: unknown } }>(
    "/repos/local-files",
    parsed.data,
  );
  return response.ok
    ? NextResponse.json(response.payload, { status: response.status })
    : NextResponse.json(
        { error: response.actionError },
        { status: response.status ?? 502 },
      );
}
