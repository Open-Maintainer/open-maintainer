---
name: open-maintainer-validation-testing
description: Use when validating Open Maintainer changes or choosing tests, builds, smoke gates, and skipped-check reporting.
---
# Validation Testing

## Use when
- Finishing any implementation change.
- Choosing scoped checks for an app, package, fixture, smoke script, CI workflow, or Docker Compose change.
- Reporting validation evidence for a PR or final handoff.

## Do not use when
- No repository files changed and the user only requested analysis.
- A human explicitly says not to run validation; still record that validation was skipped by request.

## Read first
- `AGENTS.md`.
- `CONTRIBUTING.md` quality gate and scoped checks.
- `README.md` quality gates.
- Relevant manifest for the touched surface: `package.json`, `apps/*/package.json`, `packages/*/package.json`, or `tests/fixtures/*/package.json`.
- Relevant tests near the change, such as `apps/api/tests/api.test.ts`, `tests/smoke/*`, or fixture tests when present.
- `.github/workflows/ci.yml` and `.github/workflows/compose-smoke.yml` when CI or smoke expectations matter.

## Workflow
- Start with the narrowest check that covers the touched surface.
- Add `biome check .` for linted source or formatting-sensitive edits.
- Add `tsc -b` for TypeScript changes crossing project references.
- Add `vitest run` for behavior, API contract, generated output, consent gate, webhook, or context PR behavior changes.
- Add app or package build commands for changed apps/packages.
- Use fixture commands only when fixture behavior changes.
- Use the documented full gate before broad implementation work is opened or merged when services are available.
- If Docker or services are unavailable, run relevant scoped commands and report skipped Docker/service checks with reasons.

## Validation
- Install dependencies on fresh checkout or dependency sync: `bun install --frozen-lockfile`.
- Lint/format: `biome check .`.
- Typecheck: `tsc -b`.
- Tests: `vitest run`.
- Full build: `bun run --cwd packages/shared build && bun run --cwd packages/db build && bun run --cwd packages/config build && bun run --cwd packages/github build && bun run --cwd packages/analyzer build && bun run --cwd packages/ai build && bun run --cwd packages/context build && bun run --cwd apps/cli build && bun run --cwd apps/api build && bun run --cwd apps/worker build && bun run --cwd apps/web build`.
- API build: `bun run --cwd apps/api build`.
- CLI build: `bun run --cwd apps/cli build`.
- Web build: `bun run --cwd apps/web build`.
- Worker build: `bun run --cwd apps/worker build`.
- Package build: `bun run --cwd packages/<name> build` using the actual touched package name.
- MVP smoke: `bun run tests/smoke/mvp-demo.ts` or `bun run smoke:mvp`.
- Local health after stack startup: `bun run tests/smoke/local-health.ts` or `bun run diagnostics`.
- Compose smoke after stack startup: `bun run tests/smoke/compose-smoke.ts` or `bun run smoke:compose`.
- Fixture low-context: `bun run --cwd tests/fixtures/low-context-ts test`, `bun run --cwd tests/fixtures/low-context-ts build`, `bun run --cwd tests/fixtures/low-context-ts lint`.
- Fixture with-context: `bun run --cwd tests/fixtures/with-context test`.
- Canonical full gate: `bun lint && bun typecheck && bun test && bun run build && bun run smoke:mvp && docker compose up --build && bun run smoke:compose`.

## Documentation
- Update docs when validation, setup, smoke gates, or workflow behavior changes: `README.md`, `CONTRIBUTING.md`, `docs/DEMO_RUNBOOK.md`, `docs/MVP_RELEASE_REVIEW.md`.

## Risk checks
- Do not imply Docker/service checks passed if Docker Compose was unavailable.
- Dependency review blocks high-severity vulnerable dependency additions; avoid dependency and lockfile churn unless requested.
- Not detected: coverage thresholds. Safest fallback is targeted tests plus `vitest run` for behavior changes.

## Done when
- Commands match the changed surface.
- Exact commands run are recorded.
- Failures are read and addressed or reported.
- Skipped checks include concrete reasons.
- Broad gates are considered for cross-app/package or public behavior changes.