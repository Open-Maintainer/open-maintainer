---
name: open-maintainer-update-web-dashboard-flow
description: Use when changing the Next/React dashboard, local repository picker, provider forms, or dashboard action routes.
---

# Update Web Dashboard Flow

## Use when
- Editing `apps/web` dashboard files.
- Changing health display, repository selection, local upload, provider setup, artifact display, action forms, redirects, API proxy routes, or API connectivity.
- Changing behavior that depends on `API_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL`, or `WEB_PORT`.

## Do not use when
- The change is only API internals and dashboard contracts do not change.
- The task targets `apps/web/next-env.d.ts`; do not edit that generated file without explicit instruction.

## Read first
- `AGENTS.md`.
- Relevant files under `apps/web/app`.
- `apps/web/package.json`, `apps/web/tsconfig.json`, and `apps/web/next.config.ts` when present.
- `apps/api/src/app.ts` and `apps/api/tests/api.test.ts` for API contract changes.
- `README.md` dashboard and GitHub App sections when user-facing behavior changes.
- `docs/MVP_RELEASE_REVIEW.md` when dashboard acceptance evidence changes.

## Workflow
- Keep dashboard mutation routes coordinated with API contracts.
- Preserve local filesystem and uploaded repository safety behavior unless intentionally changing it.
- Preserve generated/build directory filtering for local uploads when present; selected evidence names `.git`, `.next`, `dist`, `build`, and `node_modules` as ignored/generated paths.
- Preserve documented upload/API limits unless intentionally changing them: 800 files and 128000 characters per file content.
- Coordinate request/response shape changes with `apps/api/src/app.ts` and shared types.
- Do not edit `apps/web/next-env.d.ts`.
- Add or update tests for dashboard route behavior, API contract assumptions, redirects, or upload handling when relevant.

## Validation
- Web build: `cd apps/web && next build`.
- TypeScript contracts: `tsc -b`.
- Behavior tests: `vitest run`.
- Lint-sensitive changes: `biome check .`.
- Compose/dashboard integration after stack startup: `bun run tests/smoke/compose-smoke.ts`.
- API contract changes also require: `cd apps/api && tsc -p tsconfig.json`.

## Documentation
- Update `README.md` for dashboard behavior, API URLs, GitHub App setup, or self-hosted stack changes.
- Update `CONTRIBUTING.md` if validation or setup flow changes.
- Update `docs/MVP_RELEASE_REVIEW.md` if dashboard acceptance evidence changes.

## Risk checks
- Local filesystem paths and uploaded repository files are sensitive.
- Repository-content transfer to model providers requires explicit consent in provider flows.
- API connectivity depends on environment variables and documented local defaults.
- `apps/web/next-env.d.ts` is generated; do not edit without explicit instruction.
- Browser e2e requirements: Not detected.

## Done when
- Dashboard routes and API contracts match.
- Local upload and consent behavior remain safe.
- Web build and relevant tests ran or skips are explained.
- User-facing dashboard changes are documented.