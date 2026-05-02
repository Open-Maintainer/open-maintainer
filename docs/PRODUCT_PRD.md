# Product Requirements: Open Maintainer

## 1. Product Summary

Open Maintainer is the open-source control plane for AI agents working in GitHub repositories.

It audits repositories, generates durable engineering context, keeps that context fresh, reviews pull requests against repo-specific rules, triages issues into agent-safe work, and coordinates external coding agents behind explicit human approval and audit trails.

The canonical roadmap lives in `docs/ROADMAP.md`. This PRD is the detailed product requirements companion and should stay aligned with the roadmap's milestone sequence and completion criteria.

## 2. Product Thesis

AI coding agents are becoming normal contributors to GitHub repositories. Most repositories are not ready for that. They lack explicit instructions, consistent validation rules, documented risk areas, and durable operational memory.

Open Maintainer turns repository reality into versioned, reviewable context that both humans and AI agents can use.

The product loop is:

```text
audit repository
-> generate context and policy
-> detect drift
-> review PRs against context
-> triage issues into agent-safe tasks
-> orchestrate agents with approvals
-> record evidence and outcomes
```

## 3. Target Users

### 3.1 Solo OSS Maintainer

Needs:

- Contributor guidance that does not take days to write.
- Issue triage and missing-information prompts.
- PR summaries and rule-grounded review.
- Clear repo instructions for AI coding agents.
- Minimal setup and low operational burden.

Pain:

- Low-quality issues and PRs consume review time.
- Repository conventions live in maintainer memory.
- AI-generated contributions miss project-specific rules.
- Hosted proprietary tools may be expensive, opaque, or hard to customize.

### 3.2 Small Dev Team Lead

Needs:

- Consistent PR review expectations.
- Clear onboarding and repository context.
- Visibility into stale work and risky changes.
- A lightweight GitHub-native workflow layer without adopting a full project-management suite.
- Human approval over AI actions.

Pain:

- Review quality varies by reviewer and time pressure.
- Project rules are implicit.
- AI-generated work increases review load.
- Jira or Linear may be too heavy for the team.

### 3.3 AI-Heavy Engineering Team

Needs:

- `AGENTS.md`, `CLAUDE.md`, Cursor rules, Copilot instructions, and repo-local skills.
- A way to keep instructions fresh as repositories change.
- Review rules that agents and humans can follow.
- Agent task briefs and approval-gated orchestration.
- Auditability for model/provider use and GitHub writes.

Pain:

- Agents repeat the same mistakes.
- Context drifts quickly.
- Different agents need the same repo knowledge in different formats.
- Security and repository-content-transfer boundaries must be explicit.

## 4. Positioning

Open Maintainer is not an IDE coding assistant, a generic chatbot, a Jira clone, or a proprietary AI reviewer clone.

It is a GitHub-native maintenance layer centered on versioned engineering context.

Adjacent commercial categories validate the market:

- Coding agents validate issue-to-PR workflows.
- AI review products validate repo-aware review and policy checks.
- Project tools validate GitHub-adjacent issue and planning workflows.

Open Maintainer differentiates by being open-source, self-hostable, context-first, transparent, and human-controlled by default.

AI tools have increased the volume of low-context issues and polished-looking but unreviewable PRs. Open Maintainer should address that maintainer pain through Contribution Triage: evaluating reviewability, scope, evidence, validation, and repo alignment. It should not classify whether a contribution was written by AI.

## 5. Product Principles

### 5.1 Context Is the Foundation

Open Maintainer's core value is converting repository reality into durable, versioned, inspectable context:

- detected repository facts
- readiness score and report
- generated agent instructions
- generated skills
- maintainer-approved policy
- contribution-quality requirements
- validation evidence
- drift history
- run history

PR review, issue triage, dashboard views, org policy, and agent orchestration all build on that foundation.

### 5.2 GitHub-Native

The product should work naturally with:

- GitHub Apps
- Pull requests
- Issues
- Labels
- Comments
- Checks
- Branches
- Actions
- CODEOWNERS
- GitHub Projects where useful later

Users should not need to migrate away from GitHub.

### 5.3 OSS-First and Self-Hostable

The open-source core must be useful without hosted infrastructure.

The OSS product should include:

- CLI audit and generation
- deterministic repository profiling
- context generation
- readiness and drift checks
- GitHub Action
- self-hosted dashboard
- GitHub App integration
- PR review beta
- issue triage suggestions
- repo and org policy files
- BYO model providers and local provider support

### 5.4 Hosted Is Committed

Hosted packaging is not optional. It starts after the OSS platform is cohesive.

Hosted should add managed infrastructure, not replace the OSS product:

- managed GitHub App
- scheduled jobs
- durable run history
- org dashboard
- basic team auth
- hosted diagnostics
- later enterprise controls

### 5.5 Human-In-The-Loop By Default

Open Maintainer should suggest, draft, review, and open pull requests. It should not silently mutate repositories.

Defaults:

- PR comments are manual or opt-in.
- Inline comments are opt-in and capped.
- Issue labels and comments are manual or opt-in.
- Refresh PRs are opt-in.
- Agent execution is experimental and approval-gated.
- Default branch mutation is never automatic.

### 5.6 Maintainer Effort Reduction

Open Maintainer exists to save maintainer time and energy. Features must not add a steep learning curve or require maintainers to understand a large policy system before receiving value.

Requirements:

- First useful commands should work with safe defaults and minimal flags.
- A maintainer should be able to get Open Maintainer running for one repository and receive useful output in 15 minutes or less.
- Advanced configuration should be optional and reserved for teams that want custom labels, comments, closure rules, or org policy.
- Output should be concise, action-oriented, and sorted by maintainer action.
- Contribution triage should reduce review queue noise; it should not create a second queue of bot output that maintainers must manually curate.
- Default workflows must avoid surprising GitHub writes.

### 5.7 Evidence-Grounded AI

AI output should cite one or more grounding sources:

- repo profile
- `.open-maintainer.yml`
- generated context
- repo-local skills
- changed files
- test/build conventions
- GitHub metadata
- CI status
- issue acceptance criteria
- explicit user instructions

Generic critique is not enough.

### 5.8 Repository-Content Safety

Repository content must not leave the user's environment until explicit provider or agent consent is configured.

Requirements:

- Show which provider/model/agent will receive repository content.
- Capture model/provider metadata for generated artifacts, reviews, and triage.
- Redact or block secrets before model-backed generation where feasible.
- Avoid logging source code and secrets.
- Make GitHub writes explicit, reviewable, and auditable.
- Require stronger approval for security-sensitive paths.

## 6. Shipped Product Reality

The product has two shipped surfaces today:

- CLI context workflow: shipped and currently the most reliable MVP path.
- Self-hosted dashboard context workflow: shipped foundation that needs refinement, durable-state hardening, and extensive debugging.

Current shipped/foundation capabilities:

- repository audit
- readiness scoring
- versioned repo profile
- context generation
- `.open-maintainer.yml` generation
- repo-local skills
- drift detection
- GitHub Action audit/drift/comment mode
- dashboard repository analysis
- dashboard provider consent
- dashboard artifact preview
- dashboard run history
- dashboard/context PR foundation
- rule-grounded PR review beta across CLI, Action, and dashboard preview
- opt-in Action review summary and capped inline comments
- dashboard PR review finding feedback capture
- GitHub App webhook/auth/context PR foundation

Planned capabilities:

- issue triage product
- agent-safe backlog
- external-agent orchestration
- durable self-hosted dashboard alpha
- org policy and governance
- hosted private beta

## 7. Milestone Roadmap

| Milestone | Name | Product Outcome |
| --- | --- | --- |
| v0.1 | Context MVP | Shipped CLI and dashboard foundation for repository context. |
| v0.2 | Readiness Quality | Trusted audit, drift, and readiness reporting. |
| v0.3 | GitHub Action | One-workflow install for context checks and opt-in refresh PRs. |
| v0.4 | Rule-Grounded PR Review Beta | PR reviews cite repo rules and validation expectations. |
| v0.4.x | PR Contribution Triage Signals | PR review gains contribution-quality signals after the v0.4.0 release. |
| v0.5 | Issue Triage and Agent-Safe Backlog | Local-first issue triage makes issues actionable for humans and agents. |
| v0.6 | Agent Orchestration Experimental | External agents can be dispatched with isolation, approvals, and audit trails. |
| v0.7 | GitHub App and Self-Hosted Dashboard Alpha | Durable, debuggable self-hosted product. |
| v0.8 | Org Policy and Multi-Repo Governance | Org rules, repo overrides, shared skill packs, and multi-repo views. |
| v1.0 | OSS Agent Maintenance Platform | Cohesive self-hostable platform. |
| v1.1 | Hosted Private Beta | Managed GitHub App and scheduled jobs for pilot orgs. |
| v1.2+ | Hosted Scale and Enterprise Controls | Hosted usage controls, SSO, audit exports, policy UI, and multi-org administration. |

## 8. v0.1 Context MVP Requirements

Status: shipped.

### 8.1 CLI Requirements

The CLI must support:

- `audit` to generate a repo profile and readiness report.
- `generate` to create context artifacts after explicit model/write consent.
- `doctor` to detect missing or stale context.
- PR summary behavior for the context workflow.
- deterministic mode for smoke testing.
- preservation of existing files by default.

### 8.2 Dashboard Foundation Requirements

The dashboard foundation must support:

- repository selection or upload/local path flow
- analysis run
- provider consent and configuration
- generated artifact preview
- context PR workflow foundation
- run history
- failure visibility

The dashboard is shipped but still needs reliability, polish, durable persistence, queue-backed runs, and debugging improvements.

### 8.3 Context Artifacts

The product should generate:

- `AGENTS.md`
- `.open-maintainer.yml`
- `.open-maintainer/profile.json`
- `.open-maintainer/report.md`
- repo-local skills
- optional tool-specific files where supported

Generated artifacts should record source profile version and model/provider metadata where applicable.

### 8.4 Complete When

- Users can audit a repository and generate reviewable context.
- Users can run doctor and understand missing or stale context.
- Dashboard users can analyze a repo and preview generated artifacts.
- Existing files are preserved unless force behavior is explicitly requested.
- Repository content transfer requires explicit consent.

## 9. v0.2 Readiness Quality Requirements

Goal: make Open Maintainer trusted as a repository-readiness auditor.

### 9.1 Required Capabilities

- Deeper repo profiling for commands, CI, docs, ownership hints, generated files, lockfiles, environment variables, issue templates, PR templates, risk paths, and package boundaries.
- Drift detection beyond profile-hash mismatch.
- Readiness reports with concrete next actions.
- Evidence-backed recommendations.
- Better missing-context explanations.
- Better generated skills where repository evidence supports them.

### 9.2 Output Requirements

Readiness output should explain:

- current score
- strong signals
- missing context
- stale context
- risky areas
- likely validation commands
- docs likely affected
- generated files and lockfiles
- next actions

### 9.3 Complete When

- Reports identify what is missing, stale, risky, or ambiguous.
- Drift reports identify changed surfaces.
- Representative fixtures cover high-readiness, low-readiness, drift, and missing-context cases.
- Recommendations are tied to evidence and avoid invented policies.

## 10. v0.3 GitHub Action Requirements

Goal: make Open Maintainer useful through one workflow file.

### 10.1 Default Behavior

Default Action behavior must be non-mutating:

- audit repository
- report readiness
- detect missing context
- detect drift
- optionally comment on PRs when configured
- never write to the repo by default

### 10.2 Opt-In Write Behavior

Refresh PRs are allowed only when explicitly configured.

Requirements:

- explicit `mode: refresh`
- clear permissions documentation
- predictable `open-maintainer/context-refresh` branch by default
- no default branch mutation
- generated-file refresh without overwriting maintainer-owned context by default
- model-backed generation only after explicit `generation-provider` and
  `allow-model-content-transfer: "true"` configuration

### 10.3 PR Feedback

PR comments or check summaries should include:

- readiness status
- drift diagnostics
- changed surface
- likely tests
- likely docs impact
- missing validation evidence where detectable
- context refresh recommendation

### 10.4 Complete When

- A repository can install the action with one workflow file.
- Default action mode does not write.
- Scheduled mode can detect stale context.
- Opt-in refresh PRs work with documented permissions.
- Tests cover no-write default behavior and opt-in writes.

## 11. v0.4 Rule-Grounded PR Review Requirements

Goal: review PRs using approved repository context and explicit policy.

### 11.1 Default Behavior

PR review is conservative by default:

- dashboard/check-output review enabled
- CLI review output is non-mutating and available for manual maintainer posting
- dashboard review preview is enabled before any GitHub write
- dashboard posting remains credential-gated in v0.4
- Action automatic summary comments are opt-in
- Action inline comments are opt-in and capped
- blocking merge checks later and opt-in

### 11.2 Review Grounding

Findings should cite:

- repo profile
- `.open-maintainer.yml`
- generated `AGENTS.md`
- repo-local skills
- changed paths
- CI status
- detected commands
- issue acceptance criteria where available

### 11.3 Review Output

Each review should include:

- summary
- changed-surface walkthrough
- risk level
- affected modules
- expected validation
- validation evidence found or missing
- docs likely affected
- findings with severity
- rule citations
- merge-readiness signal
- residual risk

Severity levels:

- Blocker: must fix before merge.
- Major: likely correctness, security, or governance issue.
- Minor: useful but non-blocking issue.
- Note: residual risk or follow-up.

### 11.4 Complete When

- Maintainers can run local CLI PR review with `gh` and post marked summary
  plus capped inline findings to GitHub.
- Findings cite repo evidence.
- Review avoids generic critique.
- Duplicate comments are avoided.
- False-positive feedback can be captured.
- Tests cover changed-surface detection, validation inference, docs alignment, severity, duplicate avoidance, CLI PR fetching/posting, dashboard preview, and feedback capture.

## 12. v0.4.x PR Contribution Triage Signal Requirements

Goal: add contribution-quality signals to the shipped v0.4.0 PR review beta without expanding v0.4.0 release scope.

### 12.1 Scope

v0.4.x PR contribution triage should stay inside the PR review product. It should evaluate:

- PR intent clarity
- linked issue or acceptance criteria
- diff scope versus stated intent
- validation evidence
- docs alignment
- broad churn
- high-risk files
- generated-file, lockfile, or dependency changes
- maintainer-attention recommendation

It may apply one explicit PR triage label for GitHub PR-list filtering when the
maintainer uses an opt-in write flag. Missing PR triage labels may be created
only behind an explicit create-labels flag.

It must not introduce full issue triage, issue labels/comments, duplicate issue handling, stale issue handling, auto-close, or agent task briefs.

### 12.2 Categorization Boundary

PR contribution categorization is LLM-only. Deterministic code may gather candidate evidence such as changed files, diff stats, linked issue metadata, check status, generated file hints, lockfile changes, and detected validation text. Deterministic code must not independently assign PR categories.

Do not ship a default numeric quality score. Use categorical outcomes and evidence:

- ready for review
- needs author input
- needs maintainer design
- not agent-ready
- possible spam-like contribution noise

### 12.3 Generated Context Policy

Context artifact generation should add a deterministic Contribution Quality Requirements section to generated `AGENTS.md` and mirror it in `CLAUDE.md`.

The section should require:

- bug issues to include reproduction, expected/actual behavior, environment or version where known, and logs or failing commands when available
- feature requests to include user problem, affected surface, and acceptance criteria
- security reports to include affected surface and proof-of-concept or credible exploit path, while requesting clarification rather than dismissing reports that lack proof
- PRs to include clear intent, linked issue or acceptance criteria where available, scoped diff, validation evidence, and docs updates for public behavior changes
- high-risk PRs touching auth, secrets, CI/release, deploy, dependencies, lockfiles, generated files, or migrations to include rationale and targeted validation
- the statement that Open Maintainer evaluates reviewability, scope, evidence, validation, and repo alignment, not whether the author used AI

This is deterministic context policy text. It is separate from LLM-only issue/PR categorization.

### 12.4 Simplicity Requirement

PR review users should receive contribution-quality signals without learning a separate triage workflow or configuring a policy taxonomy. The v0.4.x path should save review time inside the existing PR review flow and let maintainers make the GitHub PR list filterable through explicit PR label writes.

## 13. v0.5 Issue Triage and Agent-Safe Backlog Requirements

Goal: make GitHub issues actionable for humans and agents through local-first Contribution Triage.

### 13.1 Default Behavior

Issue triage is suggestion-first and non-mutating:

- primary path is local CLI triage with maintainer-controlled provider credentials
- GitHub Action issue triage remains available for teams that explicitly choose token-based usage or self-hosted providers
- triage requires an LLM provider and explicit repository-content transfer consent
- console summary and local artifacts are produced by default
- suggested label intents are visible
- missing-information prompts and rendered comment previews are visible
- task briefs are generated only for `agent_ready` issues or when explicitly requested
- labels, comments, label creation, and closures require explicit flags
- automatic labels, comments, and closures are opt-in and config-gated
- first useful command should work without custom triage config
- first useful issue-triage run should fit inside the 15-minute repo adoption target

### 13.2 Triage Output

For each issue, Open Maintainer should produce:

- primary classification: `ready_for_review`, `needs_author_input`, `needs_maintainer_design`, `not_agent_ready`, or `possible_spam`
- maintainer action: review now, ask author, defer, require human design, or close if configured
- agent readiness: `agent_ready`, `not_agent_ready`, or `needs_human_design`
- affected surface candidates
- risk flags such as security-sensitive, high-risk paths, dependency changes, migrations, release/CI changes, broad scope, or unclear scope
- missing information
- duplicate candidates and LLM duplicate judgment
- stale signal where applicable
- suggested label intents
- required author actions
- acceptance criteria where possible
- deterministic rendered comment preview
- next action
- agent task brief where appropriate

Issue/PR categorization is LLM-only. Deterministic code may gather candidate evidence such as issue templates, labels, related issue candidates, referenced files, repository context, changed files, check status, and existing metadata. Deterministic code may also validate schemas, enforce consent, map label intents, render comments, cap writes, and apply closure guardrails. It must not independently assign issue or PR categories.

### 13.3 CLI and Write Behavior

The v0.5 CLI should support single-issue and batch local triage:

```sh
open-maintainer triage issue --number 123
open-maintainer triage issues --state open --limit 25
```

Default behavior must not mutate GitHub. Write actions require explicit flags, such as:

```sh
--apply-labels
--post-comment
--create-labels
--close-allowed
```

Label handling should use canonical LLM-returned label intents mapped deterministically to configured or default repo labels. Missing labels are reported by default; label creation requires an explicit flag.

Comments should be rendered through deterministic templates filled with LLM-provided missing-information items and required author actions. Comments must not accuse the author of using AI.

Selective closure is allowed only when both repo config and CLI flags permit it. Immediate closure should be limited to `possible_spam`. Low-context but legitimate issues should receive an author-input request first and only become closure-eligible after a configured stale window.

### 13.4 Agent Task Brief

Task briefs should include:

- goal
- user-visible behavior
- read-first files/docs
- likely files
- constraints
- safety notes
- validation commands
- done criteria
- reason the task is or is not agent-ready

Agent task briefs should be generated as a second step only for `agent_ready` issues or when explicitly requested. `agent_ready` requires a bounded scope, likely files or surfaces, constraints from repo context, a specific validation plan, done criteria, and escalation risks.

### 13.5 Local Artifacts

Local triage artifacts are operational run history, not generated context artifacts. They should be ignored/local by default.

Recommended layout:

```text
.open-maintainer/triage/issues/<issue-number>.json
.open-maintainer/triage/runs/<run-id>.json
.open-maintainer/triage/runs/<run-id>.md
```

Artifacts should capture issue metadata, classification, reasons, required author actions, label intents, rendered comment preview, provider/model metadata, source context version, consent mode, write actions applied or skipped, and errors.

### 13.6 Simplicity Requirement

Issue triage must save maintainer time and energy. It should not require maintainers to learn the full config model before seeing value.

The default batch output should answer:

- which issues are ready for review
- which need author input
- which need human design
- which are not agent-ready
- which may be spam and can be closed only if configured
- what the maintainer can do next

Advanced config should only be needed for custom labels, public comments, label creation, selective closure, strictness, and org policy.

The expected first-run path should be learnable from one short command example plus the provider and consent flags. A maintainer should not need to understand dashboard setup, GitHub App installation, or the full `.open-maintainer.yml` policy model before local triage is useful.

### 13.7 Complete When

- Maintainers can inspect triage output before changing GitHub state.
- Maintainers can triage one issue or a batch locally, write local artifacts, and opt into GitHub labels, comments, label creation, or selective closure.
- Tests cover schema handling with fake model outputs, consent gates, batch CLI flow, candidate evidence gathering, label-intent mapping, deterministic comment rendering, local artifact layout, write flags, closure guardrails, duplicate candidate retrieval, and task brief rendering.
- Triage references repo context where applicable.
- Triage does not infer whether the author used AI.
- Synthetic fixtures/golden tests and real issue validation both inform release readiness.

## 14. v0.6 Agent Orchestration Experimental Requirements

Goal: coordinate external agents without promising autonomous coding.

### 14.1 Allowed Behavior

The experimental orchestration layer may:

- register Codex, Claude, and custom commands
- generate task briefs
- support `/openmaintainer plan`
- support `/openmaintainer assign <agent>`
- create isolated branches or worktrees
- run configured external agent commands
- capture plan, changed files, commands run, validation evidence, and residual risk
- prepare or open draft PRs
- require human approval for high-risk work

### 14.2 Disallowed Behavior

The experimental layer must not:

- merge PRs
- push directly to default branches
- run silent autonomous loops
- auto-resolve reviewer comments without maintainer approval
- execute arbitrary commands from issue text
- execute unregistered agents

### 14.3 Approval Gates

Human approval is required before agent writes or PR handoff for:

- security/auth changes
- dependency updates
- database migrations
- deploy or infra config
- GitHub workflow changes
- secrets or environment handling
- generated file rewrites
- broad refactors

### 14.4 Complete When

- Maintainers can dispatch a bounded external-agent task.
- The system records plan, workspace, command, changed files, validation evidence, and output.
- Unsafe operations are blocked or require approval.
- Tests cover registry validation, approval gates, isolation, command capture, and blocked unsafe operations.

## 15. v0.7 GitHub App and Self-Hosted Dashboard Alpha Requirements

Goal: harden the shipped dashboard foundation and GitHub App pieces into a reliable self-hosted product.

### 15.1 Required Capabilities

- Durable Postgres-backed state for installs, repos, runs, artifacts, reviews, triage results, context PRs, and audit records.
- Queue-backed job processing and retries.
- Provider, GitHub, worker, permission, and webhook diagnostics.
- Dashboard debugging UX for failed runs.
- GitHub App setup and permissions polish.
- Context refresh PR support from dashboard.
- Dashboard views for PR review, issue triage, context drift, generated artifacts, and AI runs.
- Safe retry for failed jobs.

### 15.2 Complete When

- Users can self-host, install the GitHub App, analyze repositories, generate context, inspect runs, open context PRs, and debug failures from the dashboard.
- Docker Compose smoke, API/web builds, webhook tests, queue/retry tests, and dashboard smoke paths cover the workflow.
- Failed jobs are visible, diagnosable, and safely retryable.
- The dashboard is validated against at least 3 real repositories.

## 16. v0.8 Org Policy and Multi-Repo Governance Requirements

Goal: make governance a product surface.

### 16.1 Required Capabilities

- Org policies.
- Repo overrides.
- Policy-as-code checks.
- Shared skill packs.
- Multi-repo readiness dashboard.
- Org-level rule suggestions.
- Policy audit trail.
- Agent permissions by repo, task type, risk area, and execution environment.
- Separate citations for org-inherited rules and repo-local rules.

### 16.2 Complete When

- An org can define shared rules and apply them to selected repos.
- Repos can override inherited rules.
- PR reviews can cite inherited and repo-local rules separately.
- Tests cover inheritance, override precedence, citations, and unsafe automation blocking.

## 17. v1.0 OSS Platform Requirements

Goal: ship a cohesive self-hostable OSS platform.

### 17.1 Required Capabilities

- CLI and dashboard are both supported.
- GitHub Action supports audit, drift, comments, and opt-in refresh PRs.
- GitHub App supports repository sync, context PRs, PR review, issue triage, and manual/slash triggers.
- PR review is rule-grounded and evidence-based.
- Issue triage is suggestion-first.
- Agent orchestration remains experimental and approval-gated.
- Org policies and repo overrides are usable.
- Self-hosted deployment is documented and diagnosable.

### 17.2 Complete When

- A self-hosted org can use Open Maintainer end to end for context freshness, PR review, issue triage, dashboard visibility, and policy checks.
- Full repo gates, Docker Compose smoke, GitHub App/webhook tests, action tests, and dashboard smoke checks cover the v1.0 loop.
- Repository-content transfer, GitHub writes, and agent execution are explicit and auditable.
- The product is dogfooded on Open Maintainer and validated on at least 5 external repositories.

## 18. v1.1 Hosted Private Beta Requirements

Goal: package the OSS platform as managed infrastructure.

### 18.1 Required Capabilities

- Managed GitHub App.
- Scheduled audits.
- Scheduled drift checks.
- Scheduled refresh PRs.
- Scheduled PR reviews and issue triage where enabled.
- Durable run history.
- Org dashboard.
- Basic team auth.
- Provider configuration and model metadata tracking.
- Operational monitoring and support workflow.

### 18.2 Complete When

- Pilot orgs can use managed Open Maintainer without running the self-hosted stack.
- Hosted smoke checks cover install, scheduled runs, GitHub writes, dashboard history, and provider failure handling.
- Hosted preserves auditability, explicit data boundaries, and opt-in GitHub mutations.
- 2-3 pilot orgs use the managed GitHub App, scheduled runs, and durable history.

## 19. v1.2+ Hosted Scale and Enterprise Controls Requirements

Goal: make hosted Open Maintainer reliable for larger teams and orgs.

Required capabilities:

- usage and cost controls
- enterprise audit exports
- SSO
- policy management UI
- multi-org administration
- retention controls
- advanced hosted diagnostics
- org analytics
- agent session history
- review history

Complete when:

- Hosted users can administer multiple orgs.
- Usage, policy, and audit records are inspectable.
- Retention and permission boundaries are enforced.
- Hosted controls do not make the OSS product hollow.

## 20. Configuration Requirements

Open Maintainer should support repo-level configuration through `.open-maintainer.yml`.

Example shape:

```yaml
reviews:
  enabled: true
  mode: conservative
  github_comments: manual
  inline_comments: false
  max_inline_comments: 8
  require_tests: true

contributionTriage:
  issues:
    enabled: false
    strictness: balanced # lenient | balanced | strict
    labels:
      apply: false
      createMissing: false
    comments:
      post: false
      updateExisting: true
    close:
      enabled: false
      allowedClassifications:
        - possible_spam
      requireComment: true
      staleNeedsAuthorInputDays: 14
      maxClosuresPerRun: 5

context:
  generate_agents_md: true
  generate_claude_md: false
  generate_cursor_rules: false
  generate_agent_skills: true

agents:
  codex:
    enabled: false
    command: "codex"
  claude:
    enabled: false
    command: "claude"

rules:
  - id: R-001
    title: Tests required for source changes
    description: Source changes should include tests or documented validation.
    severity: warning
```

Requirements:

- Invalid config fails safely.
- Generated config is reviewable before enforcement.
- Contribution triage config is planned behavior until implementation supports it; generated `.open-maintainer.yml` should not claim supported keys before the code reads them.
- Dashboard settings and repo config precedence are clear.
- Org-inherited policy and repo overrides are visible.

## 21. Permissions Requirements

Permissions should stay tight and staged by feature.

Base permissions:

- Metadata: read.
- Contents: read.
- Pull requests: read.

Context PR permissions:

- Contents: write, only for generated branches.
- Pull requests: write.

PR review permissions:

- Pull requests: read.
- Checks or commit statuses: optional write.
- Pull request comments/reviews: optional write.

Issue triage permissions:

- Issues: read.
- Issues: write only for explicit label, comment, label-creation, or closure actions.

Org/dashboard permissions:

- Members: read only where needed for org administration.
- Projects: optional and later.

Agent orchestration:

- No additional GitHub writes without explicit approval and configured credentials.

## 22. Architecture Requirements

The architecture should remain TypeScript-first and GitHub-native.

Current package/app shape:

```text
apps/
  api/          # Fastify API and GitHub/webhook routes
  web/          # Next dashboard
  worker/       # background worker
packages/
  review/       # PR review engine
  ai/           # provider construction and checks
  analyzer/     # deterministic repo analysis
  config/       # shared config
  context/      # context artifacts and rendering
  db/           # persistence and health checks
  github/       # GitHub App, webhook, branch, PR helpers
  shared/       # shared types
```

Future package boundaries may include:

```text
packages/
  triage/       # issue triage engine
  policy/       # org/repo policy evaluation
  orchestration/# external-agent registry and execution records
```

Job types should include:

```text
repo.audit
repo.generate_context
repo.refresh_context
repo.open_context_pr
pr.review
issue.triage
agent.plan
agent.dispatch
org.evaluate_policy
```

## 23. Data and Artifact Requirements

Generated outputs should be immutable or versioned where practical.

Generated and durable artifacts:

- `repo_profile`
- readiness report
- generated `AGENTS.md`
- generated `.open-maintainer.yml`
- generated skills
- context drift report
- PR review result
- issue triage result
- agent task brief
- agent run record
- org policy snapshot

Local-only run artifacts:

- `.open-maintainer/triage/issues/<issue-number>.json`
- `.open-maintainer/triage/runs/<run-id>.json`
- `.open-maintainer/triage/runs/<run-id>.md`

Local triage artifacts are operational run history, not generated context artifacts. They should be ignored/local by default unless a maintainer explicitly exports or shares them.

Each AI-backed artifact should capture:

- source repo/profile version
- source policy version
- model/provider/agent metadata
- timestamp
- triggering user or event
- input source summary
- output version
- errors or skipped checks

## 24. Success Metrics

Milestone completion criteria are the primary success metrics.

Cross-cutting metrics:

- Time from install to first useful context output.
- Time from first triage setup to useful issue triage output, with a target of 15 minutes or less for one repository.
- Readiness recommendation usefulness.
- Drift detection precision.
- Context refresh PR acceptance.
- PR review false-positive feedback.
- Duplicate PR comment avoidance.
- Suggested issue label acceptance.
- Missing-information prompt usefulness.
- Maintainer-reported time saved by contribution triage.
- First-run completion rate without custom config.
- Failed-run recovery rate.
- Agent dispatch approval and failure rates.
- Number of GitHub writes requiring explicit approval.

Real-world validation targets:

- v0.7: at least 3 real repositories validated through the self-hosted dashboard.
- v1.0: dogfooded on Open Maintainer plus at least 5 external repositories.
- v1.1: 2-3 hosted pilot orgs.

## 25. Non-Goals

Open Maintainer should not become:

- a Jira, Linear, or monday clone
- an IDE coding assistant
- a generic repo chatbot
- a fully autonomous software engineer in v1.0
- a hosted-only product
- a system that silently mutates repositories or GitHub state
- a generic AI review tool untethered from repo rules and evidence
- a high-complexity policy system that takes more time to learn than it saves
- a tool that sends repository content to providers without explicit consent
- a product that merges PRs or pushes to default branches automatically

## 26. Key Risks and Mitigations

### 26.1 AI Output Quality

Risk: generated context, reviews, or triage may be noisy or wrong.

Mitigations:

- deterministic-first analysis
- evidence citations
- conservative defaults
- manual posting by default
- opt-in automation
- false-positive feedback
- reviewable generated artifacts

### 26.2 Security and Privacy

Risk: private repository content or secrets may leak.

Mitigations:

- explicit provider consent
- local model support
- secret redaction or blocking where feasible
- minimal logging
- model/provider metadata capture
- audit trail for GitHub writes
- approval gates for security-sensitive paths

### 26.3 Product Sprawl

Risk: the product becomes a weak project board plus weak review bot plus unsafe agent runner.

Mitigations:

- context remains the foundation
- PR review must be rule-grounded
- issue triage must prepare agent-safe work
- agent orchestration stays experimental until proven
- dashboard focuses on maintainer attention and evidence
- first-use workflows stay small enough to produce useful output in 15 minutes or less

### 26.4 Hosted Complexity

Risk: hosted concerns distort the OSS product before v1.0.

Mitigations:

- OSS v1.0 ships first
- hosted begins as v1.1 private beta
- hosted packages core workflows instead of replacing them
- enterprise features wait for v1.2+

## 27. Final Product Definition

Open Maintainer is an open-source system for maintaining the operational memory and AI-readiness of GitHub repositories.

The foundation is:

1. Understand the repository.
2. Generate durable context.
3. Keep context fresh.

The product then expands to:

1. Review PRs against repo rules.
2. Triage GitHub issues into agent-safe work.
3. Coordinate external agents with approval and audit trails.
4. Apply org-level governance across repositories.
5. Offer hosted packaging for teams that do not want to self-host.

That boundary keeps Open Maintainer focused: context-first, GitHub-native, evidence-grounded, OSS-first, and safe for humans and AI agents to use together.
