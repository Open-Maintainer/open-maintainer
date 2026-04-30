# MVP Release Review Packet

Issue #9 is a maintainer decision gate. Use this packet as the pull request body or review attachment when the AFK implementation issues are complete.

## MVP boundary

Included:

- GitHub App configuration, webhook verification, installation and repository status.
- Deterministic repository analysis and versioned `repo_profile`.
- Explicit model-provider configuration and repo-content consent.
- Versioned `AGENTS.md` and `.open-maintainer.yml` preview.
- Context pull request creation against a branch, never the default branch.
- Repo-local run history with safe retry for failed runs.
- Docker Compose self-hosting path and smoke diagnostics.

Excluded:

- Automatic PR review comments.
- Issue triage.
- Kanban or org memory.
- Managed SaaS, billing, SSO, Helm, or Terraform.
- Autonomous code-writing behavior.

## Acceptance evidence

| Checklist item | Evidence to attach |
| --- | --- |
| Docker Compose starts `web`, `api`, `worker`, `postgres`, and `redis`. | `docker compose up --build` plus `bun run smoke:compose`. |
| GitHub App credentials can be configured. | Dashboard settings screen or `POST /github/settings` response. |
| Webhook signatures are verified. | `packages/github/tests/webhook.test.ts`. |
| Installation, repo, and permission metadata are stored. | `POST /github/webhook`, `GET /installations`, `GET /repos`. |
| A user can select one repo. | Dashboard repository panel. |
| Repository contents are fetched through installation credentials. | Mocked MVP path uses repo files behind repository records; real Octokit helper remains the next hardening point. |
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
docker compose up --build
bun run smoke:compose
```

## Maintainer decision

- Decision:
- Reviewer:
- Date:
- Commit or PR SHA:
- MVP-blocking follow-up issues:
