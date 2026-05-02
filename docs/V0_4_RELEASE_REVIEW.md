# v0.4 Rule-Grounded PR Review Beta Release Review Packet

Use this packet to approve the v0.4.0 release after the implementation and
documentation commits are on `main`.

## Release Boundary

Included:

- Local CLI `review` command for rule-grounded PR reviews from Git base/head
  refs.
- Local CLI `review --pr <number>` workflow that fetches PR metadata and refs
  through `gh`, runs the selected local model CLI, and posts marked summary plus
  capped inline review comments through `gh`.
- Deterministic review by default, with model-backed review only after explicit
  `--model` and `--allow-model-content-transfer`. Older
  `--review-provider` scripts remain supported as aliases.
- Review output with summary, walkthrough, changed surface, risk analysis,
  expected validation, validation evidence, docs impact, cited findings, merge
  readiness, residual risk, and JSON output.
- Duplicate avoidance for marked summary and inline comments.
- Dashboard PR review previews for registered local repository worktrees.
- Dashboard review run history and guarded posting controls.
- Dashboard finding feedback capture for `false_positive`, `accepted`,
  `needs_more_context`, and `unclear` verdicts.

Excluded:

- GitHub Action review posting that depends on hosted-runner model credentials
  or API token balance.
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
| CLI PR review dry run | Local Git checkout, `gh` auth, local CLI provider credentials plus explicit content-transfer consent | None |
| CLI PR review posting | Local Git checkout, `gh` auth with PR comment/review permission, local CLI provider credentials plus explicit content-transfer consent | Updates one marked PR comment and opens one capped inline review |
| Dashboard review preview | API access to a registered local worktree | None by default |
| Dashboard posting controls | GitHub credentials and PR permissions | Guarded; unavailable credentials return a clear error |

## Release Gate

Run from the repository root:

```sh
bun test packages/review
bun test tests/action-mvp.test.ts
bun test apps/api/tests/api.test.ts
bun test tests/cli-help.test.ts
bun test tests/cli-review.test.ts
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
Base implementation commits: pending final v0.4.0 commit selection
Release documentation commit: this packet's commit

Commands run:

- `bun test tests/action-mvp.test.ts tests/cli-help.test.ts tests/cli-review.test.ts`:
  passed, 18 tests across 3 files.
- `bun lint`: passed.
- `bun typecheck`: passed.
- `bun test`: passed, 111 tests across 22 files.
- `bun run build`: passed, including the Next production build.
- `bun run smoke:mvp`: passed, `MVP smoke passed: 66/100 -> 82/100`.
- Docker Compose smoke was not rerun for this scope change; no Docker Compose
  files or service wiring changed.

Focused v0.4 evidence:

- Review package tests cover precheck evidence, model-backed review validation,
  rendering, inline comment rendering, and local Git diff assembly.
- CLI review tests cover markdown output, JSON output, invalid refs,
  model-content-transfer consent, PR fetching through `gh`, summary posting,
  inline review posting, and posting target guards.
- Action tests cover audit/refresh release dogfooding without hosted PR review
  provider quota requirements.
- GitHub helper tests cover summary comment upsert, inline comment planning,
  duplicate avoidance, capped inline comments, and inline review publication.
- API tests cover dashboard review preview creation/readback, posting guard
  behavior, run history integration, feedback capture, and invalid finding ID
  rejection.
- Shared schema tests cover review feedback verdict validation.

Manual dry-run expectations before tagging:

- Disposable PR CLI run with `review --pr <number> --dry-run` fetches PR
  metadata and produces a local review without writing to GitHub.
- Disposable PR CLI run with `review --pr <number>` creates or updates one
  marked summary comment and creates capped inline comments without duplicating
  existing Open Maintainer fingerprints.
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
