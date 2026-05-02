# Open Maintainer Roadmap

Open Maintainer is the open-source control plane for AI agents working in GitHub repositories.

The product starts with durable repository context: it audits how a repository actually works, turns that reality into reviewable instructions and policy files, and keeps those artifacts fresh as the repo changes. Later milestones use that approved context to review pull requests, triage issues, prepare agent-safe tasks, and coordinate agent work without losing human control.

This document is the canonical roadmap for product sequencing, milestone scope, and completion criteria. `docs/PRODUCT_PRD.md` is the detailed product requirements companion and should stay aligned with this roadmap.

## Product Thesis

GitHub repositories are becoming execution environments for AI coding agents, but most repositories are not ready for that. Instructions are scattered, validation expectations are implicit, risk areas are undocumented, and AI-generated work often lacks the repo-specific context that human maintainers carry in their heads.

Open Maintainer makes that operational memory explicit.

The core loop is:

```text
audit repository
-> generate versioned context and policy
-> keep context fresh
-> review PRs against repo rules
-> triage issues into agent-safe tasks
-> orchestrate agents with human approval and audit trails
```

## Positioning

Open Maintainer is not just an `AGENTS.md` generator, a PR review bot, or a project board. It is a GitHub-native maintenance layer centered on versioned engineering context.

Commercial tools validate adjacent categories:

- Coding agents validate issue-to-PR workflows.
- AI review products validate repo-aware PR feedback and policy enforcement.
- Project tools validate GitHub-adjacent issue and planning workflows.

Open Maintainer's differentiator is that these workflows share one open, inspectable source of repo truth: detected repository facts, maintainer-approved policy, generated agent context, contribution-quality requirements, and recorded validation evidence.

AI tools have increased the volume of low-context issues and polished-looking but unreviewable PRs. Open Maintainer should address that pressure through contribution triage: evaluating reviewability, scope, evidence, validation, and repo alignment. It should not try to detect whether a contribution was written by AI.

## Operating Principles

- Context first: repo profile, generated instructions, and policy files are the product foundation.
- GitHub-native: work should happen through GitHub issues, pull requests, checks, comments, labels, and app permissions.
- OSS-first and self-hostable: v1.0 must be useful without hosted infrastructure.
- Hosted is committed: hosted packaging is not optional, but it starts after the OSS platform is cohesive.
- Human-in-the-loop by default: Open Maintainer suggests, drafts, reviews, and opens PRs; it does not silently mutate repositories.
- Evidence-grounded AI: findings should cite repo rules, changed files, generated context, CI status, or explicit user input.
- Safe repository content transfer: repository content leaves the environment only after explicit provider or agent consent.
- Auditable writes: GitHub writes must be explicit, reviewable, and traceable to a user, run, policy, and source context version.
- Conservative automation: automatic comments, labels, refresh PRs, and agent dispatch are opt-in.
- Maintainer effort reduction: every workflow must save maintainer time and energy, avoid steep learning curves, and keep complexity hidden behind safe defaults.
- Fast adoption: a maintainer should be able to get Open Maintainer running for one repository and receive useful output in 15 minutes or less.

## Current State

| Surface | Status | Notes |
| --- | --- | --- |
| CLI audit/generate/doctor flow | Shipped | CLI can audit repositories, generate context artifacts, detect drift, and summarize PR intent. |
| Repository profile and readiness score | Shipped | Deterministic analyzer and reports produce repo facts, readiness categories, and missing-context guidance. |
| Context artifact generation | Shipped | `AGENTS.md`, `.open-maintainer.yml`, repo-local skills, profile, and report generation exist. |
| GitHub Action audit/drift/comment mode | Shipped | Audit mode can warn on missing context and drift and can comment on PRs when configured. |
| Self-hosted dashboard context workflow | Shipped foundation | Dashboard supports repository analysis, provider consent, artifacts, run history, and context PR workflows, but needs refinement, durable-state hardening, and extensive debugging. |
| GitHub App and context PR flow | Foundation exists | Webhooks, installation metadata, auth helpers, and context PR helpers exist, but production install/admin polish and durable persistence need work. |
| PR review product | Shipped beta | CLI, Action, and dashboard preview paths can generate rule-grounded PR reviews. GitHub summary and inline comments are opt-in in the Action; dashboard posting remains credential-gated. |
| Issue triage product | Planned | No issue classification, label suggestion, or task brief workflow is shipped yet. |
| Agent orchestration | Experimental | Planned as an explicit experimental track, not a v1.0 autonomous-coding promise. |
| Hosted product | Planned | Committed after v1.0 as hosted private beta and later hosted scale milestones. |

Status terms:

- Shipped: supported product path exists.
- Shipped foundation: usable path exists, but reliability, UX, or durability must improve before it becomes the primary surface.
- Foundation exists: lower-level pieces exist, but the product workflow is not complete.
- Planned: not built.
- Experimental: intentionally high-risk or non-committed behavior behind explicit boundaries.

## Roadmap Summary

| Milestone | Name | Primary Goal |
| --- | --- | --- |
| v0.1 | Context MVP | Shipped CLI and dashboard foundation for repo audit and context generation. |
| v0.2 | Readiness Quality | Make audit, drift, and readiness reporting trustworthy. |
| v0.3 | GitHub Action | Make context checks and refresh PRs installable with one workflow file. |
| v0.4 | Rule-Grounded PR Review Beta | Review PRs using approved repo context, policy, and validation expectations. |
| v0.4.x | PR Contribution Triage Signals | Add PR-side contribution quality signals to the shipped PR review beta. |
| v0.5 | Issue Triage and Agent-Safe Backlog | Locally triage issue quality, suggest actions, and produce task briefs. |
| v0.6 | Agent Orchestration Experimental | Dispatch external agents with isolated workspaces, approvals, and audit trails. |
| v0.7 | GitHub App and Self-Hosted Dashboard Alpha | Harden the shipped dashboard and GitHub App into a durable self-hosted product. |
| v0.8 | Org Policy and Multi-Repo Governance | Add org-level policies, repo overrides, shared skill packs, and multi-repo views. |
| v1.0 | OSS Agent Maintenance Platform | Cohesive self-hostable platform across context, review, triage, dashboard, and policy. |
| v1.1 | Hosted Private Beta | Managed GitHub App, scheduled jobs, durable run history, org dashboard, and team auth. |
| v1.2+ | Hosted Scale and Enterprise Controls | Usage controls, audit exports, SSO, policy UI, and multi-org administration. |

## v0.1: Context MVP

Status: shipped.

The first shipped product wedge is repository audit and context generation. The CLI is the most reliable MVP path today. The self-hosted dashboard is also shipped as a foundation for repository analysis, provider consent, context preview, run history, and context PR workflows.

Scope:

- Audit a repository and detect languages, frameworks, package manager, commands, CI, docs, risk hints, and existing context.
- Generate a versioned repo profile and readiness report.
- Generate `AGENTS.md`, `.open-maintainer.yml`, repo-local skills, and related context artifacts.
- Preserve existing generated context unless explicitly forced.
- Require explicit consent before model-backed generation sends repository content to a provider.
- Keep smoke tests on fake local model providers so context generation and PR
  review stay on the LLM-backed path.
- Provide GitHub Action audit mode for missing context and drift warnings.
- Provide a dashboard foundation for self-hosted analysis and context PR flows.

Complete when:

- Product outcome: a user can audit a repo, generate context, run doctor, and inspect readiness output from the CLI.
- Product outcome: a self-hosted user can use the dashboard foundation for repo analysis, provider consent, generated artifact preview, run history, and context PR workflows.
- Validation evidence: CLI smoke, action tests, context render tests, and dashboard/API build paths cover the shipped workflow.
- Quality bar: generated context is reviewable, existing files are preserved by default, and repo content transfer requires explicit consent.

## v0.2: Readiness Quality

Goal: make Open Maintainer trusted as a repo-readiness auditor before expanding automation.

Priority is audit, drift, and reporting first; generation expansion is secondary.

Scope:

- Deepen repo profiling for commands, CI, docs, ownership hints, generated files, lockfiles, environment variables, issue templates, PR templates, risk paths, and package boundaries.
- Improve context drift detection beyond profile-hash mismatch.
- Explain drift using changed scripts, CI, docs, templates, apps/packages, and high-risk paths.
- Improve readiness reports with concrete next actions and evidence.
- Add quality categories for setup clarity, architecture clarity, testing, CI, docs, risk handling, generated-file handling, and agent instructions.
- Improve generated skills only where repository evidence supports more specific workflows.

Complete when:

- Product outcome: readiness reports clearly explain what is missing, stale, risky, or ambiguous.
- Validation evidence: representative fixtures cover high-readiness, low-readiness, drift, and missing-context cases.
- Quality bar: drift findings identify the changed surface, not just that a hash changed.
- Quality bar: recommendations are tied to repo evidence and avoid invented policies.

## v0.3: GitHub Action

Goal: make Open Maintainer useful through one workflow file.

Default behavior remains audit/check/comment with no repository mutation. Refresh PRs are opt-in.

Scope:

- Keep default `audit` mode non-mutating.
- Add richer PR comments or check summaries for readiness, drift, changed surface, docs likely affected, tests likely expected, and missing validation evidence.
- Support scheduled workflow usage.
- Add opt-in refresh PR support through explicit mode or `open-pr: true`.
- Document required permissions for comments and refresh PRs.
- Ensure model-backed generation in CI requires explicit provider configuration and consent.

Complete when:

- Product outcome: a repository can install Open Maintainer with one workflow file and get useful readiness and drift feedback on PRs.
- Product outcome: a scheduled workflow can detect stale context and optionally open a refresh PR.
- Validation evidence: action tests cover no-write default behavior, PR comment output, drift behavior, and opt-in write permissions.
- Quality bar: the action never mutates the checked-out repository or pushes branches unless explicitly configured.

## v0.4: Rule-Grounded PR Review Beta

Status: shipped beta.

Goal: provide the first direct repo-aware review product.

Default behavior is local maintainer control first. The GitHub Action remains audit/refresh focused; PR review posting runs from the CLI with the maintainer's local `gh` and model CLI authentication.

Scope:

- Generate PR summaries, walkthroughs, changed-surface analysis, risk analysis, docs impact, expected validation, and merge-readiness signals.
- Review against repo profile, `.open-maintainer.yml`, generated context, changed paths, CI status, and issue acceptance criteria when available.
- Produce findings only when they cite repo rules or concrete evidence.
- Support severity levels: blocker, major, minor, note.
- Support local CLI review output for manual maintainer-controlled review.
- Add `open-maintainer review --pr <number>` to fetch PR refs and metadata through `gh`.
- Post one marked summary comment and capped duplicate-aware inline finding comments through `gh`.
- Support `--dry-run` for PR review previews without GitHub writes.
- Add dashboard review previews before any GitHub write.
- Add dashboard finding feedback capture for false positives, accepted findings, needs-more-context findings, and unclear findings.
- Avoid duplicate comments on repeated pushes.
- Capture false-positive feedback.

Complete when:

- Product outcome: maintainers can review a PR using Open Maintainer from a locally authenticated CLI and post rule-grounded findings to GitHub.
- Product outcome: maintainers can preview reviews in the dashboard and capture finding feedback for release-quality tuning.
- Validation evidence: tests cover changed-surface detection, required validation inference, docs alignment, severity classification, duplicate avoidance, CLI PR fetching and posting, dashboard preview, and feedback capture.
- Quality bar: review findings cite repo evidence and avoid generic critique.
- Quality bar: hosted Action review comments are out of release scope; CLI PR posting requires an explicit maintainer command and supports `--dry-run`.

## v0.4.x: PR Contribution Triage Signals

Goal: tighten the shipped PR review beta with contribution-quality signals without changing v0.4.0 release scope.

This is an additive v0.4.x line because v0.4.0 is already released. The feature name is Contribution Triage, but v0.4.x is limited to PR-side signals inside PR review output.

Scope:

- Add PR contribution triage signals for intent clarity, linked issue or acceptance criteria, diff scope versus stated intent, validation evidence, docs alignment, broad churn, high-risk files, generated-file changes, lockfile changes, dependency changes, and maintainer-attention recommendation.
- Keep the output categorical and evidence-based; do not ship a numeric quality score by default.
- Keep issue triage, issue labels/comments, duplicate issue handling, stale issue handling, auto-close, and agent task briefs out of v0.4.x.
- Categorize PR contribution quality with the LLM only. Deterministic code may gather candidate evidence such as changed files, diff stats, check status, linked issue metadata, and missing detected validation text, but it must not independently assign classifications.
- Add a deterministic Contribution Quality Requirements section to generated `AGENTS.md` and mirror it in `CLAUDE.md`. The section should require issue reproduction or acceptance criteria, scoped PRs, validation evidence, docs alignment for public behavior, high-risk rationale, and the explicit statement that Open Maintainer evaluates reviewability rather than authorship.
- Keep the first-use path simple: PR review users should get these signals without learning a separate triage workflow or configuring a policy taxonomy.

Complete when:

- Product outcome: PR review output helps maintainers decide whether a PR is ready for review, needs author input, needs maintainer design, is not agent-ready, or is possible spam-like contribution noise.
- Validation evidence: tests cover prompt/schema handling, candidate evidence gathering, deterministic generated-context section rendering, and non-mutating review output.
- Quality bar: contribution triage is not marketed or implemented as AI authorship detection.

## v0.5: Issue Triage and Agent-Safe Backlog

Goal: prepare GitHub issues for maintainers and AI agents through local-first Contribution Triage.

Default behavior is suggestion-first and non-mutating. The primary path is local CLI triage using maintainer-controlled provider credentials, because local/subscription-backed runs can be cheaper than GitHub Action token-based usage. GitHub Action issue triage remains available for teams that explicitly want it.

Scope:

- Add CLI commands for single-issue and batch issue triage, such as `open-maintainer triage issue --number <n>` and `open-maintainer triage issues --state open --limit <n>`.
- Require an LLM provider and explicit repository-content transfer consent for model-backed issue triage.
- Keep the first useful command easy to learn. Advanced config should be optional and only needed for custom labels, comments, and closure rules.
- Keep the first useful local triage run within the 15-minute repo adoption target.
- Classify issues with the LLM only. Deterministic code may gather candidate evidence such as issue templates, labels, related issue candidates, referenced files, repo context, and existing metadata, but it must not independently assign categories.
- Use primary classifications: `ready_for_review`, `needs_author_input`, `needs_maintainer_design`, `not_agent_ready`, and `possible_spam`.
- Keep agent readiness as a separate field: `agent_ready`, `not_agent_ready`, or `needs_human_design`.
- Keep risk flags separate from primary classification, including security-sensitive, high-risk paths, dependency changes, migrations, release/CI changes, broad scope, and unclear scope.
- Suggest canonical label intents, then map them deterministically to configured or default repo labels.
- Render public comments through deterministic templates filled with LLM-provided missing-information items and required author actions.
- Default to console summary plus local artifacts; do not apply labels, post comments, close issues, or otherwise mutate GitHub state unless explicit flags are provided.
- Store local run history as ignored operational artifacts, including per-issue JSON and batch JSON/Markdown reports.
- Support opt-in write flags for labels and comments. Do not auto-create missing labels unless an explicit create-labels flag is used.
- Include selective configurable closure for `possible_spam` and stale `needs_author_input` issues only when repo config and CLI flags both allow closure. Fresh low-context issues should receive author-input requests before closure.
- Generate agent task briefs only as a second step for `agent_ready` issues or when explicitly requested. Agent-ready briefs must include likely files or surfaces, constraints, validation plan, done criteria, and escalation risks.
- Keep separate PR triage write workflows out of v0.5; PR contribution quality remains part of the PR review/v0.4.x line.

Complete when:

- Product outcome: maintainers can locally triage one issue or a batch of issues, inspect classifications, required author actions, label intents, rendered comment previews, and local artifacts before changing GitHub state.
- Product outcome: maintainers can opt into labels, comments, and selective closure through explicit flags and configuration.
- Validation evidence: tests cover schema handling with fake model outputs, consent gates, batch CLI flow, candidate evidence gathering, label-intent mapping, deterministic comment rendering, local artifact layout, write flags, closure guardrails, duplicate candidate retrieval, and task brief rendering.
- Quality bar: issue triage references repo context where applicable, distinguishes low-confidence suggestions, and does not infer whether the author used AI.
- Quality bar: issue triage saves maintainer time; it must not require maintainers to understand the full config model before receiving useful local output.
- Quality bar: maintainers can reach first useful issue triage output in 15 minutes or less for a typical repository.
- Adoption signal: validated on synthetic fixtures/golden tests and a small set of real issues across different repository types.

## v0.6: Agent Orchestration Experimental

Goal: orchestrate external agents without promising autonomous software engineering.

This milestone is experimental. It should prepare and supervise agent work; it must not merge PRs, push to default branches, or run arbitrary commands from issue text.

Allowed scope:

- Agent registry for Codex, Claude, and custom commands.
- `/openmaintainer plan` and `/openmaintainer assign <agent>` style triggers.
- Agent task briefs from issues.
- Isolated branch or worktree per task.
- Configured external agent command execution.
- Captured plan, changed files, commands run, validation evidence, and residual risk.
- Draft PR creation or prepared PR handoff.
- Human approval gates for risky paths, dependency changes, migrations, security/auth changes, deploy config, and GitHub workflow edits.

Excluded:

- Merging PRs.
- Pushing directly to the default branch.
- Silent rerun loops.
- Automatic reviewer-comment resolution without maintainer approval.
- Executing unregistered agents or arbitrary commands supplied by issue text.

Complete when:

- Product outcome: maintainers can dispatch an external agent for a bounded issue and inspect the resulting plan, branch/worktree, validation evidence, and draft PR handoff.
- Validation evidence: tests and smoke paths cover registry validation, approval gates, branch/worktree isolation, command capture, and blocked unsafe operations.
- Quality bar: all execution is explicit, auditable, and reversible.
- Quality bar: risky changes require human approval before write or PR handoff.

## v0.7: GitHub App and Self-Hosted Dashboard Alpha

Goal: turn the shipped dashboard foundation and GitHub App pieces into a reliable self-hosted product.

Hardening belongs in this milestone because users experience durable state, queues, retries, diagnostics, and install polish as dashboard and GitHub App reliability.

Scope:

- Durable Postgres-backed state for installs, repos, runs, artifacts, reviews, triage results, context PRs, and audit records.
- Queue-backed job processing and retries.
- Better diagnostics for provider, GitHub, worker, permission, and webhook failures.
- Dashboard debugging UX for failed and retryable runs.
- GitHub App setup, install, permissions, and admin polish.
- Context refresh PR support from the dashboard.
- Dashboard surfaces for PR review, issue triage, context drift, generated artifacts, and recent AI runs.
- Real repository validation through the self-hosted dashboard.

Complete when:

- Product outcome: users can run the self-hosted stack, install the GitHub App, analyze repositories, generate context, inspect runs, open context PRs, and debug failures from the dashboard.
- Validation evidence: Docker Compose smoke, API/web builds, webhook tests, queue/retry tests, and dashboard smoke paths cover the workflow.
- Quality bar: failed jobs are visible, diagnosable, and safely retryable.
- Adoption signal: validated against at least 3 real repositories through the self-hosted dashboard.

## v0.8: Org Policy and Multi-Repo Governance

Goal: make governance a product surface instead of only a design principle.

Governance is threaded through every milestone, but v0.8 adds org-level policy management.

Scope:

- Org policies and repo overrides.
- Policy-as-code checks.
- Shared skill packs.
- Multi-repo readiness dashboard.
- Org-level context and rule suggestions.
- Policy audit trail.
- Agent permissions by repo, task type, risk area, and execution environment.
- Separate citations for org-inherited rules versus repo-local rules.

Complete when:

- Product outcome: an org can define shared rules, apply them to selected repos, inspect inherited policy effects, and override repo-specific exceptions.
- Validation evidence: tests cover policy inheritance, override precedence, review citations, and blocked unsafe automation.
- Quality bar: org rules are proposed and reviewable before enforcement.
- Quality bar: repo-local policy remains visible and editable.

## v1.0: OSS Agent Maintenance Platform

Goal: ship a cohesive self-hostable OSS platform.

v1.0 does not require hosted. It also does not promise full autonomous issue-to-PR coding. It does require a coherent loop across context, review, triage, dashboard, and policy.

Scope:

- CLI and self-hosted dashboard are both supported surfaces.
- GitHub Action supports audit, drift, comments, and opt-in refresh PRs.
- GitHub App supports repository sync, context PRs, PR review, issue triage, and slash/manual triggers.
- PR review is rule-grounded and evidence-based.
- Issue triage is suggestion-first with opt-in GitHub mutations.
- Agent orchestration remains experimental, bounded, and approval-gated.
- Org policies and repo overrides are usable.
- Deployment is self-hostable with documented setup, validation, and diagnostics.

Complete when:

- Product outcome: a self-hosted org can use Open Maintainer end to end for context freshness, PR review, issue triage, dashboard visibility, and policy checks.
- Validation evidence: full repo gates, Docker Compose smoke, GitHub App/webhook tests, action tests, and dashboard smoke checks cover the v1.0 loop.
- Quality bar: repository-content transfer, GitHub writes, and agent execution are explicit and auditable.
- Adoption signal: dogfooded on Open Maintainer plus at least 5 external repositories with documented install/run notes.

## v1.1: Hosted Private Beta

Goal: package the OSS platform as managed infrastructure.

Hosted is a committed product track, not optional, but it starts after the OSS platform is cohesive.

Scope:

- Managed GitHub App.
- Scheduled audits, drift checks, refresh PRs, PR reviews, and issue triage.
- Durable run history.
- Org dashboard.
- Basic team authentication and permissions.
- Provider configuration and model metadata tracking.
- Operational monitoring and support workflow.

Complete when:

- Product outcome: pilot orgs can use managed Open Maintainer without running the self-hosted stack.
- Validation evidence: hosted smoke checks cover install, scheduled runs, GitHub writes, dashboard history, and provider failure handling.
- Quality bar: hosted preserves auditability, explicit data boundaries, and opt-in GitHub mutations.
- Adoption signal: 2-3 pilot orgs use the managed GitHub App, scheduled runs, and durable history.

## v1.2+: Hosted Scale and Enterprise Controls

Goal: make hosted Open Maintainer reliable for larger teams and orgs.

Scope:

- Usage and cost controls.
- Enterprise audit exports.
- SSO.
- Policy management UI.
- Multi-org administration.
- Retention controls.
- Advanced hosted diagnostics.
- Org analytics.
- Agent session history and review history.

Complete when:

- Product outcome: hosted users can administer multiple orgs, inspect usage and audit records, and manage policy without self-hosting.
- Validation evidence: tests and operational checks cover billing-adjacent usage records, permission boundaries, retention, audit exports, and admin flows.
- Quality bar: hosted controls do not remove OSS self-hosting value.

## Cross-Cutting Success Metrics

Use milestone-specific "complete when" criteria as the primary success measure. Avoid early vanity metrics.

Real-world validation targets:

- v0.7: at least 3 real repositories validated through the self-hosted dashboard.
- v1.0: Open Maintainer dogfooding plus at least 5 external repositories with documented install/run notes.
- v1.1: 2-3 hosted pilot orgs using managed GitHub App, scheduled runs, and durable history.

Quality signals to track across milestones:

- Readiness score clarity and remediation usefulness.
- Drift detection precision.
- PR review false-positive feedback.
- Duplicate GitHub comment avoidance.
- Suggested issue label acceptance.
- Missing-information prompt usefulness.
- Failed-run recovery rate.
- Time from install to first useful context output.
- Time from PR open to useful review output.
- GitHub writes requiring explicit user approval.

## Non-Goals

Open Maintainer should not become:

- A Jira, Linear, or monday clone.
- An IDE coding assistant.
- A generic repository chatbot.
- A fully autonomous software engineer in v1.0.
- A hosted-only product.
- A system that silently mutates repositories or GitHub state.
- A generic AI review product untethered from repo rules, policy, changed files, and validation evidence.
- A tool that sends repository content to providers without explicit consent.
- A product that merges PRs or pushes to default branches automatically.

## Product Boundary

The wedge is:

```text
versioned repo context
-> rule-grounded PR review
-> agent-safe issue triage
-> approval-gated agent orchestration
-> org-level policy
-> hosted packaging
```

That sequence gives Open Maintainer a credible path to an open-source GitHub AI maintenance platform without becoming a weak project-management clone, a noisy review bot, or an unsafe autonomous coding system.
