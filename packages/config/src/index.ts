import YAML from "yaml";
import { z } from "zod";

export const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  API_PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string().min(8).optional(),
});
export type Env = z.infer<typeof EnvSchema>;

export const OpenMaintainerConfigSchema = z.object({
  version: z.literal(1),
  repo: z.object({
    profileVersion: z.number().int().positive(),
    defaultBranch: z.string(),
  }),
  rules: z.array(z.string()).default([]),
  generated: z.object({
    by: z.literal("open-maintainer"),
    artifactVersion: z.number().int().positive(),
    generatedAt: z.string(),
  }),
});
export type OpenMaintainerConfig = z.infer<typeof OpenMaintainerConfigSchema>;

export function loadEnv(env: NodeJS.ProcessEnv = process.env): Env {
  return EnvSchema.parse(env);
}

export function parseOpenMaintainerConfig(
  source: string,
): OpenMaintainerConfig {
  return OpenMaintainerConfigSchema.parse(YAML.parse(source));
}

export function stringifyOpenMaintainerConfig(
  config: OpenMaintainerConfig,
): string {
  return YAML.stringify(OpenMaintainerConfigSchema.parse(config));
}
