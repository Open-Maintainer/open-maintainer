import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  ArtifactTypeSchema,
  type GeneratedArtifact,
  type RepoProfile,
  contextArtifactPathOrSelf,
  contextArtifactPathsForTargets,
  contextArtifactSlug,
} from "@open-maintainer/shared";
import type { ReviewPromptContext } from "./model";

type ReviewPromptContextKey = keyof ReviewPromptContext;

type ReviewPromptContextCandidate = {
  key: ReviewPromptContextKey;
  path: string;
  fallbackPath?: string;
};

export type ReviewPromptContextSource = "repo" | "artifacts" | "both";

export type LoadReviewPromptContextInput = {
  profile: Pick<RepoProfile, "name">;
  repoRoot?: string | null;
  worktreeRoot?: string | null;
  artifacts?: readonly GeneratedArtifact[];
  readRepoFile?: (repoPath: string) => Promise<string | undefined>;
  includeGeneratedInstructionArtifacts?: boolean;
  includeGenericSkillFallbacks?: boolean;
  generatedContextPaths?: readonly string[];
  generatedContextSource?: ReviewPromptContextSource;
};

export async function loadReviewPromptContext(
  input: LoadReviewPromptContextInput,
): Promise<{ context: ReviewPromptContext; paths: string[] }> {
  const repoRoot = input.repoRoot ?? input.worktreeRoot ?? null;
  const readRepoFile =
    input.readRepoFile ??
    (repoRoot
      ? (repoPath: string) => readOptionalRepoFile(repoRoot, repoPath)
      : async () => undefined);
  const artifactLookup = artifactLookupFromList(input.artifacts ?? []);
  const paths: string[] = [];

  const readContext = async (
    repoPath: string,
    options: {
      fallbackPath?: string;
      source?: ReviewPromptContextSource;
    } = {},
  ) => {
    const source = options.source ?? "both";
    if (source === "repo" || source === "both") {
      const content = await readRepoFile(repoPath);
      if (content) {
        paths.push(repoPath);
        return content;
      }
    }
    if (source === "artifacts" || source === "both") {
      const artifactContent = artifactLookup(repoPath);
      if (artifactContent) {
        paths.push(repoPath);
        return artifactContent;
      }
      if (options.fallbackPath) {
        const fallbackContent = artifactLookup(options.fallbackPath);
        if (fallbackContent) {
          paths.push(options.fallbackPath);
          return fallbackContent;
        }
      }
    }
    if (
      options.fallbackPath &&
      options.fallbackPath !== repoPath &&
      (source === "repo" || source === "both")
    ) {
      const fallbackContent = await readRepoFile(options.fallbackPath);
      if (fallbackContent) {
        paths.push(options.fallbackPath);
        return fallbackContent;
      }
    }
    return undefined;
  };

  const context: ReviewPromptContext = {};
  for (const candidate of reviewPromptContextCandidates(input)) {
    const content = await readContext(candidate.path, {
      ...(candidate.fallbackPath
        ? { fallbackPath: candidate.fallbackPath }
        : {}),
    });
    if (content) {
      context[candidate.key] = content;
    }
  }

  const generatedContext = (
    await Promise.all(
      (
        input.generatedContextPaths ??
        contextArtifactPathsForTargets({
          repoName: input.profile.name,
          targets: ["report"],
        })
      ).map((artifactPath) =>
        readContext(artifactPath, {
          source: input.generatedContextSource ?? "repo",
        }),
      ),
    )
  )
    .filter((content): content is string => Boolean(content))
    .join("\n\n---\n\n");
  if (generatedContext) {
    context.generatedContext = generatedContext;
  }

  return { context, paths };
}

function reviewPromptContextCandidates(
  input: Pick<
    LoadReviewPromptContextInput,
    | "profile"
    | "includeGeneratedInstructionArtifacts"
    | "includeGenericSkillFallbacks"
  >,
): ReviewPromptContextCandidate[] {
  const repoSlug = contextArtifactSlug(input.profile.name);
  const artifactPath = (type: string) =>
    contextArtifactPathOrSelf(ArtifactTypeSchema.parse(type));
  const skillPath = (name: string) =>
    artifactPath(`.agents/skills/${repoSlug}-${name}/SKILL.md`);
  const genericSkillPath = (name: string) =>
    input.includeGenericSkillFallbacks
      ? artifactPath(`.agents/skills/${name}/SKILL.md`)
      : undefined;
  const skillCandidate = (
    key: ReviewPromptContextKey,
    repoPath: string,
    fallbackPath: string | undefined,
  ): ReviewPromptContextCandidate =>
    fallbackPath
      ? { key, path: repoPath, fallbackPath }
      : { key, path: repoPath };
  const generatedInstructionPaths = contextArtifactPathsForTargets({
    repoName: input.profile.name,
    targets: ["copilot", "cursor"],
  });
  const copilotInstructionsPath = generatedInstructionPaths[0];
  const cursorRulePath = generatedInstructionPaths[1];
  if (!copilotInstructionsPath || !cursorRulePath) {
    throw new Error("Generated review instruction artifact paths are missing.");
  }
  return [
    { key: "openMaintainerConfig", path: artifactPath(".open-maintainer.yml") },
    { key: "agentsMd", path: artifactPath("AGENTS.md") },
    skillCandidate(
      "repoPrReviewSkill",
      skillPath("pr-review"),
      genericSkillPath("pr-review"),
    ),
    skillCandidate(
      "repoTestingWorkflowSkill",
      skillPath("testing-workflow"),
      genericSkillPath("testing-workflow"),
    ),
    skillCandidate(
      "repoOverviewSkill",
      skillPath("start-task"),
      genericSkillPath("repo-overview"),
    ),
    ...(input.includeGeneratedInstructionArtifacts
      ? [
          {
            key: "copilotInstructions" as const,
            path: copilotInstructionsPath,
          },
          {
            key: "cursorRule" as const,
            path: cursorRulePath,
          },
        ]
      : []),
  ];
}

function artifactLookupFromList(artifacts: readonly GeneratedArtifact[]) {
  const latest = [...artifacts].reverse();
  return (artifactType: string) =>
    latest.find((artifact) => artifact.type === artifactType)?.content ??
    latest.find(
      (artifact) =>
        typeof artifact.type === "string" &&
        artifact.type.endsWith(`/${artifactType}`),
    )?.content;
}

async function readOptionalRepoFile(
  repoRoot: string,
  repoPath: string,
): Promise<string | undefined> {
  return readFile(path.join(repoRoot, repoPath), "utf8").catch(() => undefined);
}
