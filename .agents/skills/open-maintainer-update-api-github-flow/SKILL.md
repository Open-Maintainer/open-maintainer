---
name: open-maintainer-update-api-github-flow
description: Use when changing Fastify API routes, repository analysis endpoints, model-provider setup, GitHub webhooks, or context PR API behavior.
---
# Update API GitHub Flow

## Use when
- Editing `apps/api/src/app.ts` or `apps/api/src/server.ts`.
- Changing `/health`, `/worker/heartbeat`, repository registration, analysis, model providers, GitHub settings, webhooks, generated artifacts, or open-context-PR routes.
- Changing behavior that uses `packages/db`, `packages/github`, `packages/analyzer`, `packages/context`, `packages/ai`, or `packages/shared` through the API.

## Do not use when
- The change is only web routing or display with no API contract change.
- The change is only CLI behavior with no API route or GitHub App flow impact.

## Read first
- `AGENTS.md` API and high-risk rules.
- `apps/api/src/app.ts`.
- `apps/api/src/server.ts` when server startup, host, or port changes.
- `apps/api/tests/api.test.ts`.
- `apps/api/package.json` and `apps/api/tsconfig.json`.
- Relevant package source under `packages/db`, `packages/github`, `packages/analyzer`, `packages/context`, `packages/ai`, or `packages/shared`.
- Web caller routes when dashboard actions call the API: `apps/web/app/repo-actions/route.ts`, `apps/web/app/provider-actions/route.ts`, `apps/web/app/local-repos/route.ts`, `apps/web/app/local-repos/upload/route.ts`.
- `README.md` GitHub App Setup and dashboard sections when public behavior changes.

## Workflow
- Preserve Fastify plugin setup unless the task targets CORS, form-body, or rate limiting.
- Keep sensitive local repository routes rate-limited when changing local repo registration/upload behavior.
- Keep health response aligned with database, Redis, API, worker heartbeat, and timestamp behavior.
- Use Zod/Fastify patterns already present for request validation and replies.
- Add or update tests for API contracts, consent gates, webhook handling, repository scanning/upload, generated output, or context PR behavior changes.
- Coordinate API response changes with web route callers and shared types.

## Validation
- API build: `bun run --cwd apps/api build`.
- API and behavior tests: `vitest run`.
- TypeScript project validation: `tsc -b`.
- Local health after stack startup: `bun run tests/smoke/local-health.ts` or `bun run diagnostics`.
- Compose wiring/API integration changes: `docker compose up --build` then `bun run tests/smoke/compose-smoke.ts` or `bun run smoke:compose`.
- Broad API contract change: `bun lint && bun typecheck && bun test && bun run build && bun run smoke:mvp`.

## Documentation
- Update `README.md` for dashboard behavior, GitHub App setup, API URLs, or GitHub Action audit implications.
- Update `CONTRIBUTING.md` for validation or safety process changes.
- Update `docs/MVP_RELEASE_REVIEW.md` when acceptance evidence for webhooks, installation metadata, generated artifacts, or context PR writes changes.

## Risk checks
- Webhook signature verification, GitHub App credentials, repository-content transfer, context PR writes, and local repository upload/scanning are high risk.
- Never add secrets or credentials to the repository.
- API uses `API_PORT` or `4000` and binds to `0.0.0.0`; do not change connectivity behavior without docs/tests.
- Not detected: full database schema and migration strategy; read package source before database-adjacent changes.

## Done when
- API contracts are tested.
- Related web callers or shared types are updated when response/request shape changes.
- Docs reflect public setup or dashboard behavior changes.
- Validation evidence includes API build and relevant tests/smoke checks.