# Open Maintainer

Open Maintainer is a self-hostable, open-source AI maintainer for GitHub-native teams.

The MVP workflow is:

```text
connect GitHub -> analyze repo -> generate context -> preview -> open context PR
```

## Quickstart

Prerequisites:

- Docker Compose
- Bun 1.1 or newer for local quality gates
- A GitHub App for real installation testing
- Optional local OpenAI-compatible endpoint such as Ollama or vLLM

Start a local self-hosted stack:

```sh
cp .env.example .env
bun install
docker compose up --build
```

Open the dashboard at `http://localhost:3000`. The API listens on `http://localhost:4000`.

Run a local health diagnostic after the stack is up:

```sh
bun run diagnostics
```

Run the Docker Compose smoke gate:

```sh
bun run smoke:compose
```

## GitHub App Setup

Create a GitHub App with these MVP permissions:

- Repository metadata: read
- Repository contents: write
- Pull requests: write

Configure a webhook secret and point the webhook URL at:

```text
http://localhost:4000/github/webhook
```

For local webhook delivery from GitHub, expose the API with a tunnel and use the tunnel URL instead. Set the matching values in `.env`:

- `GITHUB_APP_ID`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_PRIVATE_KEY_BASE64`
- `GITHUB_WEBHOOK_SECRET`

Install the GitHub App on selected repositories. Installation and repository metadata appear in the dashboard after a verified installation webhook is received.

## First Context PR

1. Confirm the dashboard shows healthy API, Postgres, Redis, and worker status.
2. Configure GitHub App credentials and install the app on one selected repo.
3. Select the repo in the dashboard.
4. Run deterministic analysis to create `repo_profile:v1`.
5. Configure a model provider and explicitly enable repo-content consent.
6. Generate context artifacts.
7. Preview `AGENTS.md` and `.open-maintainer.yml`.
8. Open a context PR.

The MVP never commits directly to the default branch. Context PRs use a branch named like `open-maintainer/context-{repoProfileVersion}` and include only `AGENTS.md` and `.open-maintainer.yml`.

## Setup Diagnostics

Common setup states are surfaced through `/health`, the dashboard, and repo run history:

- Missing GitHub credentials: settings can be saved only after required values are present.
- Failed webhook verification: `/github/webhook` returns `401`.
- Database or Redis unavailable: `/health` returns `degraded`.
- Worker not heartbeating: dashboard worker status shows `missing`.
- Provider not configured or consent disabled: generation fails closed and records a failed run.

## Migrations

The first MVP migration is stored at `packages/db/migrations/0001_mvp_foundation.sql`. The current scaffold uses an in-memory store for local tests and demo behavior; apply the SQL migration when wiring a persistent Postgres deployment.

## Quality Gates

Run these before opening or merging implementation work:

```sh
bun lint
bun typecheck
bun test
bun run build
docker compose up --build
bun run smoke:compose
```

The human release-readiness packet lives in `docs/MVP_RELEASE_REVIEW.md`.
