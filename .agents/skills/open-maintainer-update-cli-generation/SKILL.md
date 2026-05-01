---
name: open-maintainer-update-cli-generation
description: Use when changing the Bun CLI audit, generate, init, doctor, PR, model consent, or generated context artifact workflow.
---
# Update CLI Generation

## Use when
- Editing `apps/cli/src/index.ts`.
- Changing `audit`, `generate`, `init`, `doctor`, or `pr` behavior.
- Changing generation flags, consent behavior, deterministic mode, dry-run behavior, generated outputs, profile/report writes, or context skill targets.

## Do not use when
- The change is only dashboard/API behavior with no CLI contract change.
- The task is only to run the CLI demo; use validation/testing commands instead.

## Read first
- `AGENTS.md` CLI and generated-file rules.
- `apps/cli/src/index.ts`.
- `apps/cli/package.json`.
- `apps/cli/tsconfig.json`.
- Related packages imported by the CLI: `packages/ai`, `packages/analyzer`, and `packages/context` source files relevant to the change.
- `README.md` CLI Demo and generated output sections.
- `docs/DEMO_RUNBOOK.md`.
- Tests or smoke scripts under `tests/smoke` and fixtures under `tests/fixtures/*` relevant to the CLI path.

## Workflow
- Preserve existing context files by default; require intentional `--force` for overwrites.
- Do not send repository content to model-backed generation without explicit consent such as `--allow-write`.
- Keep `--model`, `--context`, and `--skills` semantics aligned with README and demo runbook.
- Keep generated output paths aligned with documented artifacts: `AGENTS.md`, `.agents/skills/<repo>-*/SKILL.md`, `.open-maintainer/profile.json`, `.open-maintainer/report.md`, `.open-maintainer.yml`, and Claude equivalents when selected.
- Add or update tests for generated output, consent gates, CLI behavior, or context PR behavior changes.
- Update docs for user-facing flags, examples, generated outputs, or safety behavior.

## Validation
- CLI build: `bun run --cwd apps/cli build`.
- TypeScript project validation: `tsc -b`.
- Behavior tests: `vitest run`.
- MVP smoke for CLI demo path: `bun run tests/smoke/mvp-demo.ts` or `bun run smoke:mvp`.
- Fixture low-context when fixture behavior changes: `bun run --cwd tests/fixtures/low-context-ts test`, `bun run --cwd tests/fixtures/low-context-ts build`, `bun run --cwd tests/fixtures/low-context-ts lint`.
- Fixture with-context when fixture behavior changes: `bun run --cwd tests/fixtures/with-context test`.
- Broad CLI public behavior change: `bun lint && bun typecheck && bun test && bun run build && bun run smoke:mvp`.

## Documentation
- Update `README.md` for CLI demo, generated outputs, GitHub Action audit notes, or quality gate changes.
- Update `docs/DEMO_RUNBOOK.md` for manual demo, generation flags, model selection, consent, `--force`, or expected output changes.
- Update `CONTRIBUTING.md` if PR workflow or validation commands change.
- Update `docs/MVP_RELEASE_REVIEW.md` if acceptance evidence changes.

## Risk checks
- Consent gates and repository-content transfer are high risk.
- Generated context artifacts are preserved by default; do not create churn in generated files unless the task targets generation behavior.
- Lockfiles are high risk; do not update `bun.lock` or fixture lockfiles unless dependency work is requested.
- Offline deterministic MVP smoke validates plumbing, not generated content quality.

## Done when
- CLI behavior and help text stay consistent.
- Consent and overwrite safety are preserved or intentionally changed with tests/docs.
- Generated artifact paths match docs.
- CLI build and relevant tests/smoke checks ran or skips are explained.