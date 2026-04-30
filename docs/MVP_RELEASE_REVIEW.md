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

## Maintainer decision

- Decision:
- Reviewer:
- Date:
- Commit or PR SHA:
- MVP-blocking follow-up issues:
