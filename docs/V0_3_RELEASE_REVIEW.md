# v0.3 Action Release Review Packet

Use this packet to approve the v0.3.0 GitHub Action release after the
implementation commits are on `main`.

## Release Boundary

Included:

- Non-mutating `mode: audit` default.
- GitHub Step Summary output for pull request, scheduled, and manual runs.
- Optional marked PR comments through `comment-on-pr: "true"`.
- Scheduled stale-context audits with `fail-on-drift: "true"`.
- Opt-in `mode: refresh` context PRs.
- Deterministic refresh by default.
- Model-backed refresh only with explicit `generation-provider` and
  `allow-model-content-transfer: "true"`.
- Maintainer-owned context files preserved by default during refresh.

Excluded:

- Rule-grounded PR review findings.
- Issue triage.
- Hosted GitHub App scheduled jobs.
- Automatic default-branch pushes.
- Release tagging without maintainer approval.

## Permission Tiers

| Use case | Minimum permissions | GitHub write behavior |
| --- | --- | --- |
| Audit and Step Summary | `contents: read` | None |
| PR comment | `contents: read`, `issues: write`, `pull-requests: read` | Updates one marked PR comment |
| Refresh PR | `contents: write`, `pull-requests: write` | Pushes `open-maintainer/context-refresh` and opens or updates one PR |

## Release Gate

Run from the repository root:

```sh
bun test tests/action-mvp.test.ts
bun lint
bun typecheck
bun test
bun run build
bun run smoke:mvp
docker compose up --build -d
bun run smoke:compose
docker compose down --volumes --remove-orphans
bun run cli doctor .
```

## Evidence

Date: 2026-05-02
Base implementation commit: `106bea6`

Commands run:

- `bun test tests/action-mvp.test.ts`: passed during implementation.
- `bun test tests/action-mvp.test.ts tests/cli-audit.test.ts tests/cli-help.test.ts packages/context/tests/render.test.ts packages/github/tests/webhook.test.ts`:
  passed, 36 tests across 5 files.
- `bun run cli generate . --model codex --context codex --skills codex --allow-write --refresh-generated`:
  passed; refreshed generated context artifacts through the model-backed path.
- `bun run cli doctor .`: passed, `Agent Readiness: 100/100` and all
  required artifacts present.
- `bun lint`: passed.
- `bun typecheck`: passed.
- `bun test`: passed, 68 tests across 16 files.
- `bun run build`: passed, including the Next production build.
- `bun run smoke:mvp`: passed, `MVP smoke passed: 66/100 -> 82/100`.
- `docker compose up --build -d`: passed.
- `bun run smoke:compose`: passed, `Docker Compose smoke passed.`
- `docker compose down --volumes --remove-orphans`: completed cleanup.

Final full-gate evidence:

- Action metadata tests cover the non-mutating audit default, Step Summary
  sections, opt-in comments, explicit refresh mode, model-backed consent guard,
  no default-branch push assertion, scheduled dogfood workflow, and read-only
  dogfood permissions.
- CLI/context tests cover `--refresh-generated` preserving maintainer-owned
  context while refreshing generated files.
- GitHub helper tests cover preserving maintainer-owned files, updating
  generated config, and reusing an existing PR.
- Current generated context is fresh after implementation and documentation
  changes.

Residual risks before tag approval:

- Manual dry-run of `mode: refresh` against a disposable repository is still
  recommended before tagging v0.3.0.

## Maintainer Decision

- Decision:
- Reviewer:
- Date:
- Commit or PR SHA:
- v0.3-blocking follow-up issues:
