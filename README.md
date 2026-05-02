# Open Maintainer

Open Maintainer audits a repository for agent readiness, generates repo-specific context files, reviews pull requests against approved repo context, and can open a context PR through a GitHub App.

The primary MVP demo is CLI-first and uses a local LLM CLI for generated context files:

```text
audit repo -> show readiness score -> generate context -> doctor -> review PR
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

The smoke gate uses a fake local Codex CLI fixture to validate the LLM-backed plumbing without contacting an external provider. Real generated files use the same model-backed flow described in `docs/DEMO_RUNBOOK.md`.

For the full narrated terminal flow, see `docs/DEMO_RUNBOOK.md`.

Manual terminal flow:

```sh
TARGET_REPO="/path/to/selected/repository"

bun run cli audit "$TARGET_REPO"
bun run cli generate "$TARGET_REPO" --model codex --context codex --skills codex --allow-write
bun run cli doctor "$TARGET_REPO"
bun run cli review "$TARGET_REPO" --base-ref main --head-ref HEAD --review-provider codex --allow-model-content-transfer --output-path .open-maintainer/review.md
bun run cli pr "$TARGET_REPO" --create
```

Generation uses three separate choices:

| Flag | Options | Meaning |
| --- | --- | --- |
| `--model` | `codex`, `claude` | Selects which LLM CLI generates artifact content. |
| `--context` | `codex`, `claude`, `both` | Writes `AGENTS.md`, `CLAUDE.md`, or both. |
| `--skills` | `codex`, `claude`, `both` | Writes skills under `.agents/skills`, `.claude/skills`, or both. |

Current Codex model choices:

| Model | Recommended use |
| --- | --- |
| `gpt-5.5` | Current frontier model for complex coding, research, and real-world work. |
| `gpt-5.4` | Strong model for everyday coding. |
| `gpt-5.4-mini` | Small, fast, and cost-efficient model for simpler coding tasks. |
| `gpt-5.3-codex` | Coding-optimized model. |
| `gpt-5.3-codex-spark` | Ultra-fast coding model. |
| `gpt-5.2` | Optimized for professional work and long-running agents. |

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

Existing context files are preserved by default. Use `--force` only when you explicitly want generated output to overwrite existing files. Repo content is sent to the selected LLM CLI only when `--allow-write` is present.

## Rule-Grounded PR Review Beta

`review` produces a non-mutating PR review from local Git refs. It writes a summary, walkthrough, changed surface, risk analysis, expected validation, docs impact, cited findings, merge readiness, and residual risk. PR review always runs through a selected LLM CLI provider and requires explicit repository-content transfer consent.

```sh
bun run cli review "$TARGET_REPO" \
  --base-ref main \
  --head-ref HEAD \
  --review-provider codex \
  --allow-model-content-transfer \
  --output-path .open-maintainer/review.md

bun run cli review "$TARGET_REPO" \
  --base-ref origin/main \
  --head-ref HEAD \
  --review-provider codex \
  --allow-model-content-transfer \
  --json
```

Model-backed review:

```sh
bun run cli review "$TARGET_REPO" \
  --base-ref origin/main \
  --head-ref HEAD \
  --review-provider codex \
  --review-model gpt-5.5 \
  --allow-model-content-transfer \
  --output-path .open-maintainer/review.md
```

The CLI review command never posts to GitHub in v0.4. To post manually, inspect the generated markdown first and then use a maintainer-controlled command such as:

```sh
gh pr comment <number> --body-file "$TARGET_REPO/.open-maintainer/review.md"
```

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
      - uses: actions/checkout@v6
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
| Audit PR comment | `contents: read`, `issues: write`, `pull-requests: read` | Updates one marked audit comment |
| Review Step Summary | `contents: read` | None |
| Review summary comment | `contents: read`, `issues: write`, `pull-requests: read` | Updates one marked review summary comment |
| Review inline comments | `contents: read`, `pull-requests: write` | Opens one capped pull request review with inline comments |
| Refresh PR | `contents: write`, `pull-requests: write` | Pushes `open-maintainer/context-refresh` and opens or updates one PR |

To add a pull request comment using the same summary body, grant comment permission and enable comments:

```yaml
permissions:
  contents: read
  issues: write
  pull-requests: read

steps:
  - uses: actions/checkout@v6
  - uses: open-maintainer/action@v1
    with:
      mode: audit
      fail-on-score-below: "60"
      comment-on-pr: "true"
```

Refresh PRs are opt-in through `mode: refresh`. They never push to the default branch. Refresh generation uses the selected LLM CLI provider and overwrites only files already marked as generated by Open Maintainer unless `force: "true"` is set. Maintainer-owned context files are preserved by default.

```yaml
permissions:
  contents: write
  pull-requests: write

steps:
  - uses: actions/checkout@v6
  - uses: open-maintainer/action@v1
    with:
      mode: refresh
      generation-provider: codex
      allow-model-content-transfer: "true"
      context-target: codex
      skills-target: codex
```

Model-backed refresh can send repository content to a local CLI provider and therefore requires explicit provider selection plus CI consent:

```yaml
steps:
  - uses: actions/checkout@v6
  - uses: open-maintainer/action@v1
    with:
      mode: refresh
      generation-provider: codex
      generation-model: gpt-5.5
      allow-model-content-transfer: "true"
      context-target: both
      skills-target: both
```

Review mode is check-output-only by default. It appends the generated review to the GitHub Step Summary and does not comment unless comment inputs are enabled:

```yaml
permissions:
  contents: read

steps:
  - uses: actions/checkout@v6
    with:
      fetch-depth: 0
  - uses: open-maintainer/action@v1
    with:
      mode: review
      review-provider: codex
      allow-review-content-transfer: "true"
```

Opt-in review summary comments update one marked PR comment:

```yaml
permissions:
  contents: read
  issues: write
  pull-requests: read

steps:
  - uses: actions/checkout@v6
    with:
      fetch-depth: 0
  - uses: open-maintainer/action@v1
    with:
      mode: review
      review-provider: codex
      allow-review-content-transfer: "true"
      review-comment-on-pr: "true"
```

Opt-in inline findings are capped and duplicate-aware:

```yaml
permissions:
  contents: read
  pull-requests: write

steps:
  - uses: actions/checkout@v6
    with:
      fetch-depth: 0
  - uses: open-maintainer/action@v1
    with:
      mode: review
      review-provider: codex
      allow-review-content-transfer: "true"
      review-inline-comments: "true"
      review-inline-cap: "5"
```

This repository dogfoods the v0.4 review Action in `.github/workflows/open-maintainer-audit.yml` behind explicit configuration:

- Set repository variable `OPEN_MAINTAINER_REVIEW_ENABLED` to `true`.
- Set secret `OPENAI_API_KEY`; the workflow logs Codex CLI in with `codex login --with-api-key`.
- Optionally set `OPEN_MAINTAINER_REVIEW_MODEL` and `OPEN_MAINTAINER_REVIEW_INLINE_CAP`.

The review job only runs for same-repository pull requests, uses `fetch-depth: 0`, posts one marked summary comment, and publishes capped duplicate-aware inline comments. Fork pull requests keep the read-only audit path.

Model-backed review uses the selected local CLI provider only after explicit consent:

```yaml
steps:
  - uses: actions/checkout@v6
    with:
      fetch-depth: 0
  - uses: open-maintainer/action@v1
    with:
      mode: review
      review-provider: codex
      review-model: gpt-5.5
      allow-review-content-transfer: "true"
```

## Dashboard and GitHub App

The secondary self-hosted workflow is:

```text
connect GitHub -> analyze repo -> generate context -> preview -> review PR -> open context PR
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

The dashboard can start local PR review previews for a selected repository, show the full review before any GitHub write, record review runs in history, and capture finding feedback such as false positives. Posting controls remain guarded unless GitHub credentials and permissions are available.

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
The v0.4 release-readiness packet lives in `docs/V0_4_RELEASE_REVIEW.md`.
