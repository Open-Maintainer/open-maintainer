# v0.4 Rule-Grounded PR Review Beta Release Review Packet

Use this packet to approve the v0.4.0 release after the implementation and
documentation commits are on `main`.

## Release Boundary

Included:

- Local CLI `review` command for rule-grounded PR reviews from Git base/head
  refs.
- Deterministic review by default, with model-backed review only after explicit
  `--review-provider` and `--allow-model-content-transfer`.
- Review output with summary, walkthrough, changed surface, risk analysis,
  expected validation, validation evidence, docs impact, cited findings, merge
  readiness, residual risk, and JSON output.
- GitHub Action `mode: review` with Step Summary output by default.
- Opt-in marked review summary comments through `review-comment-on-pr: "true"`.
- Opt-in capped inline review comments through
  `review-inline-comments: "true"` and `review-inline-cap`.
- Duplicate avoidance for marked summary and inline comments.
- Dashboard PR review previews for registered local repository worktrees.
- Dashboard review run history and guarded posting controls.
- Dashboard finding feedback capture for `false_positive`, `accepted`,
  `needs_more_context`, and `unclear` verdicts.

Excluded:

- CLI-posted GitHub review comments. CLI review remains local and non-mutating
  in v0.4.
- Dashboard GitHub posting without configured credentials and permissions.
- Merge-blocking required checks from review results.
- Durable database-backed review history beyond the current self-hosted
  foundation.
- Issue triage.
- Agent orchestration.
- Hosted product behavior.
- Release tagging without maintainer approval.

## Permission Tiers

| Use case | Minimum permissions | GitHub write behavior |
| --- | --- | --- |
| CLI local review | Local Git checkout | None |
| Action review Step Summary | `contents: read` | None |
| Model-backed review | Local CLI provider credentials plus explicit content-transfer consent | None by itself |
| Action review summary comment | `contents: read`, `issues: write`, `pull-requests: read` | Updates one marked PR comment |
| Action capped inline comments | `contents: read`, `pull-requests: write` | Opens one pull request review with capped inline comments |
| Dashboard review preview | API access to a registered local worktree | None by default |
| Dashboard posting controls | GitHub credentials and PR permissions | Guarded; unavailable credentials return a clear error |

## Release Gate

Run from the repository root:

```sh
bun test packages/review
bun test tests/action-mvp.test.ts
bun test apps/api/tests/api.test.ts
bun test tests/cli-help.test.ts
bun run cli review . --base-ref HEAD~1 --head-ref HEAD --output-path /tmp/open-maintainer-review.md
bun run cli review . --base-ref HEAD~1 --head-ref HEAD --json
bun lint
bun typecheck
bun test
bun run build
bun run smoke:mvp
bun run cli doctor .
docker compose up --build -d
bun run smoke:compose
docker compose down --volumes --remove-orphans
```

## Evidence

Date: 2026-05-02
Base implementation commits: `6a589c9` through `58322b6`
Release documentation commit: this packet's commit

Commands run:

- `bun test packages/review`: passed, 19 tests across 4 files.
- `bun test tests/action-mvp.test.ts`: passed, 8 tests.
- `bun test apps/api/tests/api.test.ts`: passed, 11 tests.
- `bun test tests/cli-help.test.ts`: passed, 5 tests.
- `bun run cli review . --base-ref HEAD~1 --head-ref HEAD --output-path /tmp/open-maintainer-review.md`:
  passed and wrote review markdown.
- `bun run cli review . --base-ref HEAD~1 --head-ref HEAD --json`: passed;
  produced a valid review result with 2 findings across 12 changed files.
- `bun run cli generate . --model codex --context codex --skills codex --allow-write --refresh-generated`:
  passed; refreshed generated context artifacts through the model-backed path.
- `bun lint`: passed.
- `bun typecheck`: passed.
- `bun test`: passed, 105 tests across 21 files.
- `bun run build`: passed, including the Next production build.
- `bun run smoke:mvp`: passed, `MVP smoke passed: 66/100 -> 82/100`.
- `bun run cli doctor .`: passed, `Agent Readiness: 100/100` and all
  required artifacts present.
- `docker compose up --build -d`: passed.
- `bun run smoke:compose`: passed, `Docker Compose smoke passed.`
- `docker compose down --volumes --remove-orphans`: completed cleanup.

Focused v0.4 evidence:

- Review package tests cover precheck evidence, model-backed review validation,
  rendering, inline comment rendering, and local Git diff assembly.
- CLI review tests cover markdown output, JSON output, invalid refs,
  model-content-transfer consent, and non-mutating posting guards.
- Action tests cover review mode, Step Summary output, summary comment opt-in,
  inline comment opt-in, duplicate markers, and default no-write behavior.
- GitHub helper tests cover summary comment upsert, inline comment planning,
  duplicate avoidance, capped inline comments, and inline review publication.
- API tests cover dashboard review preview creation/readback, posting guard
  behavior, run history integration, feedback capture, and invalid finding ID
  rejection.
- Shared schema tests cover review feedback verdict validation.

Manual dry-run expectations before tagging:

- Disposable PR Action run with `mode: review` and read-only permissions writes
  only the Step Summary.
- Disposable PR Action run with `review-comment-on-pr: "true"` and
  `issues: write` creates one marked review summary comment and updates it on
  rerun.
- Disposable PR Action run with `review-inline-comments: "true"` and
  `review-inline-cap` creates no more than the configured number of inline
  comments and does not duplicate them on rerun.
- Dashboard dry run analyzes a local repo, creates a review preview, records a
  review run, submits false-positive feedback with a reason, and reads the
  feedback back with the review.

Residual risks before tag approval:

- Dashboard review state is still in the self-hosted foundation path and is not
  durable enough for v0.7 expectations.
- Dashboard GitHub posting is intentionally guarded until credentials and
  permission UX are hardened.
- Model-backed review quality depends on provider output and should be sampled
  on real repositories before broad rollout.
- Inline comments are capped and duplicate-aware, but disposable-repo dry runs
  are still recommended before tagging.

## Maintainer Decision

- Decision:
- Reviewer:
- Date:
- Commit or PR SHA:
- v0.4-blocking follow-up issues:
