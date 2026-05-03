import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export async function runCli(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(
      "bun",
      ["apps/cli/src/index.ts", ...args],
      {
        cwd: repoRoot,
        env: { ...process.env, ...env },
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const result = error as {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      code?: number | string;
    };
    return {
      stdout: normalizeOutput(result.stdout),
      stderr: normalizeOutput(result.stderr),
      exitCode: typeof result.code === "number" ? result.code : 1,
    };
  }
}

function normalizeOutput(value: string | Buffer | undefined): string {
  return Buffer.isBuffer(value) ? value.toString("utf8") : (value ?? "");
}
