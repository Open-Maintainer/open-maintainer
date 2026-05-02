# Open Maintainer Feature Runbook

This runbook is the hands-on validation guide for the features implemented
through `v0.2.0`. It is written so you can copy commands from the repository
root and evaluate release readiness yourself.

Most commands below are offline and deterministic. The optional LLM-backed
generation and GitHub PR paths require explicit credentials and consent.

## Feature Status

Implemented and testable:

- CLI audit, readiness report, deterministic profile generation, and concrete
  next actions.
- v0.2 readiness-quality categories: setup clarity, architecture clarity,
  testing, CI, docs, risk handling, generated-file handling, and agent
  instructions.
- Repo profiling for commands, CI, docs, ownership hints, generated files,
  lockfiles, environment variables, issue templates, PR templates, risk paths,
  package boundaries, ignore files, and test files.
- Context artifact generation for Codex and Claude instruction families.
- Context preservation by default, with explicit `--force` overwrite.
- Explicit model-backed write consent through `--allow-write`.
- Doctor checks for missing required context and drift.
- Drift explanations for commands, CI, docs, templates, context artifacts,
  lock/config files, package boundaries, and risk paths.
- Dry-run context PR summary from the CLI.
- GitHub Action audit mode with no default repository mutation, Step Summary
  output, drift warnings, optional failure on drift, optional PR comments,
  scheduled stale-context checks, and opt-in refresh PRs.
- Self-hosted dashboard foundation with API, worker, web, Postgres, Redis,
  provider setup, repository analysis, artifact preview, run history, and
  context PR plumbing.
- GitHub App foundation: webhook signature verification, installation metadata,
  repository fetching helpers, branch naming, and context PR body rendering.

Not implemented yet:

- Rule-grounded PR review product.
- Issue triage product.
- Agent orchestration.
- Hosted product.

## Prerequisites

- Bun 1.1 or newer.
- Git.
- Docker Compose for dashboard and stack checks.
- Optional: Codex CLI installed and logged in for `--model codex`.
- Optional: Claude Code CLI installed and logged in for `--model claude`.
- Optional: GitHub CLI authentication or `GH_TOKEN` for real context PRs.

Start from the repository root:

```sh
cd /Users/alexmetelli/source/open-maintainer
bun install --frozen-lockfile
```

## Fast Release Check

Run the non-Docker release checks:

```sh
bun lint
bun typecheck
bun test
bun run build
bun run smoke:mvp
bun run cli doctor .
```

Expected high-signal output:

```text
MVP smoke passed: <before>/100 -> <after>/100
Agent Readiness: 100/100
all required artifacts are present
```

Run the Docker Compose release check:

```sh
docker compose up --build -d
bun run smoke:compose
docker compose down --volumes --remove-orphans
```

Expected output:

```text
Docker Compose smoke passed.
```

## v0.2 Readiness Quality

Run the representative readiness-quality fixture test:

```sh
bun test tests/v02-readiness.test.ts
```

This validates:

- `tests/fixtures/high-readiness-ts`: 100/100 readiness.
- `tests/fixtures/low-context-ts`: low-readiness guidance.
- `tests/fixtures/missing-context-ts`: missing Open Maintainer context guidance.
- Drift findings that identify changed surfaces instead of only reporting a
  profile hash mismatch.

Inspect each fixture manually:

```sh
bun run cli audit tests/fixtures/high-readiness-ts --no-profile-write --report-path /tmp/open-maintainer-high.md
bun run cli audit tests/fixtures/low-context-ts --no-profile-write --report-path /tmp/open-maintainer-low.md
bun run cli audit tests/fixtures/missing-context-ts --no-profile-write --report-path /tmp/open-maintainer-missing-context.md

sed -n '1,180p' /tmp/open-maintainer-high.md
sed -n '1,180p' /tmp/open-maintainer-low.md
sed -n '1,180p' /tmp/open-maintainer-missing-context.md
```

The high-readiness report should show all categories complete. The low and
missing-context reports should include concrete missing items and evidence.

## CLI Audit And Report

Use a disposable copy when testing write behavior:

```sh
RUN_ROOT="$(mktemp -d)"
cp -R tests/fixtures/low-context-ts "$RUN_ROOT/widget-api"
TARGET_REPO="$RUN_ROOT/widget-api"
```

Audit the repository:

```sh
bun run cli audit "$TARGET_REPO"
```

Expected output includes:

```text
Agent Readiness: <score>/100
Profile: .open-maintainer/profile.json
Report: .open-maintainer/report.md
Next steps:
```

Inspect the generated report:

```sh
sed -n '1,220p' "$TARGET_REPO/.open-maintainer/report.md"
```

Check threshold behavior:

```sh
bun run cli audit "$TARGET_REPO" --fail-on-score-below 100
```

Expected result: non-zero exit because the low-context fixture is intentionally
below 100 before context generation.

## Deterministic Context Generation

Generate the Codex artifact family without using an LLM:

```sh
bun run cli generate "$TARGET_REPO" \
  --deterministic \
  --context codex \
  --skills codex
```

List generated files:

```sh
find "$TARGET_REPO" \
  -path "$TARGET_REPO/node_modules" -prune -o \
  -type f \
  | sed "s#^$TARGET_REPO/##" \
  | sort
```

Expected generated files include:

```text
AGENTS.md
.agents/skills/<repo>-start-task/SKILL.md
.agents/skills/<repo>-testing-workflow/SKILL.md
.agents/skills/<repo>-pr-review/SKILL.md
.open-maintainer/profile.json
.open-maintainer/report.md
.open-maintainer.yml
```

Run audit again and verify the score improves:

```sh
bun run cli audit "$TARGET_REPO"
```

Run doctor:

```sh
bun run cli doctor "$TARGET_REPO"
```

Expected output:

```text
all required artifacts are present
```

Print the dry-run context PR summary:

```sh
bun run cli pr "$TARGET_REPO" --create
```

Expected output includes a branch name and readiness score. This CLI command
does not push a branch.

## Init Shortcut

`init` runs audit and then generates missing artifacts:

```sh
INIT_ROOT="$(mktemp -d)"
cp -R tests/fixtures/low-context-ts "$INIT_ROOT/widget-api"

bun run cli init "$INIT_ROOT/widget-api" \
  --deterministic \
  --context codex \
  --skills codex

bun run cli doctor "$INIT_ROOT/widget-api"
```

Expected output:

```text
Initialized Open Maintainer context at score <score>/100.
all required artifacts are present
```

## Safety And Consent

Model-backed generation fails without explicit consent:

```sh
CONSENT_ROOT="$(mktemp -d)"
cp -R tests/fixtures/low-context-ts "$CONSENT_ROOT/widget-api"

bun run cli generate "$CONSENT_ROOT/widget-api" \
  --model codex \
  --context codex \
  --skills codex
```

Expected result: non-zero exit with an error requiring `--allow-write`.

Deterministic generation preserves existing files by default:

```sh
bun run cli generate "$TARGET_REPO" \
  --deterministic \
  --context codex \
  --skills codex
```

Expected output includes `skip:` entries for existing files.

Use `--force` only when overwriting generated artifacts is intentional:

```sh
bun run cli generate "$TARGET_REPO" \
  --deterministic \
  --context codex \
  --skills codex \
  --force
```

## Optional LLM-Backed Generation

Confirm the selected CLI is available:

```sh
codex --version
claude --version
```

Optionally choose backend models:

```sh
export OPEN_MAINTAINER_CODEX_MODEL="gpt-5.3-codex"
export OPEN_MAINTAINER_CLAUDE_MODEL="claude-sonnet-4-6"
```

Generate Codex context with explicit consent:

```sh
LLM_ROOT="$(mktemp -d)"
cp -R tests/fixtures/low-context-ts "$LLM_ROOT/widget-api"

bun run cli generate "$LLM_ROOT/widget-api" \
  --model codex \
  --context codex \
  --skills codex \
  --allow-write
```

Generate Claude Code context with explicit consent:

```sh
bun run cli generate "$LLM_ROOT/widget-api" \
  --model claude \
  --context claude \
  --skills claude \
  --allow-write \
  --force
```

Generate both instruction families with one model backend:

```sh
bun run cli generate "$LLM_ROOT/widget-api" \
  --model codex \
  --context both \
  --skills both \
  --allow-write \
  --force
```

Override the backend model for one run:

```sh
bun run cli generate "$LLM_ROOT/widget-api" \
  --model codex \
  --llm-model "gpt-5.3-codex" \
  --context codex \
  --skills codex \
  --allow-write \
  --force
```

## Drift Detection

Create a disposable repo, generate context, then change a command:

```sh
DRIFT_ROOT="$(mktemp -d)"
cp -R tests/fixtures/low-context-ts "$DRIFT_ROOT/widget-api"

bun run cli generate "$DRIFT_ROOT/widget-api" \
  --deterministic \
  --context codex \
  --skills codex

node -e '
const fs = require("node:fs");
const path = process.argv[1];
const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
pkg.scripts.typecheck = "tsc --noEmit";
fs.writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
' "$DRIFT_ROOT/widget-api/package.json"

bun run cli doctor "$DRIFT_ROOT/widget-api"
```

Expected output includes:

```text
drift: command package.json script typecheck was added: "tsc --noEmit"
```

Run the broader drift regression tests:

```sh
bun test tests/cli-doctor.test.ts
```

Those tests cover command, CI, docs, template, context artifact, lock/config,
package-boundary, and risk-path drift.

## GitHub Action

Validate the local action metadata and workflow behavior:

```sh
bun test tests/action-mvp.test.ts
```

The action supports:

- `mode: audit`
- `mode: refresh`
- `fail-on-score-below`
- `report-path`
- `fail-on-drift`
- `comment-on-pr`
- `github-token`
- `generation-provider`
- `generation-model`
- `allow-model-content-transfer`
- `context-target`
- `skills-target`
- `refresh-branch`
- `refresh-title`
- `force`

Audit-only workflow shape:

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

Expected behavior:

- `mode: audit` is non-mutating by default.
- Every run writes a GitHub Step Summary with readiness, drift, changed surface,
  likely tests, likely docs impact, missing validation evidence, and refresh
  recommendation sections.
- Pull request runs include a readiness delta when the base can be fetched.
- Scheduled and manual runs do not require `github.event.pull_request` fields.
- `fail-on-drift: "true"` fails scheduled stale-context checks when drift is
  detected.

Optional PR comments reuse the Step Summary body and require write permission:

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
      comment-on-pr: "true"
```

Opt-in deterministic refresh PRs require write permissions:

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

Expected refresh behavior:

- No branch is pushed and no PR is opened unless `mode: refresh` is set.
- The action never pushes to the default branch.
- The default branch is `open-maintainer/context-refresh`.
- Existing generated Open Maintainer files can be refreshed.
- Existing maintainer-owned context files are preserved unless `force: "true"`
  is set.
- Repeated runs update the existing refresh PR for the branch.

Model-backed refresh requires explicit provider selection and consent:

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

Without `allow-model-content-transfer: "true"`, `generation-provider: codex`
or `generation-provider: claude` fails before generation starts.

## API, Providers, GitHub Helpers, And Context PRs

Run API contract and dashboard action tests:

```sh
bun test apps/api/tests/api.test.ts
```

Run provider guard tests:

```sh
bun test packages/ai/tests/provider.test.ts
```

Run GitHub helper and webhook tests:

```sh
bun test packages/github/tests/webhook.test.ts
```

Run context rendering tests:

```sh
bun test packages/context/tests/render.test.ts
```

Together these validate:

- `/health`, repository registration, analysis, provider actions, artifact
  generation, run history, retryable failures, and local PR plumbing.
- Provider consent guards and CLI provider execution shape.
- Webhook signature verification and installation metadata mapping.
- Bounded repository content fetching.
- Context branch naming, PR body rendering, preservation of existing context
  files, and existing PR updates.
- Context artifact schema, profile fingerprints, renderer output, and
  model-output parsing.

## Self-Hosted Dashboard Stack

Create `.env` if it does not exist:

```sh
test -f .env || cp .env.example .env
```

Start the stack:

```sh
docker compose up --build -d
```

Open:

```text
http://localhost:3000
```

Run health diagnostics:

```sh
bun run diagnostics
```

Run the compose smoke gate:

```sh
bun run smoke:compose
```

Expected output:

```text
Docker Compose smoke passed.
```

Check provider CLIs inside the API container when testing LLM-backed dashboard
generation:

```sh
docker exec open-maintainer-api-1 codex --version
docker exec open-maintainer-api-1 claude --version
```

Context PR creation from the dashboard requires authenticated GitHub CLI inside
the API container. Set these values in `.env`:

```sh
GH_TOKEN=github_pat_xxx
OPEN_MAINTAINER_GIT_AUTHOR_NAME="Open Maintainer"
OPEN_MAINTAINER_GIT_AUTHOR_EMAIL="open-maintainer@users.noreply.github.com"
```

Recreate the API container after changing `.env`:

```sh
docker compose up -d --force-recreate api
docker exec open-maintainer-api-1 gh auth status
```

Stop the stack:

```sh
docker compose down --volumes --remove-orphans
```

## GitHub App Setup

Create a GitHub App with these MVP permissions:

- Repository metadata: read.
- Repository contents: write.
- Pull requests: write.

Configure the webhook URL:

```text
http://localhost:4000/github/webhook
```

Set matching values in `.env`:

```sh
GITHUB_APP_ID=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_PRIVATE_KEY_BASE64=
GITHUB_WEBHOOK_SECRET=
```

Local webhook and installation behavior is covered by:

```sh
bun test packages/github/tests/webhook.test.ts apps/api/tests/api.test.ts
```

## Troubleshooting Checks

Print CLI help:

```sh
bun run cli --help
bun run cli audit --help
bun run cli generate --help
bun run cli doctor --help
bun run cli pr --help
```

Check current repository readiness:

```sh
bun run cli audit . --no-profile-write --report-path /tmp/open-maintainer-current.md
sed -n '1,220p' /tmp/open-maintainer-current.md
bun run cli doctor .
```

Check Docker service status:

```sh
docker compose ps
docker compose logs --no-color api worker web
```

Clean up disposable fixture copies:

```sh
rm -rf "$RUN_ROOT" "$INIT_ROOT" "$CONSENT_ROOT" "$LLM_ROOT" "$DRIFT_ROOT"
```
