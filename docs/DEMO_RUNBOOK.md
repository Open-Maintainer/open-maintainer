# Open Maintainer Demo Runbook

This runbook shows the CLI-first MVP demo from a fresh checkout. The real artifact-generation demo uses a local LLM CLI with explicit repo-content consent. It does not require GitHub OAuth, Postgres, Redis, Docker, or a separate OpenAI API key, and it does not mutate the Open Maintainer source repository.

## Prerequisites

- Bun 1.1 or newer
- A local checkout of this repository
- Codex CLI installed and logged in for `--model codex`
- Claude CLI installed and logged in for `--model claude`

Start from the repository root:

```sh
cd /path/to/open-maintainer
```

Install dependencies:

```sh
bun install --frozen-lockfile
```

## Fast Demo Smoke

Run the offline CLI smoke gate:

```sh
bun run smoke:mvp
```

Expected output looks like:

```text
MVP smoke passed: <before>/100 -> <after>/100
```

The smoke gate uses explicit deterministic mode to validate plumbing without network access. It is not the content-quality demo. For real files, run the LLM-backed manual demo below.

## Configure LLM CLI

Confirm Codex is available:

```sh
codex --version
```

Confirm Claude is available if you want to use Claude as the backend:

```sh
claude --version
```

Generation fails unless you pass `--allow-write`; that flag is the explicit consent that lets Open Maintainer send scanned repository content to the selected local LLM CLI and write generated artifacts.

Optionally choose a Codex model:

```sh
export OPEN_MAINTAINER_CODEX_MODEL="gpt-5.3-codex"
```

Optionally choose a Claude model:

```sh
export OPEN_MAINTAINER_CLAUDE_MODEL="claude-sonnet-4-6"
```

## Generation Flags

Generation uses three independent choices:

| Flag | Options | Meaning |
| --- | --- | --- |
| `--model` | `codex`, `claude` | Selects which LLM CLI generates artifact content. |
| `--context` | `codex`, `claude`, `both` | Writes `AGENTS.md`, `CLAUDE.md`, or both. |
| `--skills` | `codex`, `claude`, `both` | Writes skills under `.agents/skills`, `.claude/skills`, or both. |

Common combinations:

```sh
# Generate Codex context and skills with Codex CLI
bun run cli generate "$TARGET_REPO" --model codex --context codex --skills codex --allow-write

# Generate Claude Code context and skills with Claude CLI
bun run cli generate "$TARGET_REPO" --model claude --context claude --skills claude --allow-write

# Use Codex CLI to generate both context files and both skill families
bun run cli generate "$TARGET_REPO" --model codex --context both --skills both --allow-write
```

## Manual Demo

Choose the repository to audit and generate context for:

```sh
TARGET_REPO="/path/to/selected/repository"
```

Audit the selected repository before generation:

```sh
bun run cli audit "$TARGET_REPO"
```

Expected output includes:

```text
Agent Readiness: <score>/100
Profile: .open-maintainer/profile.json
Report: .open-maintainer/report.md
```

For scores below 100, output also includes concrete improvement guidance:

```text
Next steps:
- Add <missing file or command guidance>
```

Inspect the missing-context report:

```sh
sed -n '1,180p' "$TARGET_REPO/.open-maintainer/report.md"
```

Generate the full MVP Codex context artifact set with the LLM:

```sh
bun run cli generate "$TARGET_REPO" \
  --model codex \
  --context codex \
  --skills codex \
  --allow-write
```

List the generated files:

```sh
find "$TARGET_REPO" \
  -path "$TARGET_REPO/node_modules" -prune -o \
  -type f \
  | sed "s#^$TARGET_REPO/##" \
  | sort
```

Key generated files should include:

```text
AGENTS.md
.agents/skills/<repo>-start-task/SKILL.md
.agents/skills/<repo>-testing-workflow/SKILL.md
.agents/skills/<repo>-pr-review/SKILL.md
.open-maintainer/profile.json
.open-maintainer/report.md
.open-maintainer.yml
```

`--model` selects the LLM CLI backend. `--context` chooses instruction files, and `--skills` chooses repo-local skill directories.
Model-backed skill generation may add additional repo-specific workflow skills when repository evidence supports them.

To generate the Claude Code artifact family instead:

```sh
bun run cli generate "$TARGET_REPO" \
  --model claude \
  --context claude \
  --skills claude \
  --allow-write
```

Claude Code generated files should include:

```text
CLAUDE.md
.claude/skills/<repo>-start-task/SKILL.md
.claude/skills/<repo>-testing-workflow/SKILL.md
.claude/skills/<repo>-pr-review/SKILL.md
.open-maintainer/profile.json
.open-maintainer/report.md
.open-maintainer.yml
```

Run audit again to show the before/after improvement:

```sh
bun run cli audit "$TARGET_REPO"
```

Run doctor to verify required artifacts are present and not stale:

```sh
bun run cli doctor "$TARGET_REPO"
```

Expected output includes:

```text
all required artifacts are present
```

Show the dry-run PR summary:

```sh
bun run cli pr "$TARGET_REPO" --create
```

This CLI command prints the branch name and readiness score. A real remote PR is created through the GitHub App API flow when installation credentials are configured.

## Safety Behavior Demo

Generation preserves existing context files by default. Run generation a second time:

```sh
bun run cli generate "$TARGET_REPO" \
  --model codex \
  --context codex \
  --skills codex \
  --allow-write
```

Expected output includes `skip:` entries for files that already exist. Use `--force` only when you explicitly want generated files overwritten:

```sh
bun run cli generate "$TARGET_REPO" \
  --model codex \
  --context codex \
  --skills codex \
  --allow-write \
  --force
```

To override the Codex model for one run:

```sh
bun run cli generate "$TARGET_REPO" \
  --model codex \
  --context codex \
  --skills codex \
  --llm-model "gpt-5.3-codex" \
  --allow-write \
  --force
```

## Optional Dashboard Smoke

The dashboard path is secondary to the CLI demo. To verify the self-hosted stack:

```sh
docker compose up --build -d
bun run smoke:compose
docker compose down
```

When the stack is running, open:

```text
http://localhost:3000
```

The API listens on:

```text
http://localhost:4000
```

## Cleanup

If you created a disposable copy for the demo, remove that copy:

```sh
rm -rf /path/to/disposable-copy
```

If you started Docker Compose, stop it:

```sh
docker compose down
```
