"use client";

import { useRef, useState } from "react";

type UploadFile = {
  path: string;
  content: string;
};

const maxFiles = 800;
const maxFileBytes = 128_000;
const ignoredPathParts = new Set([
  ".git",
  ".next",
  ".turbo",
  ".cache",
  ".vercel",
  "coverage",
  "dist",
  "build",
  "node_modules",
  "out",
  "target",
  "vendor",
]);
const readableExtensions = new Set([
  ".cairo",
  ".css",
  ".go",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".lock",
  ".md",
  ".nr",
  ".rs",
  ".sol",
  ".sum",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml",
]);
const readableNames = new Set([
  ".env.example",
  ".gitignore",
  "bun.lock",
  "bun.lockb",
  "Cargo.lock",
  "Dockerfile",
  "go.sum",
  "Makefile",
  "package-lock.json",
  "pnpm-lock.yaml",
  "README",
  "Scarb.lock",
  "uv.lock",
  "yarn.lock",
]);

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
      const uploaded: UploadFile[] = [];
      for (const file of selected) {
        if (uploaded.length >= maxFiles) {
          break;
        }
        const relativePath = repoRelativePath(file);
        if (
          !relativePath ||
          file.size > maxFileBytes ||
          shouldSkipPath(relativePath) ||
          !shouldReadPath(relativePath)
        ) {
          continue;
        }
        uploaded.push({
          path: stripRootDirectory(relativePath, rootName),
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
        Choose local repo
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

function shouldSkipPath(relativePath: string): boolean {
  return relativePath
    .split("/")
    .some(
      (part) => ignoredPathParts.has(part) || part.endsWith(".tsbuildinfo"),
    );
}

function shouldReadPath(relativePath: string): boolean {
  const fileName = relativePath.split("/").at(-1) ?? "";
  if (
    readableNames.has(fileName) ||
    readableNames.has(fileName.split(".")[0] ?? "")
  ) {
    return true;
  }
  const extensionStart = fileName.lastIndexOf(".");
  const extension =
    extensionStart >= 0 ? fileName.slice(extensionStart).toLowerCase() : "";
  return readableExtensions.has(extension);
}
