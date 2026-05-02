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

## 5. Product Principles

### 5.1 Context Is the Foundation

Open Maintainer's core value is converting repository reality into durable, versioned, inspectable context:

- detected repository facts
- readiness score and report
- generated agent instructions
- generated skills
- maintainer-approved policy
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

### 5.6 Evidence-Grounded AI

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

### 5.7 Repository-Content Safety

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
| v0.5 | Issue Triage and Agent-Safe Backlog | Issues become actionable, labeled, and ready for humans or agents. |
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

- Maintainers can review PR output before posting to GitHub.
- Findings cite repo evidence.
- Review avoids generic critique.
- Duplicate comments are avoided.
- False-positive feedback can be captured.
- Tests cover changed-surface detection, validation inference, docs alignment, severity, duplicate avoidance, Action summary and inline posting, dashboard preview, and feedback capture.

## 12. v0.5 Issue Triage and Agent-Safe Backlog Requirements

Goal: make GitHub issues actionable for humans and agents.

### 12.1 Default Behavior

Issue triage is suggestion-first:

- triage output visible in dashboard/run history
- suggested labels visible
- missing-information prompts visible
- task brief visible
- manual apply-label and post-comment actions enabled
- automatic labels opt-in
- automatic comments opt-in

### 12.2 Triage Output

For each issue, Open Maintainer should produce:

- issue type
- suspected affected surface
- priority
- complexity
- risk level
- testability
- missing information
- duplicate candidates
- stale signal where applicable
- suggested labels
- acceptance criteria
- next action
- agent suitability
- agent task brief where appropriate

### 12.3 Agent Task Brief

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

### 12.4 Complete When

- Maintainers can inspect triage output before changing GitHub state.
- Issue labels and comments are opt-in for automatic application.
- Tests cover classification, label suggestions, missing info, duplicate/stale signals, and task brief rendering.
- Triage references repo context where applicable.

## 13. v0.6 Agent Orchestration Experimental Requirements

Goal: coordinate external agents without promising autonomous coding.

### 13.1 Allowed Behavior

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

### 13.2 Disallowed Behavior

The experimental layer must not:

- merge PRs
- push directly to default branches
- run silent autonomous loops
- auto-resolve reviewer comments without maintainer approval
- execute arbitrary commands from issue text
- execute unregistered agents

### 13.3 Approval Gates

Human approval is required before agent writes or PR handoff for:

- security/auth changes
- dependency updates
- database migrations
- deploy or infra config
- GitHub workflow changes
- secrets or environment handling
- generated file rewrites
- broad refactors

### 13.4 Complete When

- Maintainers can dispatch a bounded external-agent task.
- The system records plan, workspace, command, changed files, validation evidence, and output.
- Unsafe operations are blocked or require approval.
- Tests cover registry validation, approval gates, isolation, command capture, and blocked unsafe operations.

## 14. v0.7 GitHub App and Self-Hosted Dashboard Alpha Requirements

Goal: harden the shipped dashboard foundation and GitHub App pieces into a reliable self-hosted product.

### 14.1 Required Capabilities

- Durable Postgres-backed state for installs, repos, runs, artifacts, reviews, triage results, context PRs, and audit records.
- Queue-backed job processing and retries.
- Provider, GitHub, worker, permission, and webhook diagnostics.
- Dashboard debugging UX for failed runs.
- GitHub App setup and permissions polish.
- Context refresh PR support from dashboard.
- Dashboard views for PR review, issue triage, context drift, generated artifacts, and AI runs.
- Safe retry for failed jobs.

### 14.2 Complete When

- Users can self-host, install the GitHub App, analyze repositories, generate context, inspect runs, open context PRs, and debug failures from the dashboard.
- Docker Compose smoke, API/web builds, webhook tests, queue/retry tests, and dashboard smoke paths cover the workflow.
- Failed jobs are visible, diagnosable, and safely retryable.
- The dashboard is validated against at least 3 real repositories.

## 15. v0.8 Org Policy and Multi-Repo Governance Requirements

Goal: make governance a product surface.

### 15.1 Required Capabilities

- Org policies.
- Repo overrides.
- Policy-as-code checks.
- Shared skill packs.
- Multi-repo readiness dashboard.
- Org-level rule suggestions.
- Policy audit trail.
- Agent permissions by repo, task type, risk area, and execution environment.
- Separate citations for org-inherited rules and repo-local rules.

### 15.2 Complete When

- An org can define shared rules and apply them to selected repos.
- Repos can override inherited rules.
- PR reviews can cite inherited and repo-local rules separately.
- Tests cover inheritance, override precedence, citations, and unsafe automation blocking.

## 16. v1.0 OSS Platform Requirements

Goal: ship a cohesive self-hostable OSS platform.

### 16.1 Required Capabilities

- CLI and dashboard are both supported.
- GitHub Action supports audit, drift, comments, and opt-in refresh PRs.
- GitHub App supports repository sync, context PRs, PR review, issue triage, and manual/slash triggers.
- PR review is rule-grounded and evidence-based.
- Issue triage is suggestion-first.
- Agent orchestration remains experimental and approval-gated.
- Org policies and repo overrides are usable.
- Self-hosted deployment is documented and diagnosable.

### 16.2 Complete When

- A self-hosted org can use Open Maintainer end to end for context freshness, PR review, issue triage, dashboard visibility, and policy checks.
- Full repo gates, Docker Compose smoke, GitHub App/webhook tests, action tests, and dashboard smoke checks cover the v1.0 loop.
- Repository-content transfer, GitHub writes, and agent execution are explicit and auditable.
- The product is dogfooded on Open Maintainer and validated on at least 5 external repositories.

## 17. v1.1 Hosted Private Beta Requirements

Goal: package the OSS platform as managed infrastructure.

### 17.1 Required Capabilities

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

### 17.2 Complete When

- Pilot orgs can use managed Open Maintainer without running the self-hosted stack.
- Hosted smoke checks cover install, scheduled runs, GitHub writes, dashboard history, and provider failure handling.
- Hosted preserves auditability, explicit data boundaries, and opt-in GitHub mutations.
- 2-3 pilot orgs use the managed GitHub App, scheduled runs, and durable history.

## 18. v1.2+ Hosted Scale and Enterprise Controls Requirements

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

## 19. Configuration Requirements

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

issues:
  triage_enabled: false
  auto_apply_labels: false
  auto_comment: false
  stale_after_days: 30

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
- Dashboard settings and repo config precedence are clear.
- Org-inherited policy and repo overrides are visible.

## 20. Permissions Requirements

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
- Issues: write only for manual or opt-in labels/comments.

Org/dashboard permissions:

- Members: read only where needed for org administration.
- Projects: optional and later.

Agent orchestration:

- No additional GitHub writes without explicit approval and configured credentials.

## 21. Architecture Requirements

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

## 22. Data and Artifact Requirements

Generated outputs should be immutable or versioned where practical.

Artifacts:

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

Each AI-backed artifact should capture:

- source repo/profile version
- source policy version
- model/provider/agent metadata
- timestamp
- triggering user or event
- input source summary
- output version
- errors or skipped checks

## 23. Success Metrics

Milestone completion criteria are the primary success metrics.

Cross-cutting metrics:

- Time from install to first useful context output.
- Readiness recommendation usefulness.
- Drift detection precision.
- Context refresh PR acceptance.
- PR review false-positive feedback.
- Duplicate PR comment avoidance.
- Suggested issue label acceptance.
- Missing-information prompt usefulness.
- Failed-run recovery rate.
- Agent dispatch approval and failure rates.
- Number of GitHub writes requiring explicit approval.

Real-world validation targets:

- v0.7: at least 3 real repositories validated through the self-hosted dashboard.
- v1.0: dogfooded on Open Maintainer plus at least 5 external repositories.
- v1.1: 2-3 hosted pilot orgs.

## 24. Non-Goals

Open Maintainer should not become:

- a Jira, Linear, or monday clone
- an IDE coding assistant
- a generic repo chatbot
- a fully autonomous software engineer in v1.0
- a hosted-only product
- a system that silently mutates repositories or GitHub state
- a generic AI review tool untethered from repo rules and evidence
- a tool that sends repository content to providers without explicit consent
- a product that merges PRs or pushes to default branches automatically

## 25. Key Risks and Mitigations

### 25.1 AI Output Quality

Risk: generated context, reviews, or triage may be noisy or wrong.

Mitigations:

- deterministic-first analysis
- evidence citations
- conservative defaults
- manual posting by default
- opt-in automation
- false-positive feedback
- reviewable generated artifacts

### 25.2 Security and Privacy

Risk: private repository content or secrets may leak.

Mitigations:

- explicit provider consent
- local model support
- secret redaction or blocking where feasible
- minimal logging
- model/provider metadata capture
- audit trail for GitHub writes
- approval gates for security-sensitive paths

### 25.3 Product Sprawl

Risk: the product becomes a weak project board plus weak review bot plus unsafe agent runner.

Mitigations:

- context remains the foundation
- PR review must be rule-grounded
- issue triage must prepare agent-safe work
- agent orchestration stays experimental until proven
- dashboard focuses on maintainer attention and evidence

### 25.4 Hosted Complexity

Risk: hosted concerns distort the OSS product before v1.0.

Mitigations:

- OSS v1.0 ships first
- hosted begins as v1.1 private beta
- hosted packages core workflows instead of replacing them
- enterprise features wait for v1.2+

## 26. Final Product Definition

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
