---
name: open-maintainer-update-api-github-flow
description: Use when changing Fastify API routes, repository analysis endpoints, model-provider setup, GitHub webhooks, or context PR API behavior.
---

# Update API GitHub Flow

## Use when
- Editing `apps/api` Fastify API behavior.
- Changing `/health`, `/worker/heartbeat`, installations, repositories, local repository scanning/upload, GitHub settings, model providers, generated artifacts, review generation, webhooks, or context PR routes.
- Changing API use of `packages/ai`, `packages/analyzer`, `packages/context`, `packages/db`, `packages/github`, `packages/review`, or `packages/shared`.

## Do not use when
- The change is only web display/routing with no API contract change.
- The change is only CLI behavior with no API route or GitHub App impact.

## Read first
- `AGENTS.md`.
- `apps/api/src/app.ts`.
- `apps/api/src/server.ts` when startup, host, or port changes.
- `apps/api/tests/api.test.ts`.
- `apps/api/package.json` and `apps/api/tsconfig.json`.
- Relevant package source under `packages/ai`, `packages/analyzer`, `packages/context`, `packages/db`, `packages/github`, `packages/review`, or `packages/shared`.
- Web callers under `apps/web/app` when dashboard contracts change.
- `README.md` and `docs/MVP_RELEASE_REVIEW.md` for public dashboard/GitHub App behavior.

## Workflow
- Preserve Fastify plugin setup unless the task targets CORS, form body parsing, or rate limiting.
- Keep sensitive local repository routes rate-limited; observed limit is max 10 per minute.
- Preserve local repository scan cap of 800 files unless intentionally changing it.
- Preserve uploaded repository schema limits unless intentionally changing them: max 800 files and max 128000 characters per file content.
- Keep `/health` aligned with database, Redis, API, worker heartbeat, `workerHeartbeatAt`, and `checkedAt` behavior.
- Use existing Zod and shared schema/type patterns for request and response contracts.
- Coordinate API contract changes with dashboard callers and shared types.
- Add or update tests for API contracts, consent gates, webhook behavior, repository scanning/upload, generated output, review generation, or context PR behavior.

## Validation
- API build: `cd apps/api && tsc -p tsconfig.json`.
- Root tests: `vitest run`.
- TypeScript contracts: `tsc -b`.
- Lint-sensitive changes: `biome check .`.
- Local health after stack startup: `bun run tests/smoke/local-health.ts`.
- Compose/API integration after stack startup: `bun run tests/smoke/compose-smoke.ts`.
- Cross-package build if shared packages changed: `bun run --cwd packages/shared build && bun run --cwd packages/ai build && bun run --cwd packages/review build && bun run --cwd packages/db build && bun run --cwd packages/config build && bun run --cwd packages/github build && bun run --cwd packages/analyzer build && bun run --cwd packages/context build && bun run --cwd apps/cli build && bun run --cwd apps/api build && bun run --cwd apps/worker build && bun run --cwd apps/web build`.

## Documentation
- Update `README.md` for dashboard behavior, GitHub App setup, API URLs, context PR behavior, or provider setup changes.
- Update `CONTRIBUTING.md` for validation or safety process changes.
- Update `docs/MVP_RELEASE_REVIEW.md` when acceptance evidence changes.

## Risk checks
- Webhook signature verification, GitHub App credentials, repository-content transfer, context PR writes, local path scanning, and uploaded repository files are high risk.
- Never add secrets or credentials.
- Database schema and migration strategy: Not detected; read local package source before database-adjacent changes.
- Production deployment behavior: Not detected.

## Done when
- API contracts are tested.
- Related web callers and shared types are updated when request/response shapes change.
- Public behavior docs are aligned.
- API build and relevant tests/smoke checks ran or skips are explained.