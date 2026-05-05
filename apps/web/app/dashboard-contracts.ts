export const repoActionPathByType = {
  analyze: "analyze",
  generateContext: "generate-context",
  openContextPr: "open-context-pr",
  createReview: "reviews",
} as const;

export type RepoActionType = keyof typeof repoActionPathByType;

export const dashboardProviderPresets = {
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

export type DashboardProviderType = keyof typeof dashboardProviderPresets;

export function repoActionType(value: string): RepoActionType | null {
  return value in repoActionPathByType ? (value as RepoActionType) : null;
}

export function repoActionRequiresProvider(
  actionType: RepoActionType,
): boolean {
  return actionType === "generateContext" || actionType === "createReview";
}

export function repoActionPayload(input: {
  actionType: RepoActionType;
  providerId?: string;
  context?: string;
  skills?: string;
  baseRef?: string;
  headRef?: string;
  prNumber?: string;
}): Record<string, unknown> {
  if (input.actionType === "generateContext") {
    return {
      ...(input.providerId ? { providerId: input.providerId } : {}),
      async: true,
      ...(input.context ? { context: input.context } : {}),
      ...(input.skills ? { skills: input.skills } : {}),
    };
  }
  if (input.actionType === "createReview") {
    return {
      ...(input.baseRef ? { baseRef: input.baseRef } : {}),
      ...(input.headRef ? { headRef: input.headRef } : {}),
      ...(input.prNumber ? { prNumber: Number(input.prNumber) } : {}),
      ...(input.providerId ? { providerId: input.providerId } : {}),
    };
  }
  return {};
}

export function providerPreset(
  value: string,
): (typeof dashboardProviderPresets)[DashboardProviderType] | null {
  return value in dashboardProviderPresets
    ? dashboardProviderPresets[value as DashboardProviderType]
    : null;
}
