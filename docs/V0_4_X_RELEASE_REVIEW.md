# v0.4.x PR Contribution Triage Signals Release Review Packet

Use this packet to approve the v0.4.x additive release after the implementation
and documentation commits are on `main`.

## Release Boundary

Included:

- Deterministic Contribution Quality Requirements text appended to generated
  `AGENTS.md` and `CLAUDE.md`.
- PR review precheck evidence candidates for intent clarity, linked issue or
  acceptance criteria, diff scope, validation evidence, docs alignment, broad
  churn, high-risk paths, generated files, lockfiles, and dependency manifests.
- Model-backed PR review output with one categorical contribution-triage result:
  `ready_for_review`, `needs_author_input`, `needs_maintainer_design`,
  `not_agent_ready`, or `possible_spam`.
- Review markdown, marked GitHub summary comments, CLI JSON output, and
  dashboard review previews that surface contribution-triage signals.
- A `not_evaluated` contribution-triage fallback for legacy or deterministic
  review-shaped objects that do not include model classification.

Excluded:

- Numeric contribution quality scores.
- AI authorship detection.
- Full issue triage.
- Issue labels, issue comments, duplicate issue handling, stale issue handling,
  auto-close, and agent task briefs.
- New PR triage write workflows beyond the existing PR review summary and inline
  comment behavior.
- Hosted Action review posting scope changes.

## Safety Boundary

Open Maintainer evaluates reviewability, scope, evidence, validation, and
repository alignment. It does not evaluate whether a contributor used AI.

PR review users receive contribution-triage signals inside the existing review
flow. They do not need to configure a separate triage workflow or policy
taxonomy for v0.4.x.

Deterministic code may gather candidate evidence, but LLM-backed review owns the
categorical contribution-triage result. Generated context policy text remains
deterministic and separate from model classification.

## Validation Evidence

Date: 2026-05-03

Implementation commits:

- `a435072` - add contribution quality requirements to generated context.
- `22097c3` - gather PR contribution triage evidence.
- `3de8323` - classify contribution triage in model reviews.
- `2258a44` - render contribution triage across review outputs.
- `0359463` - show contribution triage in dashboard review previews.

Focused commands run:

- `bun test packages/context/tests/render.test.ts`: passed, 16 tests.
- `bun test tests/mvp-golden.test.ts`: passed, 1 test.
- `bun run --cwd packages/context build`: passed.
- `bun test packages/review/tests/precheck.test.ts`: passed, 6 tests.
- `bun test packages/review/tests/model.test.ts`: passed, 7 tests.
- `bun test packages/review/tests/local-git.test.ts`: passed, 2 tests.
- `bun test packages/shared/tests/schemas.test.ts`: passed, 3 tests.
- `bun test packages/review/tests/render.test.ts`: passed, 8 tests after
  renderer changes.
- `bun test tests/cli-review.test.ts`: passed, 6 tests.
- `bun test tests/action-mvp.test.ts`: passed, 7 tests.
- `bun test apps/api/tests/api.test.ts`: passed, 14 tests.
- `bun test tests/web-redirect.test.ts`: passed, 1 test.
- `bun run --cwd packages/shared build && bun run --cwd packages/review build`:
  passed.
- `bun run --cwd apps/web build`: passed.
- `bun run typecheck`: passed.
- Targeted `bunx biome check ...` commands for touched context, review, shared,
  API, CLI-test, and web files: passed.
- `git diff --check`: passed after each implementation slice.

## Final Release Gate

Commands run before closing the release issue:

```sh
bun lint
bun typecheck
bun test
bun run build
bun run smoke:mvp
```

Results on 2026-05-03:

- `bun lint`: passed, Biome checked 92 files.
- `bun typecheck`: passed.
- `bun test`: passed, 116 tests across 22 files.
- `bun run build`: passed, including the Next production build.
- `bun run smoke:mvp`: passed, `MVP smoke passed: 66/100 -> 82/100`.
- `bunx biome check README.md docs/V0_4_X_RELEASE_REVIEW.md`: skipped by
  Biome because Markdown files are not processed by this repo's Biome config.

Run Docker Compose smoke only when Docker is available or when service wiring
changes:

```sh
docker compose up --build -d
bun run smoke:compose
docker compose down --volumes --remove-orphans
```

Docker Compose smoke is not required for this v0.4.x scope unless a maintainer
wants full release parity, because no Docker Compose services, ports, volumes,
or environment wiring changed.

## Residual Risks

- Contribution-triage category quality depends on model judgment and should be
  sampled on real PRs before broad rollout.
- Dashboard review history still uses the current self-hosted foundation state;
  durable database-backed review history remains v0.7 scope.
- The Action remains audit/refresh focused unless explicitly configured; hosted
  Action review posting remains outside this v0.4.x release boundary.

## Maintainer Decision

- Decision:
- Reviewer:
- Date:
- Commit or PR SHA:
- v0.4.x-blocking follow-up issues:
