import type {
  ModelProviderConfig,
  ModelProviderKind,
} from "@open-maintainer/shared";
import {
  ModelProviderConfigSchema,
  newId,
  nowIso,
} from "@open-maintainer/shared";

export type CompletionInput = {
  system: string;
  user: string;
};

export type CompletionOutput = {
  text: string;
  model: string;
  tokenUsage?: {
    input: number;
    output: number;
  };
};

export interface ModelProvider {
  complete(input: CompletionInput): Promise<CompletionOutput>;
}

export type ProviderSettingsInput = {
  kind: ModelProviderKind;
  displayName: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  repoContentConsent: boolean;
};

export function createProviderConfig(
  input: ProviderSettingsInput,
): ModelProviderConfig {
  const timestamp = nowIso();
  return ModelProviderConfigSchema.parse({
    id: newId("model_provider"),
    kind: input.kind,
    displayName: input.displayName,
    baseUrl: input.baseUrl,
    model: input.model,
    encryptedApiKey: encryptForLocalDev(input.apiKey),
    repoContentConsent: input.repoContentConsent,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function assertGenerationAllowed(
  provider: ModelProviderConfig | null,
): asserts provider is ModelProviderConfig {
  if (!provider) {
    throw new Error(
      "Generation is blocked until a model provider is configured.",
    );
  }
  if (!provider.repoContentConsent) {
    throw new Error(
      "Generation is blocked until repo-content consent is enabled for this provider.",
    );
  }
}

export function assertProviderConsent(
  provider: ModelProviderConfig,
): asserts provider is ModelProviderConfig {
  if (!provider.repoContentConsent) {
    throw new Error(
      "Generation is blocked until repo-content consent is enabled for this provider.",
    );
  }
}

export function buildProvider(config: ModelProviderConfig): ModelProvider {
  return {
    async complete(input) {
      const response = await fetch(
        `${config.baseUrl.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${decryptForLocalDev(config.encryptedApiKey)}`,
          },
          body: JSON.stringify({
            model: config.model,
            messages: [
              { role: "system", content: input.system },
              { role: "user", content: input.user },
            ],
            stream: false,
          }),
        },
      );
      if (!response.ok) {
        throw new Error(`Provider request failed with HTTP ${response.status}`);
      }
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      return {
        text: data.choices?.[0]?.message?.content ?? "",
        model: config.model,
        tokenUsage: {
          input: data.usage?.prompt_tokens ?? 0,
          output: data.usage?.completion_tokens ?? 0,
        },
      };
    },
  };
}

export async function testProviderConnection(
  provider: ModelProvider,
): Promise<CompletionOutput> {
  return provider.complete({
    system: "You are testing connectivity for Open Maintainer.",
    user: "Reply with only: ok",
  });
}

export function redactSecret(value: string): string {
  if (value.length <= 8) {
    return "[redacted]";
  }
  return `${value.slice(0, 4)}...[redacted]...${value.slice(-4)}`;
}

function encryptForLocalDev(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function decryptForLocalDev(value: string): string {
  return Buffer.from(value, "base64").toString("utf8");
}
