---
name: open-maintainer-update-web-dashboard-flow
description: Use when changing the Next/React dashboard, local repository picker, provider forms, or dashboard action routes.
---
# Update Web Dashboard Flow

## Use when
- Editing files under `apps/web/app`.
- Changing dashboard health display, repository selection, local upload, provider setup, artifact display, action forms, redirects, or API proxy routes.
- Changing web/API connectivity through `API_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL`, or `http://localhost:4000` fallback behavior.

## Do not use when
- The change is only API internals and dashboard contracts do not change.
- The task targets generated Next files such as `apps/web/next-env.d.ts`; do not edit that file without explicit instruction.

## Read first
- `AGENTS.md` web and generated-file rules.
- `apps/web/app/page.tsx` for dashboard data flow and UI contracts.
- Relevant route file: `apps/web/app/repo-actions/route.ts`, `apps/web/app/provider-actions/route.ts`, `apps/web/app/local-repos/route.ts`, `apps/web/app/local-repos/upload/route.ts`, or `apps/web/app/redirect.ts`.
- `apps/web/app/LocalRepoPicker.tsx` for local repository upload behavior.
- `apps/web/app/layout.tsx` and `apps/web/app/styles.css` when layout or styling changes.
- `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`.
- API route implementation or tests for any changed dashboard contract: `apps/api/src/app.ts`, `apps/api/tests/api.test.ts`.
- `README.md` Dashboard and GitHub App sections for user-facing changes.

## Workflow
- Keep mutation routes delegating work to the API unless the task explicitly changes that architecture.
- Preserve browser-reachable redirect behavior in `apps/web/app/redirect.ts` when changing form routes.
- Preserve local upload limits unless intentionally changing them: 800 files and 128000 bytes per file.
- Preserve ignored path filtering for generated/build directories such as `.git`, `.next`, `dist`, `build`, `node_modules`, and related entries unless intentionally changing local upload behavior.
- Coordinate request/response shape changes with `apps/api/src/app.ts` and shared types.
- Do not edit `apps/web/next-env.d.ts`.

## Validation
- Web build: `bun run --cwd apps/web build`.
- TypeScript project validation: `tsc -b`.
- Dashboard/API behavior tests when contracts change: `vitest run`.
- Compose/dashboard integration changes: `docker compose up --build` then `bun run tests/smoke/compose-smoke.ts` or `bun run smoke:compose`.
- Broad dashboard behavior change: `bun lint && bun typecheck && bun test && bun run build`.

## Documentation
- Update `README.md` for dashboard behavior, API URLs, GitHub App setup, or self-hosted stack changes.
- Update `CONTRIBUTING.md` if validation or setup flow changes.
- Update `docs/MVP_RELEASE_REVIEW.md` if dashboard acceptance evidence changes.

## Risk checks
- Local filesystem paths and uploaded repository files are sensitive surfaces.
- Repository-content transfer to model providers requires explicit consent in provider flows.
- API connectivity depends on environment variables and `http://localhost:4000` fallback.
- `apps/web/next-env.d.ts` and `.next` are generated; do not edit.

## Done when
- Dashboard route and API contracts still match.
- Web build passes or skip is explained.
- Local upload and consent behavior remain safe.
- User-facing dashboard changes are documented.