# Open Maintainer

Open Maintainer audits a repository for agent readiness, generates repo-specific context files, and can open a context PR through a GitHub App.

The primary MVP demo is CLI-first and uses a local LLM CLI for generated context files:

```text
audit repo -> show readiness score -> generate context -> doctor -> dry-run PR summary
```

The dashboard and self-hosted GitHub App flow remain available as a secondary path.

## CLI Demo

Prerequisites:

- Bun 1.1 or newer
- A fresh checkout of this repository

Install dependencies:

```sh
bun install --frozen-lockfile
```

Run the demo smoke gate:

```sh
bun run smoke:mvp
```

The smoke gate uses explicit deterministic mode to validate offline plumbing. For real generated files, use the LLM-backed flow in `docs/DEMO_RUNBOOK.md`.

For the full narrated terminal flow, see `docs/DEMO_RUNBOOK.md`.

Manual terminal flow:

```sh
TARGET_REPO="/path/to/selected/repository"

bun run cli audit "$TARGET_REPO"
bun run cli generate "$TARGET_REPO" --model codex --context codex --skills codex --allow-write
bun run cli doctor "$TARGET_REPO"
bun run cli pr "$TARGET_REPO" --create
```

Generation uses three separate choices:

| Flag | Options | Meaning |
| --- | --- | --- |
| `--model` | `codex`, `claude` | Selects which LLM CLI generates artifact content. |
| `--context` | `codex`, `claude`, `both` | Writes `AGENTS.md`, `CLAUDE.md`, or both. |
| `--skills` | `codex`, `claude`, `both` | Writes skills under `.agents/skills`, `.claude/skills`, or both. |

Examples:

```sh
# Generate Codex context and skills with Codex CLI
bun run cli generate "$TARGET_REPO" --model codex --context codex --skills codex --allow-write

# Generate Claude Code context and skills with Claude CLI
bun run cli generate "$TARGET_REPO" --model claude --context claude --skills claude --allow-write

# Use Codex CLI to generate both context files and both skill families
bun run cli generate "$TARGET_REPO" --model codex --context both --skills both --allow-write
```

`audit` writes:

- `.open-maintainer/profile.json`
- `.open-maintainer/report.md`

`generate` writes the full MVP context set when files are absent:

- `AGENTS.md`
- `.agents/skills/<repo>-start-task/SKILL.md`
- `.agents/skills/<repo>-testing-workflow/SKILL.md`
- `.agents/skills/<repo>-pr-review/SKILL.md`
- `.open-maintainer/profile.json`
- `.open-maintainer/report.md`
- `.open-maintainer.yml`

`--model` chooses the LLM CLI backend. `--context` chooses instruction files, and `--skills` chooses repo-local skill directories.
Model-backed skill generation may add additional repo-specific workflow skills when repository evidence supports them.

Existing context files are preserved by default. Use `--force` only when you explicitly want generated output to overwrite existing files. Repo content is sent to the selected LLM CLI only when `--allow-write` is present; offline deterministic mode is reserved for smoke tests.

## GitHub Action Audit Mode

The repository includes `action.yml` for pull request audit mode:

```yaml
- uses: ./
  with:
    mode: audit
    fail-on-score-below: "40"
    report-path: .open-maintainer/report.md
```

Default audit mode writes the report/profile path only and does not create PRs or mutate context files.
The bundled action uses `--no-profile-write` and stores its default report under `$RUNNER_TEMP` so pull request audits do not modify checked-out context files unless you choose a repository path.

## Dashboard and GitHub App

The secondary self-hosted workflow is:

```text
connect GitHub -> analyze repo -> generate context -> preview -> open context PR
```

Prerequisites:

- Docker Compose
- Bun 1.1 or newer for local quality gates
- A GitHub App for real installation testing
- Optional local OpenAI-compatible endpoint such as Ollama or vLLM

Start a local self-hosted stack:

```sh
cp .env.example .env
bun install --frozen-lockfile
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

Set the matching values in `.env`:

- `GITHUB_APP_ID`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_PRIVATE_KEY_BASE64`
- `GITHUB_WEBHOOK_SECRET`

Install the GitHub App on selected repositories. Installation and repository metadata appear in the dashboard after a verified installation webhook is received.

## Quality Gates

Run these before opening or merging implementation work:

```sh
bun lint
bun typecheck
bun test
bun run build
bun run smoke:mvp
docker compose up --build
bun run smoke:compose
```

The human release-readiness packet lives in `docs/MVP_RELEASE_REVIEW.md`.
