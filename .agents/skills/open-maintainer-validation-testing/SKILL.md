---
name: open-maintainer-validation-testing
description: Use when validating Open Maintainer changes or choosing tests, builds, smoke gates, and skipped-check reporting.
---

# Validation Testing

## Use when
- Finishing implementation or preparing a PR handoff.
- Choosing scoped checks for an app, package, fixture, smoke script, workflow, Docker Compose, or generated artifact change.
- Reporting skipped validation.

## Do not use when
- No repository files changed and the user only asked for analysis.
- Reviewing a completed PR for findings; use `open-maintainer-pr-review`.

## Read first
- `AGENTS.md`.
- The changed source file and nearest tests or fixtures.
- Relevant manifests: `package.json`, `apps/*/package.json`, `packages/*/package.json`, `tests/fixtures/*/package.json`.
- Relevant configs: `tsconfig.json`, `apps/*/tsconfig.json`, `packages/*/tsconfig.json`, `biome.json`.
- CI/smoke workflows when relevant: `.github/workflows/ci.yml`, `.github/workflows/compose-smoke.yml`.

## Workflow
- Start with the narrowest command covering the changed surface.
- Add `biome check .` for linted or formatting-sensitive source changes.
- Add `tsc -b` for shared types, package contracts, and cross-app or cross-package changes.
- Add `vitest run` for behavior changes and bug fixes.
- Add app/package build commands for build-affecting changes.
- Add smoke checks for CLI generated artifact flows or Docker Compose/self-hosted stack changes.
- Use fixture commands only when that fixture behavior changes.
- If Docker or services are unavailable, state the skipped command and reason; do not claim it passed.

## Validation
- Fresh checkout install: `bun install --frozen-lockfile`.
- Root lint: `biome check .`.
- Root typecheck: `tsc -b`.
- Root tests: `vitest run`.
- Workspace build: `bun run --cwd packages/shared build && bun run --cwd packages/ai build && bun run --cwd packages/review build && bun run --cwd packages/db build && bun run --cwd packages/config build && bun run --cwd packages/github build && bun run --cwd packages/analyzer build && bun run --cwd packages/context build && bun run --cwd apps/cli build && bun run --cwd apps/api build && bun run --cwd apps/worker build && bun run --cwd apps/web build`.
- API build: `cd apps/api && tsc -p tsconfig.json`.
- CLI build: `cd apps/cli && tsc -p tsconfig.json`.
- Web build: `cd apps/web && next build`.
- Worker build: `cd apps/worker && tsc -p tsconfig.json`.
- Package builds: `cd packages/ai && tsc -p tsconfig.json`, `cd packages/analyzer && tsc -p tsconfig.json`, `cd packages/config && tsc -p tsconfig.json`, `cd packages/context && tsc -p tsconfig.json`, `cd packages/db && tsc -p tsconfig.json`, `cd packages/github && tsc -p tsconfig.json`, `cd packages/review && tsc -p tsconfig.json`, `cd packages/shared && tsc -p tsconfig.json`.
- MVP smoke: `bun run tests/smoke/mvp-demo.ts`.
- Local health after stack startup: `bun run tests/smoke/local-health.ts`.
- Compose smoke after stack startup: `bun run tests/smoke/compose-smoke.ts`.
- Fixture high-readiness: `cd tests/fixtures/high-readiness-ts && vitest run`, `cd tests/fixtures/high-readiness-ts && biome check .`, `cd tests/fixtures/high-readiness-ts && tsc -b`.
- Fixture low-context: `cd tests/fixtures/low-context-ts && vitest run`, `cd tests/fixtures/low-context-ts && biome check .`, `cd tests/fixtures/low-context-ts && tsc -b`.
- Fixture missing-context: `cd tests/fixtures/missing-context-ts && vitest run`, `cd tests/fixtures/missing-context-ts && biome check .`, `cd tests/fixtures/missing-context-ts && tsc -b`.
- Fixture with-context: `cd tests/fixtures/with-context && vitest run`.

## Documentation
- Update `README.md`, `CONTRIBUTING.md`, `docs/DEMO_RUNBOOK.md`, or `docs/MVP_RELEASE_REVIEW.md` when validation, setup, smoke gates, CLI demo behavior, dashboard setup, or workflow behavior changes.

## Risk checks
- Docker/service checks must not be reported as passed unless they actually ran.
- Dependency and lockfile changes are high-risk churn areas; Dependency Review blocks high-severity vulnerable dependency additions.
- Coverage thresholds and browser e2e requirements: Not detected.
- Local action runner command: Not detected; safest fallback is targeted tests plus CI-equivalent checks and shell review of `action.yml`.

## Done when
- Commands match the changed surface.
- Exact commands run and results are recorded.
- Failures were read and addressed or reported.
- Skipped checks include concrete reasons.
- Broad gates were considered for cross-app, cross-package, public behavior, workflow, Docker, or generated artifact changes.