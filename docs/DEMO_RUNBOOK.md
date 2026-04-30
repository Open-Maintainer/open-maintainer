# Open Maintainer Demo Runbook

This runbook shows the CLI-first MVP demo from a fresh checkout. The real artifact-generation demo uses an OpenAI-compatible model provider with explicit repo-content consent. It does not require GitHub OAuth, Postgres, Redis, or Docker, and it does not mutate the Open Maintainer source repository.

## Prerequisites

- Bun 1.1 or newer
- A local checkout of `ametel01/open-maintainer`
- An OpenAI-compatible provider for artifact generation, such as a local gateway, Ollama-compatible server, vLLM-compatible server, or hosted OpenAI-compatible endpoint

Start from the repository root:

```sh
cd /Users/alexmetelli/source/open-maintainer
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
MVP smoke passed: 53/100 -> 79/100
```

The smoke gate uses explicit deterministic mode to validate plumbing without network access. It is not the content-quality demo. For real files, run the LLM-backed manual demo below.

## Configure Provider

Set provider details in the shell that will run generation:

```sh
export OPEN_MAINTAINER_PROVIDER_BASE_URL="http://localhost:11434/v1"
export OPEN_MAINTAINER_MODEL="your-model"
export OPEN_MAINTAINER_API_KEY="dev"
```

Use the base URL, model, and key for your provider. Generation will fail unless you also pass `--allow-repo-content-provider`; that flag is the explicit consent that lets Open Maintainer send scanned repository content to the provider.

## Manual Demo

Create a disposable demo repository from the low-context fixture:

```sh
DEMO_REPO="$(mktemp -d)"
cp -R tests/fixtures/low-context-ts/. "$DEMO_REPO"
echo "$DEMO_REPO"
```

Audit the fixture before generation:

```sh
bun run cli audit "$DEMO_REPO"
```

Expected output includes:

```text
Agent Readiness: 53/100
Profile: .open-maintainer/profile.json
Report: .open-maintainer/report.md
```

Inspect the missing-context report:

```sh
sed -n '1,180p' "$DEMO_REPO/.open-maintainer/report.md"
```

Generate the full MVP context artifact set with the LLM:

```sh
bun run cli generate "$DEMO_REPO" \
  --llm \
  --allow-repo-content-provider \
  --targets agents,copilot,cursor,skills,profile,report,config
```

List the generated files:

```sh
find "$DEMO_REPO" \
  -path "$DEMO_REPO/node_modules" -prune -o \
  -type f \
  | sed "s#^$DEMO_REPO/##" \
  | sort
```

Key generated files should include:

```text
AGENTS.md
.github/copilot-instructions.md
.cursor/rules/open-maintainer.md
.skills/repo-overview/SKILL.md
.skills/testing-workflow/SKILL.md
.skills/pr-review/SKILL.md
.open-maintainer/profile.json
.open-maintainer/report.md
.open-maintainer.yml
```

Run audit again to show the before/after improvement:

```sh
bun run cli audit "$DEMO_REPO"
```

Run doctor to verify required artifacts are present and not stale:

```sh
bun run cli doctor "$DEMO_REPO"
```

Expected output includes:

```text
all required artifacts are present
```

Show the dry-run PR summary:

```sh
bun run cli pr "$DEMO_REPO" --create
```

This CLI command prints the branch name and readiness score. A real remote PR is created through the GitHub App API flow when installation credentials are configured.

## Safety Behavior Demo

Generation preserves existing context files by default. Run generation a second time:

```sh
bun run cli generate "$DEMO_REPO" \
  --llm \
  --allow-repo-content-provider \
  --targets agents,copilot,cursor,skills,profile,report,config
```

Expected output includes `skip:` entries for files that already exist. Use `--force` only when you explicitly want generated files overwritten:

```sh
bun run cli generate "$DEMO_REPO" \
  --llm \
  --allow-repo-content-provider \
  --targets agents,copilot,cursor,skills,profile,report,config \
  --force
```

## Horizon Starknet Demo

To run against the real Horizon repo:

```sh
HORIZON_REPO="/Users/alexmetelli/source/horizon-starknet"

bun run cli audit "$HORIZON_REPO"

bun run cli generate "$HORIZON_REPO" \
  --llm \
  --allow-repo-content-provider \
  --targets agents,copilot,cursor,skills,profile,report,config \
  --force

bun run cli doctor "$HORIZON_REPO"
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

Remove the disposable fixture repo:

```sh
rm -rf "$DEMO_REPO"
```

If you started Docker Compose, stop it:

```sh
docker compose down
```
