# Open Maintainer

Open Maintainer is an open-source, self-hostable control plane for AI coding
agents working in GitHub repositories.

It turns repository conventions into durable, reviewable context, then uses that
context to help maintainers reduce low-context issues, unreviewable PRs, stale
agent instructions, and unsafe automation.

In practice, Open Maintainer helps you:

- audit a repository and explain its agent-readiness gaps
- generate `AGENTS.md`, `.open-maintainer.yml`, repo profiles, reports, and
  repo-local skills
- detect drift when repository behavior changes after context is generated
- review pull requests against approved repo rules, validation expectations, and
  changed files
- triage issues into maintainer actions and agent-safe task briefs
- run the workflow locally with a CLI, in CI with a GitHub Action, or through a
  self-hosted dashboard and GitHub App foundation

Open Maintainer suggests, drafts, reviews, and opens context PRs only through
explicit user-controlled flows. Repository content is sent to model providers
only after explicit consent, and GitHub writes are opt-in.

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
bun run cli review "$TARGET_REPO" --pr 123 --model codex --allow-model-content-transfer --dry-run
bun run cli pr "$TARGET_REPO" --create
```

## CLI Command Reference

Run `bun run cli help <command>` for terminal help. The supported commands and
flags are:

Human-readable CLI output uses colored section banners, boxed summaries, and
action tables. Pass `NO_COLOR=1` or `OPEN_MAINTAINER_NO_COLOR=1` to disable ANSI
styling in logs; JSON output remains unstyled.

### `audit <repo>`

Analyzes a repository and writes readiness artifacts.

| Flag | Meaning |
| --- | --- |
| `--fail-on-score-below <number>` | Exit non-zero when the audit score is below the threshold. |
| `--report-path <path>` | Write the audit report to a custom path. |
| `--no-profile-write` | Skip `.open-maintainer/profile.json` writes. |
| `--dry-run` | Print planned audit outputs without writing files. |

### `generate <repo>`

Generates repository context artifacts. Existing files are preserved unless a
write flag explicitly allows replacement.

| Flag | Meaning |
| --- | --- |
| `--context codex|claude|both` | Generate `AGENTS.md`, `CLAUDE.md`, or both. |
| `--skills codex|claude|both` | Generate `.agents` skills, `.claude` skills, or both. |
| `--model codex|claude` | Select the LLM CLI backend used for generated artifact content. |
| `--llm-model <model>` | Override the backend model. |
| `--allow-write` | Required with `--model`; permits model-backed artifact writes. |
| `--force` | Overwrite existing generated artifact files. |
| `--refresh-generated` | Overwrite only existing Open Maintainer generated files. |
| `--dry-run` | Print planned writes without writing files. |

### `init <repo>`

Runs `audit`, then generates missing context artifacts.

| Flag | Meaning |
| --- | --- |
| `--fail-on-score-below <number>` | Exit non-zero when the audit score is below the threshold. |
| `--report-path <path>` | Write the audit report to a custom path. |
| `--no-profile-write` | Skip `.open-maintainer/profile.json` writes during audit. |
| `--model codex|claude` | Select the LLM CLI backend used for generated artifact content. |
| `--context codex|claude|both` | Generate `AGENTS.md`, `CLAUDE.md`, or both. |
| `--skills codex|claude|both` | Generate `.agents` skills, `.claude` skills, or both. |
| `--llm-model <model>` | Override the backend model. |
| `--allow-write` | Required with `--model`; permits model-backed artifact writes. |
| `--force` | Overwrite existing generated artifact files. |
| `--refresh-generated` | Overwrite only existing Open Maintainer generated files. |
| `--dry-run` | Print planned writes without writing files. |

### `doctor <repo>`

Checks required generated context and stored profile drift.

| Flag | Meaning |
| --- | --- |
| `--fix` | Remove obsolete generated context artifacts. |
| `--dry-run` | With `--fix`, print planned fixes without writing files. |

### `review <repo>`

Produces a rule-grounded PR review. Local ref review is non-mutating by default.
With `--pr`, the CLI posts the marked summary and capped inline comments unless
`--dry-run` is present; posting flags let maintainers explicitly select which
write paths run.

| Flag | Meaning |
| --- | --- |
| `--pr <number>` | Fetch PR metadata and diff with `gh`; required for GitHub posting flags. |
| `--base-ref <ref>` | Base ref or SHA for local diff review. |
| `--head-ref <ref>` | Head ref or SHA for local diff review; defaults to `HEAD`. |
| `--pr-number <number>` | Include PR number metadata for local diff review. |
| `--output-path <path>` | Write markdown review output to a file. |
| `--json` | Print the machine-readable `ReviewResult` JSON. |
| `--dry-run` | Preview writes; with `--pr`, fetch and review without posting to GitHub. |
| `--model codex|claude` | Select the CLI backend for model-backed review. |
| `--llm-model <model>` | Override the backend model. |
| `--allow-model-content-transfer` | Required with `--model`; sends repo content to the selected backend. |
| `--review-provider codex|claude` | Alias for `--model`. |
| `--review-model <model>` | Alias for `--llm-model`. |
| `--review-post-summary` | Post or update the marked PR summary comment. |
| `--review-inline-comments` | Post capped inline finding comments. |
| `--review-inline-cap <number>` | Maximum inline comments; default with `--pr` is 5. |
| `--review-apply-triage-label` | Apply one filterable PR triage label. |
| `--review-create-triage-labels` | Create missing Open Maintainer PR triage labels before applying; requires `--review-apply-triage-label`. |

### `triage issue <repo>`, `triage issues <repo>`, and `triage brief <repo>`

Runs local issue triage or generates an agent task brief from a local triage
artifact. Issue triage is preview-only by default: it writes local artifacts but
does not label, comment, or close GitHub issues unless write flags are present.

| Flag | Meaning |
| --- | --- |
| `--number <n>` | GitHub issue number for `triage issue` or `triage brief`. |
| `--state open|closed|all` | Issue state for `triage issues`; default is `open`. |
| `--limit <n>` | Maximum issues to triage before model calls; default is 100, max is 100. |
| `--label <name>` / `--include-label <name>` | Optional label filter for `triage issues`. |
| `--exclude-label <name>` | Skip issues with the label; defaults include `triaged`, `duplicate`, `wontfix`, `invalid`, `closed`, and `security`. |
| Default batch selection | Without an include-label filter, already labelled issues are skipped and pagination continues until the requested unlabelled issue count is reached or no more issues are available. |
| `--only <signals>` | Apply only comma-separated triage signals such as `possibly_spam,needs_author_input`. |
| `--min-confidence <n>` | Skip label application below a confidence threshold from 0 to 1. |
| `--format table|json|markdown` | Choose batch console/output formatting. |
| `--output <path>` | Write a batch report to a custom path. |
| `--model codex|claude` | Select the CLI backend for model-backed triage. |
| `--llm-model <model>` | Override the backend model. |
| `--allow-model-content-transfer` | Required with `--model`; sends issue evidence and repo context to the selected backend. |
| `--json` | Print machine-readable triage result or batch report JSON. |
| `--apply` / `--apply-labels` | Apply deterministically resolved issue labels to GitHub issues. |
| `--create-missing-preset-labels` / `--create-labels` | Create missing preset labels before applying them; requires `--apply` or `--apply-labels`. |
| `--post-comment` | Post or update the marked Open Maintainer issue triage comment. |
| `--close-allowed` | Allow config-gated selective issue closure. |
| `--dry-run` | Preview local artifacts and GitHub writes without applying them. |
| `--allow-non-agent-ready` | Generate a task brief despite non-agent-ready triage. |
| `--output-path <path>` | Write generated task brief markdown to a file. |

### `pr <repo>`

Prints a dry-run context PR summary for generated artifacts.

| Flag | Meaning |
| --- | --- |
| `--create` | Required; print the dry-run PR summary. |
| `--dry-run` | Accepted for consistency; this command is always non-mutating. |

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

Generated `AGENTS.md` and `CLAUDE.md` include deterministic Contribution
Quality Requirements. Those requirements ask contributors for clear issue
reproduction or acceptance criteria, scoped PRs, validation evidence, docs
updates for public behavior changes, high-risk rationale, and the explicit
boundary that Open Maintainer evaluates reviewability rather than authorship.

## Rule-Grounded PR Review Beta

`review` produces a PR review from local Git refs or from a GitHub pull request
fetched with `gh`. It writes a summary, walkthrough, changed surface, risk
analysis, expected validation, docs impact, contribution-triage signals, cited
findings, merge readiness, and residual risk. PR review always runs through a
selected LLM CLI provider and requires explicit repository-content transfer
consent.

Contribution triage appears inside the existing PR review output. It helps
maintainers decide whether a PR is ready for review, needs author input, needs
maintainer design, is not agent-ready, or looks like possible spam-like
contribution noise. Open Maintainer evaluates reviewability, scope, evidence,
validation, and repo alignment; it does not evaluate whether the author used AI.
Issue triage is separate from PR review and uses explicit local or Action
commands.

```sh
bun run cli review "$TARGET_REPO" \
  --base-ref main \
  --head-ref HEAD \
  --model codex \
  --allow-model-content-transfer \
  --output-path .open-maintainer/review.md

bun run cli review "$TARGET_REPO" \
  --base-ref origin/main \
  --head-ref HEAD \
  --model codex \
  --allow-model-content-transfer \
  --json
```

Model-backed review:

```sh
bun run cli review "$TARGET_REPO" \
  --base-ref origin/main \
  --head-ref HEAD \
  --model codex \
  --llm-model gpt-5.5 \
  --allow-model-content-transfer \
  --output-path .open-maintainer/review.md
```

`review` uses the same `--model` and `--llm-model` flag names as context
generation. Existing scripts that use `--review-provider` or `--review-model`
continue to work as aliases.

To review and post to a real GitHub PR from a locally authenticated maintainer machine, use `--pr`. The command fetches PR refs with `gh`, updates one marked summary comment, and creates capped duplicate-aware inline comments with recommendations. Normal PR posting output is concise and reports whether comments were posted; use `--output-path` or `--json` when you need the full generated review. Use `--dry-run` to run the review without posting:

```sh
bun run cli review "$TARGET_REPO" \
  --pr <number> \
  --model codex \
  --allow-model-content-transfer

bun run cli review "$TARGET_REPO" \
  --pr <number> \
  --model codex \
  --allow-model-content-transfer \
  --dry-run
```

To make the PR list directly filterable, opt into a single Open Maintainer
triage label derived from the LLM contribution-triage category. Missing labels
are created only when `--review-create-triage-labels` is present:

```sh
bun run cli review "$TARGET_REPO" \
  --pr <number> \
  --model codex \
  --allow-model-content-transfer \
  --review-apply-triage-label \
  --review-create-triage-labels
```

The default labels are `open-maintainer/ready-for-review`,
`open-maintainer/needs-author-input`,
`open-maintainer/needs-maintainer-design`,
`open-maintainer/not-agent-ready`, and `open-maintainer/possible-spam`.
Open Maintainer passes GitHub PR state into the review prompt, including draft
status, mergeability, merge state, review decision, and checks. It refuses to
apply `open-maintainer/ready-for-review` when GitHub reports objective blockers
such as draft status, merge conflicts, dirty merge state, requested changes, or
failed/pending checks.

## Issue Triage

Issue triage classifies GitHub issues for maintainer review and agent readiness
using the selected local model CLI. It requires explicit repository-content
transfer consent and is non-mutating by default.

```sh
bun run cli triage issue "$TARGET_REPO" \
  --number 82 \
  --model codex \
  --allow-model-content-transfer

bun run cli triage issues "$TARGET_REPO" \
  --state open \
  --limit 5 \
  --model codex \
  --allow-model-content-transfer
```

Local issue artifacts are written under
`.open-maintainer/triage/issues/<number>.json`; batch reports are written under
`.open-maintainer/triage/runs/`. Treat `.open-maintainer/triage/` as ignored
local operational history for maintainer inspection. Model output uses fixed
signals such as `needs_author_input`, `missing_reproduction`,
`ready_for_maintainer_review`, and `possibly_spam`; Open Maintainer maps those
signals deterministically to existing upstream labels first, then to fixed preset
labels. Opt-in writes use explicit flags: `--apply`, `--apply-labels`,
`--create-missing-preset-labels`, `--create-labels`, `--post-comment`, and
config-gated `--close-allowed`. Label creation and application use `gh api`,
and new comments use `gh issue comment --body-file`. Existing marked comment
updates and closure also use `gh api` for the missing high-level operations. All
writes use the maintainer's local `gh` authentication with issue write
permission; if GitHub rejects a write, the triage result remains available and
the write action is recorded as failed.

Generate agent task briefs as a second step from an existing local triage
artifact:

```sh
bun run cli triage brief "$TARGET_REPO" --number 82
```

Briefs are generated only for `agent_ready` issues unless a maintainer passes
`--allow-non-agent-ready`.

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
| Refresh PR | `contents: write`, `pull-requests: write` | Pushes `open-maintainer/context-refresh` and opens or updates one PR |
| Read-only issue triage | `contents: read`, `issues: read` | None |
| Issue labels/comments | `contents: read`, `issues: write` | Applies opt-in labels, creates labels, posts marked comments, or config-gated closure |

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

Action issue triage is opt-in through `mode: issue-triage`. It uses the same
provider inputs as refresh generation and requires
`allow-model-content-transfer: "true"` before sending issue and repository
context to the model CLI. By default it only writes console output, a Step
Summary, and local `.open-maintainer/triage` artifacts in the runner. Issue
triage mode is intended for `issues`, `schedule`, or `workflow_dispatch`
workflows, not pull request workflows.

```yaml
permissions:
  contents: read
  issues: read

steps:
  - uses: actions/checkout@v6
  - uses: open-maintainer/action@v1
    with:
      mode: issue-triage
      issue-number: "82"
      generation-provider: codex
      allow-model-content-transfer: "true"
```

Opt into writes by granting `issues: write` and enabling only the desired write
flags:

```yaml
permissions:
  contents: read
  issues: write

steps:
  - uses: actions/checkout@v6
  - uses: open-maintainer/action@v1
    with:
      mode: issue-triage
      issue-state: open
      issue-limit: "5"
      generation-provider: codex
      allow-model-content-transfer: "true"
      issue-apply-labels: "true"
      issue-create-labels: "true"
      issue-post-comment: "true"
```

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

Rule-grounded PR review is a maintainer-run CLI workflow in v0.4. It uses the maintainer's local `gh` authentication to fetch PR metadata and refs, then uses the selected local model CLI to generate the review. `--pr` posts one marked summary comment and capped inline finding comments back to GitHub; use `--review-apply-triage-label` to apply a filterable PR triage label, and use `--dry-run` to preview without posting.

```sh
bun run cli review . \
  --pr 123 \
  --model codex \
  --llm-model gpt-5.5 \
  --allow-model-content-transfer \
  --review-apply-triage-label \
  --review-create-triage-labels
```

Dry-run review keeps GitHub untouched:

```sh
bun run cli review . \
  --pr 123 \
  --model claude \
  --allow-model-content-transfer \
  --dry-run
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
