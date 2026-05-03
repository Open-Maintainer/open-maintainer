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

- `bun test tests/cli-triage.test.ts`: passed, 18 tests. This includes the
  command-backed mock issue batch that covers every primary issue triage
  classification and the batch error bucket.
- `bunx biome check tests/cli-triage.test.ts tests/helpers/fake-model-cli.ts docs/V0_5_RELEASE_REVIEW.md`:
  passed for the touched files.
- `bun test packages/triage/tests/index.test.ts tests/cli-help.test.ts tests/cli-triage.test.ts`:
  passed, 35 tests.
- `bun test tests/action-mvp.test.ts`: passed, 8 tests.
- `bun lint`: current follow-up run failed only on pre-existing generated
  `.open-maintainer/profile.json` formatting for `primaryLanguages` and
  `workspaceManifests`; touched-file Biome check passed.
- `bun typecheck`: passed.
- `bun test`: passed, 160 tests across 24 files.
- `bun run build`: passed, including package builds, API/worker builds, CLI
  build, and Next production build.
- `bun run smoke:mvp`: passed, `MVP smoke passed: 66/100 -> 82/100`.
- `bun run cli triage issues . --state open --limit 6 --model codex
  --allow-model-content-transfer`: passed against upstream issues #90 through
  #95 with preview-only GitHub writes. The run produced
  `.open-maintainer/triage/runs/triage_run_65e8737b-0026-4484-9d2e-4250d01477c1.{json,md}`.
- `bun run cli triage issue . --number 96 --model codex
  --allow-model-content-transfer`: passed against upstream issue #96 with
  preview-only GitHub writes.
- `bun run cli triage issue . --number 97 --model codex
  --allow-model-content-transfer`: passed against upstream issue #97 with
  preview-only GitHub writes.

Docker/Compose smoke was not run for this release evidence pass because the
v0.5 issue triage slices did not change Docker Compose services, ports,
volumes, environment wiring, API/web/worker integration, or self-hosted stack
behavior.

## Synthetic And Fixture Evidence

- Fake Codex CLI issue triage output covers `needs_author_input`,
  `ready_for_review`, `needs_maintainer_design`, `not_agent_ready`,
  `possible_spam`, malformed JSON, missing citations, and batch per-issue
  failures.
- CLI tests create realistic mock GitHub issues and run
  `triage issues <repo> --state open --limit 6 --model codex
  --allow-model-content-transfer` against a fake `gh` API plus fake Codex CLI.
  The mock batch covers:
  - ready implementation request with acceptance criteria and likely files;
  - low-context dashboard bug needing reproduction and validation evidence;
  - stale issue closure policy request needing maintainer design;
  - security-sensitive webhook credential task that is not agent-ready;
  - promotional spam-like issue with no repo-specific requested change;
  - malformed provider output as the batch error scenario.
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

Maintainer/provider validation ran against upstream public issues in
Open-Maintainer/open-maintainer with explicit repository-content-transfer
consent. GitHub writes were preview-only; no labels, comments, or closures were
applied.

Observed sample:

| Repository type | Issue shape | Expected usefulness to inspect | Model-quality concerns to record |
| --- | --- | --- | --- |
| TypeScript monorepo | Scoped CLI feature with acceptance criteria and likely files, #90 | Classified ready for review with concrete implementation and validation next action | Count-summary request was treated as agent-ready; reviewer should still confirm it is in scope |
| TypeScript monorepo | Low-context dashboard bug, #91 | Classified needs author input with reproduction details requested | The model correctly avoided agent handoff until the affected form path is confirmed |
| TypeScript monorepo | Maintainer policy decision, #92 | Classified needs maintainer design with default-policy questions preserved | No concern observed |
| TypeScript monorepo | Security-sensitive webhook secret rotation, #93 | Classified needs maintainer design with security review escalation | Could also plausibly be `not_agent_ready`; classification remained useful because agent readiness was human-design gated |
| TypeScript monorepo | Promotional/out-of-scope request, #94 | Classified possible spam with no agent implementation recommended | No concern observed |
| TypeScript monorepo | Malformed provider-output handling bug, #95 | Classified ready for review with test command called out | No concern observed |
| TypeScript monorepo | Unsafe command-execution automation request, #96 | Classified needs maintainer design with security, high-risk path, broad-scope, and missing-validation flags | Could also plausibly be `not_agent_ready`; model prioritized maintainer design because policy decisions were unresolved |
| TypeScript monorepo | Local webhook verification bypass request, #97 | Classified needs maintainer design with security and high-risk path flags | Could also plausibly be `not_agent_ready`; model again prioritized maintainer design for a security-sensitive policy choice |

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
