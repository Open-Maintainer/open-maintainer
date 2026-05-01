import { type NextRequest, NextResponse } from "next/server";

export function redirectToDashboard(
  request: NextRequest,
  params: Record<string, string>,
): NextResponse {
  const url = new URL("/", dashboardOrigin(request));
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url, { status: 303 });
}

function dashboardOrigin(request: NextRequest): string {
  const requestUrl = new URL(request.url);
  const host = browserReachableHost(
    request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      requestUrl.host,
  );
  const protocol =
    request.headers.get("x-forwarded-proto") ??
    requestUrl.protocol.slice(0, -1) ??
    "http";
  return `${protocol}://${host}`;
}

function browserReachableHost(host: string): string {
  if (host.startsWith("0.0.0.0")) {
    return `localhost${host.slice("0.0.0.0".length)}`;
  }
  if (host.startsWith("[::]")) {
    return `localhost${host.slice("[::]".length)}`;
  }
  return host;
}
