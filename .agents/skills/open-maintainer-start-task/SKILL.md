---
name: open-maintainer-start-task
description: Use when starting any Open Maintainer code or documentation task to choose scope, read required context, and avoid unsafe surfaces.
---
# Start Task

## Use when
- Beginning any code, test, documentation, or workflow change in this repository.
- The request touches an app under `apps/`, a package under `packages/`, CI, Docker Compose, generated context artifacts, or docs.

## Do not use when
- The user only asks for a direct answer from already-provided facts.
- Another narrower skill covers the full requested workflow after orientation is complete.

## Read first
- `AGENTS.md`.
- `CONTRIBUTING.md`.
- `README.md` when user-facing CLI, dashboard, GitHub Action, setup, generated output, or quality gate behavior may change.
- The target file before editing.
- At least one related caller, test, type definition, route, package manifest, or user-facing doc before editing.
- Relevant package manifest: `apps/api/package.json`, `apps/cli/package.json`, `apps/web/package.json`, `apps/worker/package.json`, or `packages/<name>/package.json`.
- Relevant TypeScript config: `apps/*/tsconfig.json`, `packages/*/tsconfig.json`, `tsconfig.json`, or `tsconfig.base.json`.

## Workflow
- Confirm the requested scope and map it to the smallest app/package boundary.
- Use Bun for dependency and script commands.
- Check nearby conventions before adding abstractions or new imports.
- Keep edits bounded to the requested app/package surface unless a related contract requires another surface.
- Do not reformat unrelated files.
- Do not update dependency versions or lockfiles unless explicitly requested.
- Do not edit generated files unless the task is specifically about generated output.
- Treat missing package-internal data flow as `Not detected`; read local source before changing cross-package behavior.

## Validation
- No edit: Not detected; safest fallback is to report what was inspected and any unknowns.
- TypeScript changes: `tsc -b`.
- Lint-sensitive source changes: `biome check .`.
- Behavior changes: `vitest run`.
- App build checks: `bun run --cwd apps/api build`, `bun run --cwd apps/cli build`, `bun run --cwd apps/web build`, or `bun run --cwd apps/worker build` based on touched app.
- Package changes: `bun run --cwd packages/<name> build` using the actual touched package name.
- Broad cross-surface change: `bun lint && bun typecheck && bun test && bun run build && bun run smoke:mvp && docker compose up --build && bun run smoke:compose` when services are available.

## Documentation
- Check `README.md` and `CONTRIBUTING.md` for setup, quality gate, dashboard, GitHub Action, Docker Compose, or public behavior changes.
- Check `docs/DEMO_RUNBOOK.md` for CLI demo, generation flags, and generated output changes.
- Check `docs/MVP_RELEASE_REVIEW.md` for MVP scope or release evidence changes.
- Check `local-docs/PRODUCT_PRD.md` and `local-docs/TECH_STACK.md` for product or tech assumptions.

## Risk checks
- Repository content must not be sent to model-backed generation without explicit consent such as `--allow-write`.
- `apps/web/next-env.d.ts`, `dist`, and `.next` are generated outputs; do not edit without explicit instruction.
- Treat GitHub App credentials, webhook verification, context PR writes, repository-content transfer, Docker Compose wiring, lockfiles, and local repository upload/scanning as high risk.
- Not detected: CODEOWNERS, ownership policy, release publishing process, production deployment process.

## Done when
- Target and related files were read before edits.
- Change stays inside the requested boundary.
- Relevant tests/docs were updated for behavior or public contract changes.
- Scoped validation ran, or skipped checks are listed with reasons.
- Risky areas touched are called out in final notes or PR notes.