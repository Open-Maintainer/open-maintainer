# AGENTS.md

## Project overview

- Repository: Open-Maintainer/open-maintainer.
- Default branch: `main`.
- Primary language: TypeScript.
- Package manager and script runner: Bun.
- Purpose: audit repository agent readiness, generate repository-specific context artifacts, review PRs against approved context, and support GitHub Action/dashboard flows.
- Observed frameworks/libraries: Next, React, Fastify, Drizzle ORM, Vitest, TypeScript, Zod.
- Main operational surfaces: `apps/api`, `apps/cli`, `apps/web`, `apps/worker`, `packages/*`, `tests`, `.github/workflows`.
- AGENTS.md is the source of truth for AI coding-agent behavior in this repository.

## Agent workflow

- Start by reading the target file and at least one related caller, test, type definition, route, command, workflow, or config.
- Keep the change bounded to the requested behavior and the smallest relevant module set.
- Prefer existing workspace package boundaries over new abstractions.
- Use Bun commands; do not switch package managers.
- Make the edit, then run scoped validation for the changed surface.
- Broaden validation when touching shared packages, public behavior, generated artifacts, workflows, Docker Compose, auth, repository-content transfer, or model-provider flows.
- Report changed paths, commands run, commands skipped, and any remaining risk.
- Do not claim Docker/service checks passed unless those commands actually ran.
- Do not send repository content to a model provider unless the relevant consent flag or user instruction explicitly allows it.
- Preserve generated context artifacts by default; overwrite only when the task explicitly calls for regeneration or force behavior.

## Scope control

- Do not perform broad refactors unless explicitly requested.
- Do not apply unrelated formatting changes.
- Do not introduce dependency churn or lockfile churn unless the task is dependency-related.
- Do not change public API, CLI flags, GitHub Action inputs, dashboard behavior, generated artifact shape, or review behavior without matching tests and docs.
- Do not change Docker Compose services, ports, volumes, or environment wiring without smoke validation or a clear skipped-check note.
- Do not edit unrelated generated files.
- Do not commit directly to `main` from automated PR flows.

## Repository map

| Path | Role | Evidence |
| --- | --- | --- |
| `apps/api` | Fastify API surface; uses workspace packages for AI, analyzer, context, db, github, review, shared | `apps/api/package.json`, `apps/api/src/app.ts` |
| `apps/cli` | CLI surface for audit/generate/init/doctor/pr/review workflows, inferred from commands and skills | `apps/cli/package.json`, README, CLI skill |
| `apps/web` | Next/React dashboard surface for local repo selection, provider setup, redirects, action routes, API connectivity | `apps/web/package.json`, web skill |
| `apps/worker` | Worker app surface with Bun watch dev command and TypeScript build | `apps/worker/package.json` |
| `packages/ai` | Model provider configuration, consent checks, provider executable checks | `packages/ai/package.json`, API imports |
| `packages/analyzer` | Repository analysis and scanning | `packages/analyzer/package.json`, API imports |
| `packages/config` | Configuration package | `packages/config/package.json` |
| `packages/context` | Context artifact prompts, normalized repo facts, generated artifacts | `packages/context/package.json`, API imports |
| `packages/db` | Health checks and shared store/persistence access | `packages/db/package.json`, API imports |
| `packages/github` | GitHub App installs, webhooks, PR context fetching, repository files, context PRs | `packages/github/package.json`, API imports |
| `packages/review` | Local review input assembly and review generation | `packages/review/package.json`, API imports |
| `packages/shared` | Shared schemas, artifact types, ids, timestamps, review input helpers | `packages/shared/package.json`, API imports |
| `tests` | Root tests, CLI tests, MVP golden tests, smoke scripts | `tests/*.test.ts`, `tests/smoke/*.ts` |
| `tests/fixtures` | Fixture repos for readiness/context scenarios | `tests/fixtures/*` |
| `docs` | Demo, roadmap, release review docs | `docs/*.md` |
| `.github/workflows` | CI, CodeQL, Compose smoke, dependency review, Open Maintainer audit | workflow files |

## Architecture

- Observed: `apps/api/src/app.ts` registers CORS and form body plugins and exposes health, worker heartbeat, installations, repos, local repository, uploaded repository, and GitHub settings routes.
- Observed: `/health` checks database and Redis, reports API status, worker heartbeat presence, `workerHeartbeatAt`, and `checkedAt`.
- Observed: `/worker/heartbeat` updates `store.workerHeartbeatAt`.
- Observed: sensitive local repository routes are registered under a Fastify rate-limit plugin with max 10 requests per minute.
- Observed: uploaded repository files are schema-limited to max 800 files and max 128000 characters per file content.
- Observed: local repository scanning uses `scanRepository` with maxFiles 800 in the API excerpt.
- Observed: `action.yml` supports audit, refresh, and review modes; provider/model options; repository-content consent; context and skills targets; PR comment options; refresh branch/title; and force.
- Observed: `action.yml` rejects unsupported mode, provider, context-target, and skills-target values, and requires content-transfer consent for refresh/review modes.
- Inferred: apps consume reusable workspace packages for AI, analysis, context generation, database, GitHub integration, review, and shared schemas/types.
- Inferred: the CLI path is the primary demo and generated-context workflow surface; dashboard and GitHub App flows are secondary supported surfaces.
- Inferred: Docker Compose is used for local self-hosted stack validation because CI starts Compose, runs smoke checks, prints logs on failure, and tears down volumes/orphans.

## Setup

- Use Bun. Evidence: `bun.lock`, package commands, CI workflows.
- Fresh checkout prerequisite is observed in README.
- Git prerequisite is observed in README.
- Bun 1.1 or newer is listed for the CLI demo; CI uses Bun 1.3.13.
- Real model-backed generation/review flows require Codex CLI or Claude Code CLI installed and logged in.
- Environment examples: `.env.example`, `tests/fixtures/high-readiness-ts/.env.example`.
- Docker Compose smoke CI copies `.env.example` to `.env` before stack startup.
- Install command observed in README/CI: `bun install --frozen-lockfile`.

## Common commands

| Changed surface | Command | When to run | Evidence/source |
| --- | --- | --- | --- |
| Fresh checkout | `bun install --frozen-lockfile` | Before local validation when dependencies are absent | README, CI |
| Lint/format-sensitive changes | `biome check .` | Before finishing lint-sensitive changes | `package.json` |
| Formatting only when requested | `biome format --write .` | Only for intentional formatting changes | `package.json` |
| TypeScript contracts | `tsc -b` | Shared types, package contracts, cross-app changes | `package.json` |
| Root tests | `vitest run` | Behavior changes and regression coverage | `package.json` |
| Workspace build | `bun run --cwd packages/shared build && bun run --cwd packages/ai build && bun run --cwd packages/review build && bun run --cwd packages/db build && bun run --cwd packages/config build && bun run --cwd packages/github build && bun run --cwd packages/analyzer build && bun run --cwd packages/context build && bun run --cwd apps/cli build && bun run --cwd apps/api build && bun run --cwd apps/worker build && bun run --cwd apps/web build` | Build-affecting workspace changes | `package.json` |
| API build | `cd apps/api && tsc -p tsconfig.json` | API changes | `apps/api/package.json` |
| CLI build | `cd apps/cli && tsc -p tsconfig.json` | CLI changes | `apps/cli/package.json` |
| Web build | `cd apps/web && next build` | Web/dashboard changes | `apps/web/package.json` |
| Worker build | `cd apps/worker && tsc -p tsconfig.json` | Worker changes | `apps/worker/package.json` |
| API dev | `cd apps/api && bun --watch src/server.ts` | Local API development | `apps/api/package.json` |
| Web dev | `cd apps/web && next dev -H 0.0.0.0 -p ${WEB_PORT:-3000}` | Local dashboard development | `apps/web/package.json` |
| Worker dev | `cd apps/worker && bun --watch src/worker.ts` | Local worker development | `apps/worker/package.json` |
| MVP smoke | `bun run tests/smoke/mvp-demo.ts` | CLI MVP smoke path | `package.json`, README, CI |
| Compose smoke | `bun run tests/smoke/compose-smoke.ts` | After Docker Compose stack startup | `package.json`, compose workflow |
| Local health | `bun run tests/smoke/local-health.ts` | Local health diagnostics after stack startup | `package.json` |

- Canonical full gate exists when Docker/services are available: `bun lint && bun typecheck && bun test && bun run build && bun run smoke:mvp && docker compose up --build && bun run smoke:compose`.
- CI-equivalent no-Docker fallback inferred from workflows/skills: `bun lint && bun typecheck && bun test && bun run build && bun run smoke:mvp`.

## Coding conventions

- TypeScript is the primary language.
- Use Bun for dependency and script commands.
- Use Biome for lint/format checks.
- Use Vitest for tests.
- Preserve package boundaries under `apps/*` and `packages/*`.
- Prefer existing schemas/types in `packages/shared` and package-local types over ad hoc shapes.
- Use exact existing command names and flags from package manifests.
- Do not invent new package scripts or validation commands unless the task explicitly asks for tooling changes.
- Test files appear to use `.test.ts` naming.
- Smoke scripts are TypeScript files under `tests/smoke` run with `bun run`.

## Change rules

### Safe edit zones

- Source and test files under targeted `apps/*`, `packages/*`, and `tests/*` when the task targets that surface.
- Documentation files when behavior, setup, validation, smoke gates, CLI flags, action inputs, or workflows change.
- Fixture repository files under `tests/fixtures/*` when tests or fixture expectations require it.

### Careful edit zones

- `.agents/skills/**`, `.open-maintainer/**`, and `AGENTS.md`: generated/context artifacts; preserve unless intentionally regenerating or updating instructions.
- `bun.lock` and fixture lockfiles: avoid churn unless dependency work is requested.
- `.github/workflows/**` and `action.yml`: CI/security/action behavior; validate syntax and behavior carefully.
- `docker-compose.yml`, `.env.example`: service/environment wiring; run or document Docker/compose validation.
- `apps/api` GitHub/webhook/context PR/local scan/upload routes: auth, repository-content, write-path risk.
- `apps/web` local filesystem paths, uploaded repository files, provider forms, and API connectivity.

### Do-not-edit-without-explicit-instruction zones

- Do not edit `apps/web/next-env.d.ts` without explicit instruction.
- Do not add or commit secrets/credentials.
- Do not send repository content to model-backed generation without explicit consent such as `--allow-write`.
- Do not send repository content to model-backed PR review without explicit repository-content transfer consent.
- Do not add Docker Compose services or deployment flows without explicit instruction and evidence.
- Do not alter generated context overwrite semantics unless the task is specifically about force/regeneration behavior.

## Testing strategy

- API tests appear under `apps/api/tests`, including `apps/api/tests/api.test.ts`.
- Package tests appear under `packages/*/tests`, including AI, analyzer, config, context, github, review, and shared packages.
- Root tests cover action MVP, CLI audit/doctor/help/review, MVP golden, v0.2 readiness, and web redirect behavior.
- Smoke tests live under `tests/smoke`: `compose-smoke.ts`, `local-health.ts`, `mvp-demo.ts`.
- Fixture repos live under `tests/fixtures/high-readiness-ts`, `tests/fixtures/low-context-ts`, `tests/fixtures/missing-context-ts`, and `tests/fixtures/with-context`.
- Add or update regression tests for bug fixes and behavior changes where relevant.
- Run focused tests first; broaden to root and build checks when changes cross packages, app boundaries, public behavior, workflows, or generated artifacts.
- Fixture-specific commands:

| Fixture | Command | Evidence |
| --- | --- | --- |
| high-readiness | `cd tests/fixtures/high-readiness-ts && vitest run` | fixture package |
| high-readiness lint | `cd tests/fixtures/high-readiness-ts && biome check .` | fixture package |
| high-readiness build | `cd tests/fixtures/high-readiness-ts && tsc -b` | fixture package |
| low-context | `cd tests/fixtures/low-context-ts && vitest run` | fixture package |
| low-context lint | `cd tests/fixtures/low-context-ts && biome check .` | fixture package |
| low-context build | `cd tests/fixtures/low-context-ts && tsc -b` | fixture package |
| missing-context | `cd tests/fixtures/missing-context-ts && vitest run` | fixture package |
| missing-context lint | `cd tests/fixtures/missing-context-ts && biome check .` | fixture package |
| missing-context build | `cd tests/fixtures/missing-context-ts && tsc -b` | fixture package |
| with-context | `cd tests/fixtures/with-context && vitest run` | fixture package |

## Validation checklist

- Read target file and a related caller/test/type/config before editing.
- Confirm the changed surface and choose scoped commands from the table above.
- Run `biome check .` for lint-sensitive changes.
- Run `tsc -b` for shared TypeScript contracts or cross-package changes.
- Run `vitest run` for behavior changes.
- Run relevant app/package build command for build-affecting changes.
- Run `bun run tests/smoke/mvp-demo.ts` for CLI/generated artifact flow changes.
- Run Compose smoke when Docker Compose wiring, environment, API/web/worker integration, or self-hosted stack behavior changes.
- If Docker/services are unavailable, state that explicitly and include the strongest non-Docker checks run.
- Inspect diffs for unrelated formatting, dependency/lockfile churn, generated artifact churn, and secrets.

## PR rules

- Include test evidence: exact commands run and results.
- Include explicit skipped checks and reasons.
- Do not include unrelated formatting.
- Do not include secrets or credentials.
- Update docs for public behavior, setup, validation, CLI, action, dashboard, generated artifact, or smoke-flow changes.
- Add regression tests for behavior changes and bug fixes where practical.
- Call out risky areas touched: auth, GitHub App, webhooks, repository-content transfer, generated artifacts, Docker Compose, lockfiles, local filesystem scanning, uploaded repository handling.
- Keep generated artifact overwrites intentional and visible.
- Ground review notes in file paths, commands, and observed behavior.

## Known pitfalls

- Model-backed generation and review require explicit repository-content transfer consent.
- Offline deterministic MVP smoke validates plumbing, not generated content quality.
- Docker/service checks must not be reported as passed when Docker Compose did not run.
- Generated context files are preserved by default; overwrite only with explicit force/regeneration intent.
- README describes CLI review as non-mutating in v0.4 and not posting to GitHub; manual posting uses maintainer-controlled `gh` after inspection.
- Git-visible file scanning excludes ignored files by default when target is a Git worktree.
- Dependency Review workflow blocks high-severity vulnerable dependency additions.
- Public behavior changes without matching docs/tests are review risks.

## Generated files

- Generated/context artifact hints: `AGENTS.md`, `.agents/skills/<repo>-start-task/SKILL.md`, `.agents/skills/<repo>-testing-workflow/SKILL.md`, `.agents/skills/<repo>-pr-review/SKILL.md`, `.open-maintainer/profile.json`, `.open-maintainer/report.md`, `.open-maintainer.yml`.
- Existing generated context paths include `.agents/skills/open-maintainer-*`, `.open-maintainer.yml`, `.open-maintainer/profile.json`, `.open-maintainer/report.md`, and `AGENTS.md`.
- `.open-maintainer.yml` records generated metadata with `by=open-maintainer`, `artifactVersion=2`, and `generatedAt`.
- `apps/web/next-env.d.ts` is treated as generated.
- Lockfiles detected: `bun.lock`, `tests/fixtures/high-readiness-ts/bun.lock`, `tests/fixtures/low-context-ts/bun.lock`, `tests/fixtures/missing-context-ts/bun.lock`.
- If unsure whether a file is generated, avoid editing it until the source and expected regeneration path are identified.

## Security and high-risk areas

- Secrets and credentials: `.env.example` includes GitHub App credential variables, webhook secret, encryption key, database URL, Redis URL, and OpenAI-compatible provider settings.
- High-risk env vars include `GH_TOKEN`, `GITHUB_TOKEN`, `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY_BASE64`, `GITHUB_WEBHOOK_SECRET`, `DATABASE_URL`, `REDIS_URL`.
- Webhook signature verification, GitHub App credentials, and context PR writes are high-risk API/GitHub surfaces.
- Repository-content transfer to model providers is high risk and consent-gated.
- Local repository path scanning and uploaded repository file handling are sensitive; API evidence shows rate limits plus file count/size limits.
- Docker Compose service wiring and environment values are high risk because smoke CI depends on `.env.example`, stack startup, smoke validation, failure logs, and cleanup.
- CI security gates include CodeQL for javascript-typescript and Dependency Review failing on high severity.
- Dependency and lockfile changes are high-risk churn areas.

## Documentation alignment

| Change type | Docs to check/update | Evidence/source |
| --- | --- | --- |
| CLI demo, generated outputs, model choices, consent flags, quality gates | `README.md`, `docs/DEMO_RUNBOOK.md` | README, CLI skill |
| GitHub Action inputs, audit behavior, refresh/review behavior | `README.md`, `CONTRIBUTING.md`, `docs/MVP_RELEASE_REVIEW.md` | action workflow/skill |
| Dashboard, Docker Compose, GitHub App, webhook, context PR behavior | `docs/MVP_RELEASE_REVIEW.md`, `README.md` | API/web/compose skills |
| Validation, safety process, PR workflow, setup, CI gates | `CONTRIBUTING.md` | validation/start-task skills |
| Product or roadmap behavior | `docs/ROADMAP.md`, `local-docs/PRODUCT_PRD.md` | repo docs list |
| Release review evidence | `docs/V0_3_RELEASE_REVIEW.md`, `docs/V0_4_RELEASE_REVIEW.md`, `docs/MVP_RELEASE_REVIEW.md` | repo docs list |

## Unknowns and missing evidence

- Full source for package internals beyond API excerpts is not provided; do not assume behavior beyond imports, manifests, tests, and generated skill descriptions.
- Exact `docker-compose.yml` service definitions are not included in selected excerpts.
- Release publishing, versioning, tag, and changelog process: Not detected.
- Ownership hints and CODEOWNERS: Not detected.
- Runtime production environment, hosting provider, and deployment process: Not detected.
- Full package manifest dependency/script contents are not shown beyond normalized command entries.
- Database schema, migrations, and persistence strategy: Not detected.
- Coverage thresholds and browser e2e requirements: Not detected.
- Detailed web UI implementation and worker implementation are not detected from selected evidence.
- Safest fallback for missing evidence: read the relevant local files first, keep changes scoped, run the closest package/app validation, and report unknowns explicitly.