# v0.5 Issue Triage Release Review

Date: 2026-05-03

Scope: local issue triage, bounded batch reports, explicit issue label/comment
and closure writes, agent-safe task briefs, and explicit GitHub Action issue
triage mode.

## Release Boundary

Included:

- Local `triage issue` command for one GitHub issue.
- Local `triage issues` command for bounded batches.
- Model-backed issue classification with explicit repository-content transfer
  consent.
- Local artifacts under `.open-maintainer/triage/issues/` and
  `.open-maintainer/triage/runs/`.
- Deterministic public comment rendering from model-provided missing
  information and author actions.
- Opt-in issue label application and missing-label creation.
- Config-gated closure for `possible_spam` and stale `needs_author_input`
  only.
- Second-step `triage brief` command that works from an existing local triage
  artifact without refetching GitHub evidence or calling a model provider.
- Explicit GitHub Action `mode: issue-triage` for teams that want token-based
  or CI-backed issue triage.

Excluded:

- Agent dispatch, branch creation, PR creation, or validation execution from
  issue triage.
- Hosted scheduled issue triage.
- Dashboard issue triage views.
- Broad stale issue management.
- PR contribution triage changes beyond existing PR review behavior.

## Documentation Evidence

- `README.md` includes local single-issue and batch issue triage examples.
- `README.md` documents `.open-maintainer/triage/` artifact paths and treats
  them as local operational history for maintainer inspection.
- `README.md` distinguishes read-only defaults from explicit label, comment,
  and closure writes.
- `README.md` documents Action read-only and opt-in write examples with
  required permissions.
- `docs/DEMO_RUNBOOK.md` includes first-use local issue triage commands,
  artifact paths, write gates, task brief flow, Action issue triage examples,
  and expected behavior.
- `docs/ROADMAP.md` marks v0.5 issue triage as shipped beta and keeps v0.6
  agent orchestration out of scope.
- Existing docs continue to state that Open Maintainer evaluates
  reviewability, scope, evidence, validation, and repo alignment, not whether
  an author used AI.

## Validation Evidence

Commands run for the completed v0.5 implementation slice:

- `bun test packages/triage/tests/index.test.ts tests/cli-help.test.ts tests/cli-triage.test.ts`:
  passed, 34 tests.
- `bun test tests/action-mvp.test.ts`: passed, 8 tests.
- `bun lint`: passed.
- `bun typecheck`: passed.
- `bun test`: passed, 159 tests across 24 files.
- `bun run build`: passed, including package builds, API/worker builds, CLI
  build, and Next production build.
- `bun run smoke:mvp`: passed, `MVP smoke passed: 66/100 -> 82/100`.

Docker/Compose smoke was not run for this release evidence pass because the
v0.5 issue triage slices did not change Docker Compose services, ports,
volumes, environment wiring, API/web/worker integration, or self-hosted stack
behavior.

## Synthetic And Fixture Evidence

- Fake Codex CLI issue triage output covers `needs_author_input`,
  `ready_for_review`, `possible_spam`, malformed JSON, missing citations, and
  batch per-issue failures.
- CLI tests cover repository-content transfer consent, single-issue artifacts,
  batch JSON/Markdown reports, label creation/application gates, marked comment
  posting and updating, closure guardrails, closure caps, stale author-input
  closure, and task brief generation.
- Package tests cover evidence gathering, referenced surfaces, acceptance
  criteria extraction, prompt boundaries, schema parsing, label-intent mapping,
  deterministic comments, and task brief rendering.
- Action tests cover unsupported modes, content-transfer consent, read-only
  issue triage defaults, opt-in write inputs, write-input gating, pull-request
  event separation, and permissions documentation expectations.

## Real-Issue Validation Sample

Maintainer/provider validation is still required before calling v0.5 release
complete. This agent pass did not run real-provider issue triage against public
issues because repository-content transfer to a model provider requires
explicit maintainer consent.

Planned sample shape:

| Repository type | Issue shape | Expected usefulness to inspect | Model-quality concerns to record |
| --- | --- | --- | --- |
| TypeScript monorepo | Feature issue with acceptance criteria and likely files | Classification, likely files, validation commands, and task brief quality | Whether the model overstates readiness or misses high-risk paths |
| Small library/package | Low-context bug or support issue | Missing-information prompts and author-action usefulness | Whether requested details are specific enough |
| Docs/tooling repository | Broad docs/process request | Maintainer-design classification and escalation boundaries | Whether the model confuses docs-only work with implementation readiness |

Do not publish sensitive issue bodies or source excerpts in release notes. Record
only repository type, issue shape, observed usefulness, and model-quality
concerns.

## Config Check

Generated `.open-maintainer.yml` continues to include only supported generated
metadata by default. Issue triage closure config is parsed when present, but
generated config does not advertise unsupported contribution triage keys.

Supported closure keys:

- `allowPossibleSpam`
- `allowStaleAuthorInput`
- `staleAuthorInputDays`
- `maxClosuresPerRun`
- `requireCommentBeforeClose`

## Residual Risks

- Real-provider issue quality has not been validated in this agent pass because
  explicit model-content-transfer consent was not provided.
- Action issue triage consumes GitHub Action minutes and token permissions when
  teams opt in; local CLI triage remains the lower-friction first path.
- Closure behavior is intentionally narrow, but maintainers should review
  `.open-maintainer.yml` closure settings before enabling `--close-allowed` or
  `issue-close-allowed`.
- `.open-maintainer/triage/` artifacts can contain issue evidence and model
  output. Treat them as local operational history and review before committing
  them to a repository.

## Maintainer Decision

- Decision:
- Reviewer:
- Date:
- Commit or PR SHA:
- MVP-blocking follow-up issues:
