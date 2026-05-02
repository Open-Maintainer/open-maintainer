---
name: open-maintainer-pr-review
description: Use when preparing or reviewing pull requests in Open-Maintainer/open-maintainer.
---

# PR Review

## Use when
- Reviewing an existing PR or preparing review feedback.
- Checking changed code against `AGENTS.md`, docs, generated artifacts, and validation evidence.

## Do not use when
- Implementing the change yourself; use `open-maintainer-start-task` first.
- Only selecting final commands; use `open-maintainer-validation-testing`.

## Read first
- `AGENTS.md`.
- The PR diff.
- Changed source, tests, fixtures, docs, workflows, generated artifacts, and lockfiles.
- Related caller, test, type definition, route, command, workflow, or config for each risky changed surface.
- Relevant docs: `README.md`, `CONTRIBUTING.md`, `docs/DEMO_RUNBOOK.md`, `docs/MVP_RELEASE_REVIEW.md`, `docs/ROADMAP.md`, `local-docs/PRODUCT_PRD.md`.

## Workflow
- Review correctness, security, data loss, auth, generated artifacts, docs, and validation before style.
- Separate blocking findings from non-blocking notes.
- Ground every finding in a file path, command, or documented behavior.
- Check for missing regression tests on behavior changes and bug fixes.
- Check for public behavior changes without matching docs.
- Check that generated artifacts were preserved unless the PR intentionally regenerates or forces overwrites.
- Do not request broad refactors unless the diff introduces a concrete risk.

## Validation
- Required evidence depends on touched surface.
- Lint-sensitive changes should include `biome check .`.
- TypeScript contract changes should include `tsc -b`.
- Behavior changes should include `vitest run` or a narrower relevant test plus justification.
- API changes should include `cd apps/api && tsc -p tsconfig.json`.
- CLI changes should include `cd apps/cli && tsc -p tsconfig.json` and, for generated artifact flow changes, `bun run tests/smoke/mvp-demo.ts`.
- Web changes should include `cd apps/web && next build`.
- Worker changes should include `cd apps/worker && tsc -p tsconfig.json`.
- Docker Compose/self-hosted stack changes should include `docker compose up --build` and `bun run tests/smoke/compose-smoke.ts`, or a skipped-check reason.
- Workflow/action changes should include root CI-equivalent checks or an explicit reason for skipped checks.

## Documentation
- Verify docs are updated for public behavior, setup, validation, CLI, action, dashboard, generated artifact, Docker Compose, or smoke-flow changes.
- Primary docs to check: `README.md`, `CONTRIBUTING.md`, `docs/DEMO_RUNBOOK.md`, `docs/MVP_RELEASE_REVIEW.md`.
- Product/roadmap docs to check when relevant: `docs/ROADMAP.md`, `local-docs/PRODUCT_PRD.md`.

## Risk checks
- High-risk areas: webhooks, GitHub App credentials, context PR writes, model-provider repository-content transfer, local repository scanning/upload, Docker Compose env/service wiring, CI security gates, dependency/lockfile churn.
- Ensure no secrets or credentials are added.
- Ensure Docker/service checks are not claimed unless they ran.
- Ensure CLI review remains non-mutating unless the PR intentionally changes documented behavior.
- CODEOWNERS, release publishing, production deployment: Not detected.

## Done when
- Findings are ordered by severity and include file paths.
- Validation gaps and skipped checks are explicit.
- Docs/test gaps are called out.
- Remaining risk is stated without inventing behavior.