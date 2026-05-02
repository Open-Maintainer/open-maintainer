---
name: open-maintainer-update-cli-generation
description: Use when changing the Bun CLI audit, generate, init, doctor, PR, review, model consent, or generated context artifact workflow.
---

# Update CLI Generation

## Use when
- Editing CLI behavior under `apps/cli`.
- Changing `audit`, `generate`, `doctor`, `review`, or `pr` flows described in `README.md`.
- Changing model/provider flags, consent behavior, generated context artifacts, readiness profile/report writes, PR review output, or context/skills targets.

## Do not use when
- The change is only dashboard/API behavior with no CLI contract change.
- The task is only to run validation; use `open-maintainer-testing-workflow`.

## Read first
- `AGENTS.md`.
- `apps/cli/package.json` and `apps/cli/tsconfig.json`.
- Relevant CLI source under `apps/cli`.
- Related packages used by the change: `packages/ai`, `packages/analyzer`, `packages/context`, `packages/review`, `packages/shared`.
- CLI tests: `tests/cli-audit.test.ts`, `tests/cli-doctor.test.ts`, `tests/cli-help.test.ts`, `tests/cli-review.test.ts` when relevant.
- Smoke/demo files: `tests/smoke/mvp-demo.ts`, `docs/DEMO_RUNBOOK.md`, `README.md`.
- Fixture repos under `tests/fixtures/*` when fixture expectations change.

## Workflow
- Preserve existing context files by default; require intentional `--force` behavior for overwrites.
- Do not send repository content to model-backed generation without explicit consent such as `--allow-write`.
- Do not send repository content to model-backed PR review without explicit repository-content transfer consent such as `--allow-model-content-transfer`.
- Keep documented generated paths aligned: `AGENTS.md`, `.agents/skills/<repo>-start-task/SKILL.md`, `.agents/skills/<repo>-testing-workflow/SKILL.md`, `.agents/skills/<repo>-pr-review/SKILL.md`, `.open-maintainer/profile.json`, `.open-maintainer/report.md`, `.open-maintainer.yml`.
- Keep `--model`, `--context`, and `--skills` semantics aligned with `README.md`.
- Keep CLI review non-mutating unless intentionally changing documented v0.4 behavior.
- Add or update regression tests for consent gates, generated outputs, help text, audit/doctor/review behavior, or fixture expectations.

## Validation
- CLI build: `cd apps/cli && tsc -p tsconfig.json`.
- Root behavior tests: `vitest run`.
- Root typecheck for cross-package changes: `tsc -b`.
- MVP smoke for CLI/generated artifact flow: `bun run tests/smoke/mvp-demo.ts`.
- Lint-sensitive changes: `biome check .`.
- Fixture high-readiness changes: `cd tests/fixtures/high-readiness-ts && vitest run`, `cd tests/fixtures/high-readiness-ts && biome check .`, `cd tests/fixtures/high-readiness-ts && tsc -b`.
- Fixture low-context changes: `cd tests/fixtures/low-context-ts && vitest run`, `cd tests/fixtures/low-context-ts && biome check .`, `cd tests/fixtures/low-context-ts && tsc -b`.
- Fixture missing-context changes: `cd tests/fixtures/missing-context-ts && vitest run`, `cd tests/fixtures/missing-context-ts && biome check .`, `cd tests/fixtures/missing-context-ts && tsc -b`.
- Fixture with-context changes: `cd tests/fixtures/with-context && vitest run`.

## Documentation
- Update `README.md` for CLI demo, generated outputs, model choices, consent flags, review behavior, or examples.
- Update `docs/DEMO_RUNBOOK.md` for manual demo flow, generation flags, model selection, consent, `--force`, or expected output changes.
- Update `CONTRIBUTING.md` if validation or PR workflow changes.
- Update `docs/MVP_RELEASE_REVIEW.md` when acceptance evidence changes.

## Risk checks
- Repository-content transfer to model providers is consent-gated and high risk.
- Generated context artifacts are preserved by default; avoid generated churn unless the task targets generation behavior.
- Lockfiles are high-risk churn areas; do not update `bun.lock` or fixture lockfiles unless dependency work is requested.
- Offline deterministic MVP smoke validates plumbing, not generated content quality.

## Done when
- CLI behavior, help, docs, and tests agree.
- Consent and overwrite safety are preserved or intentionally changed with tests/docs.
- Generated artifact paths match documented paths.
- CLI build and relevant tests/smoke checks ran or skips are explained.
