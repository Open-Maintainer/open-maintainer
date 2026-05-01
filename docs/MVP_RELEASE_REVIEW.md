# MVP Release Review Packet

Issue #24 is a maintainer decision gate. Use this packet as the pull request body or review attachment when the AFK implementation issues are complete.

## MVP boundary

Included:

- GitHub App configuration, webhook verification, installation and repository status.
- CLI-first deterministic repository analysis and versioned `repo_profile`.
- Agent-readiness score with missing-context report.
- Explicit model-provider configuration and repo-content consent for optional synthesis.
- Full MVP context artifact set, including agent instructions, Copilot/Cursor rules, repo-local skills, profile, report, and policy config.
- Context pull request creation against a branch, never the default branch.
- Repo-local run history with safe retry for failed runs.
- GitHub Action audit mode with missing-context warnings, drift detection, and optional pull request summary comments.
- CLI MVP smoke diagnostics plus Docker Compose self-hosting path.

Excluded:

- Automatic code-review comments on pull request diffs.
- Issue triage.
- Kanban or org memory.
- Managed SaaS, billing, SSO, Helm, or Terraform.
- Autonomous code-writing behavior.

## Acceptance evidence

| Checklist item | Evidence to attach |
| --- | --- |
| CLI demo works from a fresh checkout. | `bun run smoke:mvp`. |
| `open-maintainer audit .` produces readiness score and report. | `bun run cli audit tests/fixtures/low-context-ts`. |
| v0.2 readiness quality is covered across representative repositories. | `tests/v02-readiness.test.ts` covers high-readiness, low-readiness, drift, and missing-context fixtures. |
| Full artifact generation works and preserves existing files by default. | `bun run cli generate <fixture> --model codex --context codex --skills codex --allow-write`, then `bun run cli doctor <fixture>`. Use `--context claude --skills claude` when Claude Code project skills are part of the review. |
| GitHub Action audit mode works without default context mutation. | `action.yml`, `.github/workflows/open-maintainer-audit.yml`, and action metadata tests. |
| GitHub Action warns on missing context, detects drift, and can comment on PRs when enabled. | `tests/action-mvp.test.ts` plus CLI audit and doctor fixture evidence. |
| Docker Compose starts `web`, `api`, `worker`, `postgres`, and `redis`. | `docker compose up --build` plus `bun run smoke:compose`. |
| GitHub App credentials can be configured. | Dashboard settings screen or `POST /github/settings` response. |
| Webhook signatures are verified. | `packages/github/tests/webhook.test.ts`. |
| Installation, repo, and permission metadata are stored. | `POST /github/webhook`, `GET /installations`, `GET /repos`. |
| A user can select one repo. | Dashboard repository panel. |
| Repository contents are fetched through installation credentials. | `fetchRepositoryFilesForAnalysis` and API analyze path with GitHub App auth. |
| Deterministic repo profile generation works. | `POST /repos/:repoId/analyze`, analyzer fixture tests, profile preview. |
| No repo content leaves before explicit provider configuration and generation action. | Provider guard tests and failed generation run before consent. |
| Local OpenAI-compatible endpoint can be configured. | `packages/ai/tests/provider.test.ts`. |
| Versioned context artifacts are generated and previewed. | `packages/context/tests/render.test.ts`, dashboard artifact panel. |
| Context PR writes only default MVP files. | `packages/github/tests/webhook.test.ts` PR body and branch tests. |
| Generated artifacts link to source profile version. | Artifact records include `sourceProfileVersion`. |
| Failed runs are visible and retryable where safe. | API run retry test. |

## Release gate

Run from the repo root:

```sh
bun lint
bun typecheck
bun test
bun run build
bun run smoke:mvp
docker compose up --build
bun run smoke:compose
```

## Latest dry-run evidence

Date: 2026-05-02
Base commit: `a04cbc9`

Result: passed for v0.2 readiness-quality release validation.

Commands run:

- `bun lint`: passed.
- `bun typecheck`: passed.
- `bun test`: passed, 64 tests across 16 files.
- `bun run build`: passed, including the Next production build.
- `bun run smoke:mvp`: passed, `MVP smoke passed: 66/100 -> 82/100`.
- `bun run cli doctor .`: passed, `Agent Readiness: 100/100` and all required
  artifacts present.
- `docker compose up --build -d`: passed.
- `bun run smoke:compose`: passed, `Docker Compose smoke passed.`
- `docker compose down --volumes --remove-orphans`: completed cleanup.

Readiness quality evidence:

- Profile output now includes first-class setup, architecture, testing, CI,
  docs, risk-handling, generated-file-handling, and agent-instruction
  categories.
- Analyzer profile output now records ownership hints, environment files and
  variables, generated-file paths, ignore files, and test files.
- `tests/fixtures/high-readiness-ts` validates a 100/100 readiness repository.
- `tests/fixtures/low-context-ts` validates low-readiness guidance.
- `tests/fixtures/missing-context-ts` validates missing Open Maintainer context
  guidance on an otherwise conventional repository.
- Drift tests validate changed command, CI, docs, template, context artifact,
  lock/config, package-boundary, and risk-path surfaces.

Compose resolution retained:

- Docker Compose now uses a one-shot `deps` service to run
  `bun install --frozen-lockfile` once before API startup.
- API, worker, and web share a named `node_modules` volume and no longer run
  competing startup installs against the bind-mounted workspace.
- `tests/action-mvp.test.ts` covers the compose dependency-install shape.

## Maintainer decision

- Decision:
- Reviewer:
- Date:
- Commit or PR SHA:
- MVP-blocking follow-up issues:
