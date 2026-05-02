import type { NextRequest } from "next/server";
import { redirectToDashboard } from "../redirect";

const serverApiBaseUrl =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:4000";

const providerPresets = {
  codex: {
    kind: "codex-cli",
    displayName: "Codex CLI",
    model: "gpt-5.5",
  },
  claude: {
    kind: "claude-cli",
    displayName: "Claude CLI",
    model: "claude-cli",
  },
} as const;

type ProviderListResponse = {
  providers?: Array<{ id?: unknown; kind?: unknown; model?: unknown }>;
};

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const repoId = String(form.get("repoId") ?? "").trim();
  const providerId = String(form.get("providerId") ?? "").trim();
  const providerType = String(form.get("providerType") ?? "");
  const preset = providerPresets[providerType as keyof typeof providerPresets];
  const requestedModel = String(form.get("model") ?? "").trim();
  const repoContentConsent = form.get("repoContentConsent") === "on";
  const targetModel = requestedModel || preset?.model;

  const params: Record<string, string> = {};
  if (repoId) {
    params.repo = repoId;
  }
  if (providerId) {
    return redirectToDashboard(request, { ...params, providerId });
  }

  if (!preset) {
    return redirectToDashboard(request, {
      ...params,
      providerError: "invalid-provider",
    });
  }
  if (!repoContentConsent) {
    return redirectToDashboard(request, {
      ...params,
      providerError: "missing-consent",
    });
  }

  try {
    const existingResponse = await fetch(`${serverApiBaseUrl}/model-providers`);
    if (existingResponse.ok) {
      const existing = (await existingResponse.json()) as ProviderListResponse;
      const matchingProvider = existing.providers?.find(
        (provider) =>
          provider.kind === preset.kind &&
          typeof provider.id === "string" &&
          provider.model === targetModel,
      );
      if (typeof matchingProvider?.id === "string") {
        return redirectToDashboard(request, {
          ...params,
          providerId: matchingProvider.id,
        });
      }
    }

    const response = await fetch(`${serverApiBaseUrl}/model-providers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...preset,
        baseUrl: "http://localhost",
        model: targetModel,
        apiKey: "local-cli",
        repoContentConsent,
      }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: unknown;
      };
      const detail = typeof payload.error === "string" ? payload.error : "";
      return redirectToDashboard(request, {
        ...params,
        providerError: detail
          ? `${response.status}:${detail}`
          : String(response.status),
      });
    }
    const payload = (await response.json()) as { provider?: { id?: unknown } };
    if (typeof payload.provider?.id === "string") {
      params.providerId = payload.provider.id;
    }
  } catch {
    return redirectToDashboard(request, {
      ...params,
      providerError: "unreachable",
    });
  }

  return redirectToDashboard(request, params);
}
