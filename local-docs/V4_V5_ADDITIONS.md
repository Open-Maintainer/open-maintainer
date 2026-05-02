# v0.4.x and v0.5 Contribution Triage Additions

This note records the aligned product decisions for integrating contribution-quality triage into the current roadmap.

The original problem is real: OSS maintainers increasingly receive low-context issues and polished-looking but unreviewable PRs. AI tools amplify that volume, but Open Maintainer should not try to detect whether a contribution was written by AI.

The product framing is:

```text
Contribution Triage
```

Open Maintainer evaluates whether a contribution is reviewable, scoped, evidenced, validated, and aligned with the repository. It does not evaluate authorship.

## Product Constraints

- The feature must save maintainer time and energy.
- It must not add complexity or create a steep learning curve.
- A maintainer should be able to get Open Maintainer running for one repository and receive useful output in 15 minutes or less.
- The first useful path should work from simple CLI commands and safe defaults.
- Advanced configuration should be optional and reserved for custom labels, comments, closure rules, strictness, and org policy.
- Default behavior must not mutate GitHub state.
- Public product language may mention AI-amplified low-context contribution pressure, but must not claim AI authorship detection.

Avoid product/UI/code language such as:

```text
AI slop detector
AI-written detector
llm-generated
ai-slop
garbage
```

Prefer:

```text
Contribution Triage
Contribution quality
Low-context contribution
Reviewability
Scope
Evidence
Validation
Repo alignment
```

## Milestone Split

v0.4.0 is already released. Any PR-review changes that touch v0.4 scope belong in the v0.4.x line.

### v0.4.x

v0.4.x adds PR-side contribution triage signals inside the shipped PR review beta.

In scope:

- PR intent clarity
- linked issue or acceptance criteria
- diff scope versus stated intent
- validation evidence
- docs alignment
- broad churn
- high-risk files
- generated-file, lockfile, and dependency churn
- maintainer-attention recommendation
- deterministic Contribution Quality Requirements section in generated `AGENTS.md`, mirrored in `CLAUDE.md`

Out of scope:

- full issue triage
- issue labels/comments
- duplicate issue handling
- stale issue handling
- auto-close
- agent task briefs
- separate PR triage write workflow

### v0.5

v0.5 is issue-centered: local-first issue triage and agent-safe backlog.

The primary v0.5 path is CLI, not GitHub Action, because local/subscription-backed provider use can be cheaper than token-billed Action runs.

GitHub Action issue triage should remain available for teams that explicitly want it or use self-hosted providers.

## Categorization Boundary

Issue and PR categorization must be LLM-only.

Allowed deterministic work:

- gather candidate evidence
- fetch issue/PR metadata
- detect changed files and diff stats
- collect issue templates
- retrieve duplicate candidates
- check whether referenced files/commands exist
- collect labels and check status
- pass repo context, generated context, and policy to the LLM
- validate model output schema
- enforce repository-content transfer consent
- map label intents to configured labels
- render deterministic comments
- cap/dedupe writes
- enforce closure guardrails

Not allowed deterministically:

- independently assign `ready_for_review`
- independently assign `needs_author_input`
- independently assign `needs_maintainer_design`
- independently assign `not_agent_ready`
- independently assign `possible_spam`
- independently mark a contribution agent-ready or not-agent-ready

## Primary Classifications

Use categorical outputs, not a default numeric quality score.

Primary classification:

```ts
type ContributionClassification =
  | "ready_for_review"
  | "needs_author_input"
  | "needs_maintainer_design"
  | "not_agent_ready"
  | "possible_spam";
```

Definitions:

- `ready_for_review`: enough context for a maintainer to review, prioritize, or discuss.
- `needs_author_input`: potentially legitimate but missing required context, reproduction, acceptance criteria, logs, environment, affected surface, or validation.
- `needs_maintainer_design`: requires product, API, security, architecture, or governance judgment before implementation planning.
- `not_agent_ready`: may be human-reviewable but lacks the bounded scope or validation plan needed for agent work.
- `possible_spam`: clearly non-actionable, unrelated, abusive, commercial, mass-submitted, or spam-like. This is the only classification eligible for immediate closure when configured.

Keep separate fields for:

```ts
type AgentReadiness = "agent_ready" | "not_agent_ready" | "needs_human_design";

type MaintainerAction =
  | "review_now"
  | "ask_author"
  | "defer"
  | "human_design_required"
  | "close_if_configured";
```

Risk flags are separate from primary classification:

```text
security_sensitive
high_risk_paths
dependency_change
migration
release_or_ci
deployment
auth_or_secrets
generated_file_change
broad_scope
unclear_scope
```

An issue can be human-reviewable and high-risk. Agent assignment can be blocked by risk flags through config.

## v0.4.x PR Contribution Signals

PR contribution triage should be embedded in PR review output.

Signals:

- clear intent
- linked issue or acceptance criteria
- scoped diff
- changed surfaces matching stated intent
- meaningful validation evidence
- docs alignment for public behavior changes
- tests for behavior changes
- broad mechanical churn
- generated/lockfile/dependency changes
- high-risk path rationale
- maintainer attention recommendation

The output should be concise. It should answer whether the PR is ready for maintainer review, needs author input, needs human design, is not agent-ready, or appears spam-like.

Do not add a numeric score in the first documented scope.

## Generated Context Requirements

Context generation should add deterministic policy text to generated `AGENTS.md` and mirror it in `CLAUDE.md`.

Add a required section:

```md
## Contribution Quality Requirements
```

Required content:

- Bug issues should include reproduction steps, expected and actual behavior, affected version/commit/environment when known, and logs or failing commands when available.
- Feature requests should include the user problem, affected surface, and acceptance criteria.
- Security reports should include affected surface and proof-of-concept or credible exploit path. Missing proof should trigger clarification, not automatic dismissal.
- PRs should include clear intent, linked issue or acceptance criteria when available, scoped diff, validation evidence, and docs updates for public behavior changes.
- PRs touching auth, secrets, CI/release, deployment, dependencies, lockfiles, generated files, migrations, or other high-risk paths should include rationale and targeted validation.
- Open Maintainer evaluates reviewability, scope, evidence, validation, and repo alignment. It does not infer whether the author used AI.

This is deterministic context policy text. It is not LLM categorization.

Do not create a new default `CONTRIBUTING_FOR_AGENTS.md` artifact yet.

Do not change generated `.open-maintainer.yml` semantics until implementation work supports the new config.

## v0.5 CLI-First Issue Triage

Primary commands:

```sh
open-maintainer triage issue --number 123
open-maintainer triage issues --state open --limit 25
```

Default behavior:

- fetch issue data
- gather candidate evidence
- require LLM provider and repository-content transfer consent
- run LLM categorization
- print concise console summary
- write local artifacts
- do not apply labels
- do not post comments
- do not create labels
- do not close issues

Write flags:

```sh
--apply-labels
--post-comment
--create-labels
--close-allowed
```

The first useful command should be learnable from one short example plus provider/consent flags. Maintainers should not need dashboard setup, GitHub App installation, or full config knowledge before local triage is useful.

## Labels

The LLM should return canonical label intents. Deterministic code maps those intents to repo-configured or default labels.

Example intents:

```text
needs_author_input
needs_reproduction
needs_acceptance_criteria
not_agent_ready
agent_ready
needs_human_design
security_sensitive
tests_required
docs_required
possible_duplicate
possible_spam
```

Do not auto-create labels by default. If `--apply-labels` is used and mapped labels are missing, report them. Create labels only with `--create-labels`.

## Comments

Public issue comments should be deterministic templates filled with LLM-provided missing information and required author actions.

The comment renderer should control tone and length. It should not accuse the author of using AI.

Example shape:

```md
Open Maintainer could not classify this issue as actionable yet.

Missing information:
- Reproduction steps
- Expected and actual behavior
- Logs or failing command

Please add those details so a maintainer can review it.
```

## Selective Closure

Auto-close is allowed only as a selective, explicitly configured capability.

Rules:

- never enabled by default
- requires repo config and CLI flag
- immediate closure only for `possible_spam`
- low-context legitimate issues should receive an author-input request first
- stale `needs_author_input` closure requires a configured wait window
- every close action should post an explanatory comment unless explicitly disabled
- batch closure should support dry-run review and max closures per run

Example future config shape:

```yaml
contributionTriage:
  issues:
    close:
      enabled: false
      allowedClassifications:
        - possible_spam
      requireComment: true
      staleNeedsAuthorInputDays: 14
      maxClosuresPerRun: 5
```

## Duplicate Detection

Duplicate detection is candidate retrieval plus LLM judgment.

Deterministic code may retrieve related issues through GitHub search, title keywords, labels, or local indexes. The LLM decides whether the issue is a possible duplicate and cites candidate issue numbers/titles.

Use `possible_duplicate`, not confirmed duplicate, unless a maintainer confirms.

Do not auto-close duplicates in v0.5.

## Agent Task Briefs

Task briefs should be a second step only for `agent_ready` issues or when explicitly requested.

Example flags:

```sh
--brief-agent-ready
--brief
```

An `agent_ready` issue requires:

- bounded scope
- likely files or surfaces to read first
- constraints from repo context
- specific validation plan
- done criteria
- risks requiring escalation

If validation cannot be stated from repo context, the issue should not be `agent_ready`.

## Local Artifacts

Default triage output should include a console summary and local artifacts.

Recommended layout:

```text
.open-maintainer/triage/issues/123.json
.open-maintainer/triage/issues/124.json
.open-maintainer/triage/runs/<run-id>.json
.open-maintainer/triage/runs/<run-id>.md
```

Artifacts should be ignored/local by default, not committed as generated context.

Per-issue artifacts should include:

- issue metadata
- classification
- reasons
- required author actions
- label intents
- rendered comment preview
- provider/model metadata
- source context version
- consent mode
- writes applied or skipped
- errors

Batch artifacts should summarize maintainer actions across the run.

## Strictness

Support configurable strictness as LLM instruction policy, not numeric thresholds.

```yaml
contributionTriage:
  issues:
    strictness: balanced # lenient | balanced | strict
```

Meaning:

- `lenient`: favor `ready_for_review` when an issue has enough context for maintainer judgment.
- `balanced`: default; ask for author input when key evidence is missing.
- `strict`: require reproduction, acceptance criteria, and validation plan before agent readiness.

## Testing and Validation

Require both synthetic and real validation.

Synthetic/golden tests should cover:

- schema handling with fake model outputs
- consent gates
- batch CLI flow
- candidate evidence gathering
- label-intent mapping
- deterministic comment rendering
- local artifact layout
- write flags
- closure guardrails
- duplicate candidate retrieval
- task brief rendering
- deterministic Contribution Quality Requirements in generated `AGENTS.md` and `CLAUDE.md`

Real validation should cover a small set of issues across different repository types and confirm that output saves maintainer time instead of creating another review queue.

## Final Position

Open Maintainer should address AI-amplified contribution noise, but the durable product concept is Contribution Triage.

The product should help maintainers answer:

```text
Is this contribution reviewable, actionable, evidenced, scoped, and safe to hand to a human or agent?
```

It should not ask:

```text
Was this written by AI?
```
