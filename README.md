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
- Git
- A fresh checkout of this repository
- Codex CLI installed and logged in for `--model codex`, or Claude Code CLI
  installed and logged in for `--model claude`

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

Repository scans use Git's visible file set when the target is a Git worktree, so ignored files are excluded by default, including files ignored through global Git excludes.

When the score is below 100, `audit` also prints a `Next steps` block with
concrete missing files or commands that would improve the readiness score.

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

## GitHub Action

Use the action in OSS repositories before installing a hosted app:

```yaml
name: Open Maintainer

on:
  pull_request:
  schedule:
    - cron: "17 9 * * 1"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: open-maintainer/action@v1
        with:
          mode: audit
          fail-on-score-below: "60"
          fail-on-drift: "true"
```

Default audit mode runs from the packaged action checkout, installs its own Bun dependencies, writes the report under `$RUNNER_TEMP`, and uses `--no-profile-write`, so pull request audits do not modify checked-out context files unless you choose a repository `report-path`.

The action always writes a GitHub Step Summary with readiness, PR delta when available, drift diagnostics, changed surface, likely tests, likely docs impact, missing validation evidence, and a context refresh recommendation. Scheduled and manual runs skip PR-only delta fields cleanly. The action warns when required generated context is missing, including `AGENTS.md` and repo-local skills, and runs `doctor` to detect stale generated profile artifacts. Set `fail-on-drift: "true"` to fail when profile drift is detected.

Permission tiers:

| Mode | Minimum permissions | GitHub writes |
| --- | --- | --- |
| Audit and Step Summary | `contents: read` | None |
| PR comment | `contents: read`, `issues: write`, `pull-requests: read` | Updates one marked PR comment |
| Refresh PR | `contents: write`, `pull-requests: write` | Pushes `open-maintainer/context-refresh` and opens or updates one PR |

To add a pull request comment using the same summary body, grant comment permission and enable comments:

```yaml
permissions:
  contents: read
  issues: write
  pull-requests: read

steps:
  - uses: actions/checkout@v4
  - uses: open-maintainer/action@v1
    with:
      mode: audit
      fail-on-score-below: "60"
      comment-on-pr: "true"
```

Refresh PRs are opt-in through `mode: refresh`. They never push to the default branch. By default, refresh generation is deterministic and overwrites only files already marked as generated by Open Maintainer; maintainer-owned context files are preserved. Use `force: "true"` only when overwriting maintainer-owned context is intentional.

```yaml
permissions:
  contents: write
  pull-requests: write

steps:
  - uses: actions/checkout@v4
  - uses: open-maintainer/action@v1
    with:
      mode: refresh
      generation-provider: deterministic
      context-target: codex
      skills-target: codex
```

Model-backed refresh can send repository content to a local CLI provider and therefore requires explicit provider selection plus CI consent:

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: open-maintainer/action@v1
    with:
      mode: refresh
      generation-provider: codex
      generation-model: gpt-5.3-codex
      allow-model-content-transfer: "true"
      context-target: both
      skills-target: both
```

## Dashboard and GitHub App

The secondary self-hosted workflow is:

```text
connect GitHub -> analyze repo -> generate context -> preview -> open context PR
```

Prerequisites:

- Docker Compose
- Git
- Bun 1.1 or newer for local quality gates
- Codex CLI or Claude Code CLI credentials mounted into the API container for
  real context generation
- GitHub CLI (`gh`) authentication, or `GH_TOKEN` in `.env`, for context PR
  creation from local Git checkouts
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
