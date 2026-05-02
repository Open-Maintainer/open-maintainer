---
name: open-maintainer-update-docker-compose-stack
description: Use when changing Docker Compose services, local self-hosted stack wiring, API/web/worker environment, or compose smoke behavior.
---

# Update Docker Compose Stack

## Use when
- Editing `docker-compose.yml`.
- Changing local self-hosted stack wiring, service dependencies, ports, volumes, environment variables, API/web/worker connectivity, or compose smoke expectations.
- Changing `.env.example` values used by the Compose stack.

## Do not use when
- The change only affects unit-level code and no service wiring or environment behavior changes.
- The task concerns production deployment; deployment behavior is Not detected.

## Read first
- `AGENTS.md`.
- `docker-compose.yml`.
- `.env.example`.
- `.github/workflows/compose-smoke.yml`.
- `tests/smoke/compose-smoke.ts` and `tests/smoke/local-health.ts`.
- Related app entrypoints when changed: `apps/api`, `apps/web`, `apps/worker`.
- `README.md`, `CONTRIBUTING.md`, and `docs/MVP_RELEASE_REVIEW.md` for setup and acceptance evidence.

## Workflow
- Preserve documented/local stack behavior unless the task explicitly changes it.
- Keep `.env.example` aligned with Compose startup; CI copies `.env.example` to `.env` before `docker compose up --build -d`.
- Keep API/web/worker environment variables aligned with `.env.example`: `API_PORT`, `WEB_PORT`, `API_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL`, `DATABASE_URL`, `REDIS_URL`.
- Do not add new services, ports, volumes, or deployment flows without explicit instruction and evidence.
- Update smoke checks and docs when service wiring or environment expectations change.
- Do not add secrets or credentials.

## Validation
- Compose CI setup sequence: `cp .env.example .env`.
- Start stack: `docker compose up --build -d`.
- Compose smoke after stack startup: `bun run tests/smoke/compose-smoke.ts`.
- Local health after stack startup: `bun run tests/smoke/local-health.ts`.
- Stop stack cleanup as used by CI: `docker compose down --volumes --remove-orphans`.
- Related API build: `cd apps/api && tsc -p tsconfig.json`.
- Related web build: `cd apps/web && next build`.
- Related worker build: `cd apps/worker && tsc -p tsconfig.json`.
- Lint/type/test when source changes: `biome check .`, `tsc -b`, `vitest run`.

## Documentation
- Update `README.md` for self-hosted stack setup, URLs, environment variables, or GitHub App setup changes.
- Update `CONTRIBUTING.md` if quality gates or scoped checks change.
- Update `docs/MVP_RELEASE_REVIEW.md` when Docker Compose acceptance evidence changes.

## Risk checks
- Docker Compose service wiring and environment values are high risk.
- Docker/service checks must not be claimed as passed unless run.
- Secrets in `.env.example` are placeholders only; do not add real credentials.
- Exact production deployment environment and full service definitions beyond local files: Not detected.

## Done when
- Stack wiring, `.env.example`, docs, and CI compose workflow agree.
- Compose smoke and health checks ran, or skipped Docker checks include concrete reasons.
- Related app builds pass when service entrypoints changed.
- Changed ports, services, env vars, or setup steps are documented.