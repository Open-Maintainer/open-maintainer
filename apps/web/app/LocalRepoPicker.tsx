"use client";

import {
  type RepositoryUploadFile,
  repositoryUploadLimits,
  shouldAlwaysSkipRepositoryUploadPath,
  shouldReadRepositoryUploadPath,
} from "@open-maintainer/shared";
import { useRef, useState } from "react";

type GitignoreRule = {
  pattern: string;
  negated: boolean;
  directoryOnly: boolean;
  anchored: boolean;
};

export function LocalRepoPicker({ error }: { error?: string | undefined }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function importFiles(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }
    setStatus("Importing selected repository...");
    try {
      const selected = Array.from(files);
      const rootName = rootDirectoryName(selected);
      const gitignoreRules = await readRootGitignoreRules(selected, rootName);
      const uploaded: RepositoryUploadFile[] = [];
      for (const file of selected) {
        if (uploaded.length >= repositoryUploadLimits.maxFiles) {
          break;
        }
        const relativePath = repoRelativePath(file);
        const repoPath = stripRootDirectory(relativePath, rootName);
        if (
          !repoPath ||
          file.size > repositoryUploadLimits.maxFileBytes ||
          shouldSkipPath(repoPath, gitignoreRules) ||
          !shouldReadRepositoryUploadPath(repoPath)
        ) {
          continue;
        }
        uploaded.push({
          path: repoPath,
          content: await file.text(),
        });
      }
      if (uploaded.length === 0) {
        setStatus("No readable repository files were selected.");
        return;
      }

      const response = await fetch("/local-repos/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: rootName, files: uploaded }),
      });
      if (!response.ok) {
        setStatus("Could not import the selected repository.");
        return;
      }
      const payload = (await response.json()) as { repo?: { id?: unknown } };
      const repoId =
        typeof payload.repo?.id === "string" ? payload.repo.id : "";
      window.location.assign(
        repoId ? `/?repo=${encodeURIComponent(repoId)}` : "/",
      );
    } catch {
      setStatus("Could not import the selected repository.");
    } finally {
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  return (
    <div className="local-form">
      <form action="/local-repos" className="mounted-path-form" method="post">
        <label>
          <span>Mounted repo path</span>
          <input name="repoRoot" placeholder="/app" />
        </label>
        <button type="submit">Add mounted repo</button>
      </form>
      <input
        {...directoryInputAttributes}
        aria-label="Choose local repository"
        className="file-input"
        multiple
        onChange={(event) => void importFiles(event.currentTarget.files)}
        ref={inputRef}
        type="file"
      />
      <button type="button" onClick={() => inputRef.current?.click()}>
        Upload repo files
      </button>
      {status ? <p className="note">{status}</p> : null}
      {error ? (
        <p className="error">Could not add that local repository.</p>
      ) : null}
    </div>
  );
}

const directoryInputAttributes = {
  directory: "",
  webkitdirectory: "",
} as Record<string, string>;

function repoRelativePath(file: File): string {
  const fileWithDirectory = file as File & { webkitRelativePath?: string };
  return (fileWithDirectory.webkitRelativePath ?? file.name).replaceAll(
    "\\",
    "/",
  );
}

function rootDirectoryName(files: File[]): string {
  const firstPath = repoRelativePath(files[0] as File);
  return firstPath.split("/").filter(Boolean)[0] ?? "uploaded-repo";
}

function stripRootDirectory(relativePath: string, rootName: string): string {
  const prefix = `${rootName}/`;
  return relativePath.startsWith(prefix)
    ? relativePath.slice(prefix.length)
    : relativePath;
}

async function readRootGitignoreRules(
  files: File[],
  rootName: string,
): Promise<GitignoreRule[]> {
  const gitignore = files.find(
    (file) =>
      stripRootDirectory(repoRelativePath(file), rootName) === ".gitignore",
  );
  return gitignore ? parseGitignore(await gitignore.text()) : [];
}

function shouldSkipPath(
  relativePath: string,
  gitignoreRules: GitignoreRule[],
): boolean {
  return (
    shouldAlwaysSkipRepositoryUploadPath(relativePath) ||
    isIgnoredByGitignore(relativePath, gitignoreRules)
  );
}

function parseGitignore(content: string): GitignoreRule[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const negated = line.startsWith("!");
      const rawPattern = negated ? line.slice(1) : line;
      const anchored = rawPattern.startsWith("/");
      const directoryOnly =
        rawPattern.endsWith("/") || rawPattern.endsWith("/**");
      const pattern = rawPattern
        .replace(/^\/+/, "")
        .replace(/\/\*\*$/, "")
        .replace(/\/$/, "");
      return { pattern, negated, directoryOnly, anchored };
    })
    .filter((rule) => rule.pattern.length > 0);
}

function isIgnoredByGitignore(
  relativePath: string,
  rules: GitignoreRule[],
): boolean {
  let ignored = false;
  for (const rule of rules) {
    if (matchesGitignoreRule(relativePath, rule)) {
      ignored = !rule.negated;
    }
  }
  return ignored;
}

function matchesGitignoreRule(
  relativePath: string,
  rule: GitignoreRule,
): boolean {
  const pathParts = relativePath.split("/");
  if (rule.directoryOnly) {
    return rule.pattern.includes("/")
      ? matchesPathOrDescendant(relativePath, rule.pattern, rule.anchored)
      : pathParts.some((part) => wildcardMatch(rule.pattern, part));
  }
  if (rule.pattern.includes("/")) {
    return matchesPath(relativePath, rule.pattern, rule.anchored);
  }
  return pathParts.some((part) => wildcardMatch(rule.pattern, part));
}

function matchesPath(
  relativePath: string,
  pattern: string,
  anchored: boolean,
): boolean {
  return anchored
    ? wildcardMatch(pattern, relativePath)
    : relativePath
        .split("/")
        .some((_, index, parts) =>
          wildcardMatch(pattern, parts.slice(index).join("/")),
        );
}

function matchesPathOrDescendant(
  relativePath: string,
  pattern: string,
  anchored: boolean,
): boolean {
  return (
    matchesPath(relativePath, pattern, anchored) ||
    matchesPath(relativePath, `${pattern}/*`, anchored)
  );
}

function wildcardMatch(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `^${escaped.replaceAll("*", "[^/]*").replaceAll("?", "[^/]")}$`,
  );
  return regex.test(value);
}
