---
name: open-maintainer-start-task
description: Orient inside Open-Maintainer/open-maintainer before making a bounded code, docs, workflow, or generated-artifact change.
---

# Start Task

## Use when
- Starting implementation in `apps/api`, `apps/cli`, `apps/web`, `apps/worker`, `packages/*`, `tests`, `docs`, or `.github/workflows`.
- Changing generated context artifacts, validation behavior, Docker Compose wiring, CLI behavior, dashboard behavior, or API/GitHub flows.

## Do not use when
- Reviewing an existing PR; use `open-maintainer-pr-review`.
- Only selecting final checks; use `open-maintainer-testing-workflow`.
- Release publishing, deployment, ownership routing, or database migration process is needed; Not detected in provided evidence.

## Read first
- `AGENTS.md`.
- The target file.
- At least one related caller, test, type definition, route, command, workflow, or config.
- Nearest manifest and tsconfig for code changes: `package.json`, `apps/*/package.json`, `packages/*/package.json`, `apps/*/tsconfig.json`, or `packages/*/tsconfig.json`.
- Relevant docs when public behavior may change: `README.md`, `CONTRIBUTING.md`, `docs/DEMO_RUNBOOK.md`, `docs/MVP_RELEASE_REVIEW.md`, `docs/ROADMAP.md`, `local-docs/PRODUCT_PRD.md`.

## Workflow
- Classify the changed surface before editing: app, package, root test, fixture, workflow, Docker Compose, generated artifact, or docs.
- Keep the diff bounded to the requested behavior and smallest relevant module set.
- Preserve workspace package boundaries under `apps/*` and `packages/*`.
- Use Bun commands; do not switch package managers.
- Avoid broad refactors, unrelated formatting, dependency churn, and lockfile churn unless explicitly requested.
- Preserve generated context artifacts by default; overwrite only for explicit regeneration or force behavior.
- Do not send repository content to model providers unless explicit consent is present.
- Choose scoped validation before final handoff.

## Validation
- Lint-sensitive changes: `biome check .`.
- Cross-package TypeScript changes: `tsc -b`.
- Behavior changes: `vitest run`.
- API changes: `cd apps/api && tsc -p tsconfig.json`.
- CLI changes: `cd apps/cli && tsc -p tsconfig.json`.
- Web changes: `cd apps/web && next build`.
- Worker changes: `cd apps/worker && tsc -p tsconfig.json`.
- CLI/generated artifact flow changes: `bun run tests/smoke/mvp-demo.ts`.
- Docker/service integration changes after stack startup: `bun run tests/smoke/compose-smoke.ts`.
- Local health diagnostics after stack startup: `bun run tests/smoke/local-health.ts`.

## Documentation
- Check or update `README.md` for CLI demo, dashboard, GitHub Action, generated outputs, model choices, consent flags, and quality gates.
- Check or update `docs/DEMO_RUNBOOK.md` for demo flow, generation flags, model selection, consent, force, or expected outputs.
- Check or update `CONTRIBUTING.md` for validation, setup, safety process, PR workflow, or CI gate changes.
- Check or update `docs/MVP_RELEASE_REVIEW.md` when acceptance evidence changes.
- Check `docs/ROADMAP.md` and `local-docs/PRODUCT_PRD.md` for product or roadmap behavior changes.

## Risk checks
- Generated/context artifacts: `AGENTS.md`, `.agents/skills/**`, `.open-maintainer/profile.json`, `.open-maintainer/report.md`, `.open-maintainer.yml`.
- Do not edit `apps/web/next-env.d.ts` without explicit instruction.
- High-risk areas: auth, webhooks, GitHub App credentials, context PR writes, repository-content transfer, local repository scanning/upload, Docker Compose wiring, CI security gates, lockfiles.
- Secrets and credentials must not be added to the repository.
- Release publishing, deployment process, CODEOWNERS, and database migration lifecycle: Not detected.

## Done when
- Target and related file were read before editing.
- Diff is scoped and free of unrelated formatting or lockfile churn.
- Relevant tests/docs were updated or explicitly ruled out.
- Final handoff includes changed paths, exact commands run, skipped checks, and remaining risk.
