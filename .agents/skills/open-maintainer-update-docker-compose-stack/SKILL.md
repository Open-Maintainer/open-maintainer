---
name: open-maintainer-update-docker-compose-stack
description: Use when changing Docker Compose services, local self-hosted stack wiring, API/web/worker environment, or compose smoke behavior.
---
# Update Docker Compose Stack

## Use when
- Editing `docker-compose.yml`.
- Changing API, worker, web, Postgres, Redis, ports, environment values, volumes, service dependencies, or compose smoke expectations.
- Changing local self-hosted dashboard setup.

## Do not use when
- The change only affects unit-level code and no service wiring or environment behavior changes.
- The task is production deployment; deployment behavior is Not detected in provided evidence.

## Read first
- `AGENTS.md` Docker Compose and high-risk rules.
- `docker-compose.yml`.
- `README.md` Dashboard and GitHub App setup sections.
- `CONTRIBUTING.md` quality gates and safety notes.
- `.github/workflows/compose-smoke.yml`.
- `tests/smoke/compose-smoke.ts` when available.
- Service entrypoints affected by wiring: `apps/api/src/server.ts`, `apps/worker/src/worker.ts`, `apps/web/app/page.tsx`, `apps/web/app/*/route.ts`.

## Workflow
- Preserve documented services unless the task explicitly changes them: `postgres`, `redis`, `api`, `worker`, and `web`.
- Keep API on port `4000` and web on port `3000` unless intentionally changing documented URLs.
- Keep API/worker/web environment values aligned with service names: worker API base points to API service; web has browser and server API bases.
- Keep `.env` setup aligned with README and CI compose workflow.
- Do not add new services or deployment flows without explicit user instruction and evidence.
- Update smoke checks and docs when service wiring or environment expectations change.

## Validation
- Start stack: `docker compose up --build`.
- Compose smoke after stack startup: `bun run tests/smoke/compose-smoke.ts` or `bun run smoke:compose`.
- Local health after stack startup: `bun run tests/smoke/local-health.ts` or `bun run diagnostics`.
- Related builds: `bun run --cwd apps/api build`, `bun run --cwd apps/worker build`, `bun run --cwd apps/web build` as applicable.
- Full service gate when services are available: `bun lint && bun typecheck && bun test && bun run build && bun run smoke:mvp && docker compose up --build && bun run smoke:compose`.

## Documentation
- Update `README.md` for self-hosted stack setup, URLs, environment variables, or GitHub App setup changes.
- Update `CONTRIBUTING.md` if quality gates or scoped checks change.
- Update `docs/MVP_RELEASE_REVIEW.md` when Docker Compose acceptance evidence changes.

## Risk checks
- Docker Compose service wiring and environment values are high risk.
- Never add secrets or credentials to the repository.
- Not detected: production environment configuration beyond local Docker Compose and documented GitHub App values.
- CI stops stack with `docker compose down --volumes --remove-orphans`; local cleanup policy outside CI is Not detected.

## Done when
- Stack wiring matches docs and CI workflow.
- Compose smoke and health checks ran, or skipped Docker checks include reasons.
- Related app builds pass when service entrypoints changed.
- Documentation matches any changed ports, env vars, services, or setup steps.