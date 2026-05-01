# AGENTS.md

## Project overview
- Repository: `open-maintainer`.
- Default branch: `open-maintainer/mvp-issues-11-23`.
- Primary language: TypeScript.
- Package manager: Bun. Use Bun for dependency and script commands.
- Product: audits repository agent readiness, generates repo-specific context artifacts, and supports a CLI-first MVP plus secondary dashboard/GitHub App flow.
- Main stack detected: Next, React, Fastify, Drizzle ORM, Vitest, TypeScript, Zod, Biome.
- Before editing: read the target file and at least one related caller, test, type definition, or user-facing doc.
- Keep changes bounded to the requested app/package surface.
- Do not do broad refactors, unrelated formatting, dependency churn, lockfile churn, or generated-file churn.
- Public API or behavior changes require matching tests and documentation updates.
- Do not send repository content to model-backed generation without explicit consent such as `--allow-write`.
- Canonical documented full gate when services are available: `bun lint && bun typecheck && bun test && bun run build && bun run smoke:mvp && docker compose up --build && bun run smoke:compose`.
- If Docker/services are unavailable, run the relevant scoped commands and report skipped checks with reasons.

## Agent workflow
1. Confirm scope from the user request and identify touched app/package paths.
2. Read the target file before editing.
3. Read at least one related caller, test, type definition, route, package manifest, or relevant doc.
4. Check nearby conventions before adding abstractions or new patterns.
5. Make the smallest bounded change that addresses the request.
6. Add or update regression tests for behavior, generated output, API contracts, consent gates, webhook handling, or context PR behavior.
7. Update docs for user-facing CLI flags, generated outputs, setup, dashboard behavior, GitHub Action behavior, Docker Compose wiring, or smoke gates.
8. Run scoped validation first; run broader gates when the change crosses packages, apps, or public behavior.
9. Report validation evidence, skipped checks, risky areas touched, and any docs/tests changed.

## Scope control
- Stay inside the app/package boundary implied by the request unless a related contract requires a second surface.
- Do not reformat unrelated files.
- Do not update dependencies or lockfiles unless the task explicitly requires it.
- Do not edit generated files unless the task is specifically about generated output.
- Do not change public CLI behavior, API routes, generated artifact format, webhook behavior, consent gates, or context PR behavior without tests and docs.
- Do not introduce new services, deployment flows, package managers, owners, audit requirements, or release steps not present in evidence.
- Treat cautious inferences as assumptions in PR notes.

## Repository map
| Path | Role | Evidence |
| --- | --- | --- |
| `apps/api` | Fastify API for health, repository registration, analysis, model-provider setup, and GitHub flows. | `apps/api/package.json`, `apps/api/src/app.ts`, `apps/api/src/server.ts` |
| `apps/cli` | Bun CLI for `audit`, `generate`, `init`, `doctor`, and `pr`. | `apps/cli/package.json`, `apps/cli/src/index.ts`, `README.md` |
| `apps/web` | Next/React dashboard for health, repositories, providers, artifacts, and action forms. | `apps/web/package.json`, `apps/web/app/page.tsx` |
| `apps/worker` | Worker that periodically posts heartbeat events to API. | `apps/worker/src/worker.ts` |
| `packages/ai` | Model provider construction and provider checks. | `packages/ai/package.json`, API/CLI imports |
| `packages/analyzer` | Repository scanning and analysis. | `packages/analyzer/package.json`, API/CLI imports |
| `packages/config` | Workspace config package referenced by TypeScript projects. | `packages/config/package.json`, `apps/cli/tsconfig.json` |
| `packages/context` | Context artifact creation, parsing, planning, rendering, and readiness output. | `packages/context/package.json`, API/CLI imports |
| `packages/db` | Store access and database/Redis health checks for API. | `packages/db/package.json`, `apps/api/src/app.ts` |
| `packages/github` | GitHub App auth, webhook verification, file fetching, branch naming, PR creation, PR body rendering. | `packages/github/package.json`, `apps/api/src/app.ts` |
| `packages/shared` | Shared types and utilities consumed by API and web. | `packages/shared/package.json`, API/web imports |
| `tests` | Repository-level tests, smoke scripts, and fixtures. | `tests/fixtures/*/package.json`, root commands |
| `docs` | Demo, release, and MVP documentation. | `docs/DEMO_RUNBOOK.md`, `docs/MVP_RELEASE_REVIEW.md` |
| `.github/workflows` | CI, CodeQL, Compose smoke, dependency review, and Open Maintainer audit workflows. | workflow files |

## Architecture
- Observed: `apps/api/src/server.ts` listens on `API_PORT` or `4000` and binds to `0.0.0.0`.
- Observed: API registers CORS and form-body plugins and rate limits selected local repository routes.
- Observed: API health checks include database, Redis, API status, worker heartbeat state, and timestamp.
- Observed: `apps/worker/src/worker.ts` posts `/worker/heartbeat` to `API_BASE_URL` or `http://localhost:4000` every 15 seconds.
- Observed: web server-side routes use `API_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL`, or `http://localhost:4000`.
- Observed: `apps/web/app/LocalRepoPicker.tsx` limits selected files to 800 files and 128000 bytes per file, filters ignored directories, and reads selected text-like files.
- Observed: Docker Compose defines `postgres`, `redis`, `api`, `worker`, and `web` services.
- Inferred: apps depend on workspace packages through TypeScript project references.
- Inferred: API coordinates web/dashboard actions, repository analysis, model-provider generation, store access, and GitHub operations.
- Inferred: web dashboard mutation routes delegate work to API endpoints.
- Not detected: full package-internal data flow. Read package source before changing cross-package behavior.

## Setup
- Install dependencies: `bun install --frozen-lockfile`.
- Bun 1.1 or newer is documented for CLI demo and dashboard paths.
- Docker Compose is documented for the self-hosted dashboard stack.
- Local dashboard URLs documented in `README.md`: web `http://localhost:3000`, API `http://localhost:4000`.
- Self-hosted stack setup uses `.env` from `.env.example`, then `docker compose up --build`.
- GitHub App testing requires app id, client id, client secret, private key, webhook secret, and a real installation.
- Model-backed CLI generation requires Codex CLI or Claude CLI installed and logged in, depending on selected backend.

## Common commands
| Changed surface | Command | When to run | Evidence/source |
| --- | --- | --- | --- |
| Dependencies | `bun install --frozen-lockfile` | Fresh checkout or dependency sync. | `README.md`, `CONTRIBUTING.md`, `.github/workflows/ci.yml` |
| Lint/format check | `biome check .` | Changes affecting linted source. | `package.json` |
| Typecheck | `tsc -b` | TypeScript changes across apps/packages. | `package.json` |
| Tests | `vitest run` | Unit/integration behavior changes. | `package.json` |
| Full build | `bun run --cwd packages/shared build && bun run --cwd packages/db build && bun run --cwd packages/config build && bun run --cwd packages/github build && bun run --cwd packages/analyzer build && bun run --cwd packages/ai build && bun run --cwd packages/context build && bun run --cwd apps/cli build && bun run --cwd apps/api build && bun run --cwd apps/worker build && bun run --cwd apps/web build` | Broad app/package build validation. | `package.json` |
| Documented full gate | `bun lint && bun typecheck && bun test && bun run build && bun run smoke:mvp && docker compose up --build && bun run smoke:compose` | Before opening or merging implementation work when services are available. | `README.md` |
| MVP smoke | `bun run tests/smoke/mvp-demo.ts` | CLI-first MVP demo path changes. | `package.json`, `CONTRIBUTING.md` |
| Local health | `bun run tests/smoke/local-health.ts` | After local stack startup. | `package.json` |
| Compose smoke | `bun run tests/smoke/compose-smoke.ts` | Docker Compose wiring changes. | `package.json` |
| API dev | `bun run --cwd apps/api dev` | API local development. | `apps/api/package.json` |
| API build | `bun run --cwd apps/api build` | API changes. | `apps/api/package.json` |
| CLI build | `bun run --cwd apps/cli build` | CLI changes. | `apps/cli/package.json` |
| Web dev | `bun run --cwd apps/web dev` | Web local development. | `apps/web/package.json` |
| Web build | `bun run --cwd apps/web build` | Web changes. | `apps/web/package.json` |
| Worker dev | `bun run --cwd apps/worker dev` | Worker local development. | `apps/worker/package.json` |
| Worker build | `bun run --cwd apps/worker build` | Worker changes. | `apps/worker/package.json` |
| Package build | `bun run --cwd packages/<name> build` | Package-local implementation changes. | package manifests |
| Fixture low-context test | `bun run --cwd tests/fixtures/low-context-ts test` | Fixture behavior changes. | fixture package manifest |
| Fixture low-context build | `bun run --cwd tests/fixtures/low-context-ts build` | Fixture build changes. | fixture package manifest |
| Fixture low-context lint | `bun run --cwd tests/fixtures/low-context-ts lint` | Fixture lint changes. | fixture package manifest |
| Fixture with-context test | `bun run --cwd tests/fixtures/with-context test` | Fixture behavior changes. | fixture package manifest |

## Coding conventions
- TypeScript source uses double quotes and semicolons per `biome.json`.
- Biome formatter uses two-space indentation.
- Workspace package names use the `@open-maintainer/*` scope.
- Web routes follow apparent Next App Router conventions under `apps/web/app`.
- Prefer existing package boundaries and imports over new cross-package coupling.
- Use Zod/Fastify/Drizzle patterns already present when changing validation, API, or database-adjacent code.
- Not detected: coverage thresholds. Use existing test patterns near the changed code.

## Change rules
### Safe edit zones
- App/package TypeScript source files in the touched surface when paired with relevant checks.
- Tests near the changed behavior.
- Documentation that directly matches a user-facing behavior or setup change.

### Careful edit zones
- CLI commands, flags, generated output, consent gates, and model-provider flow.
- API routes, local repository upload/scanning, health checks, rate limits, and CORS/form-body setup.
- GitHub App auth, webhook verification, file fetching, branch naming, PR creation, and PR body rendering.
- Docker Compose service wiring and environment values.
- Smoke scripts and CI workflow behavior.
- Lockfiles: `bun.lock` and fixture lockfiles.

### Do-not-edit-without-explicit-instruction zones
- `apps/web/next-env.d.ts`, generated by Next.js.
- Build outputs under `dist`.
- Next output under `.next`.
- Dependency versions and lockfiles unless dependency work is requested.
- Generated context artifacts unless the task is specifically about generation behavior.

## Testing strategy
- Tests appear under `apps/api/tests`, `tests/smoke`, and `tests/fixtures/*`.
- Root test command from `package.json`: `vitest run`.
- README quality gate aliases observed: `bun lint`, `bun typecheck`, `bun test`, `bun run build`, `bun run smoke:mvp`, `bun run smoke:compose`.
- Add/update regression tests for behavior, generated output, API contracts, consent gates, webhook handling, or context PR behavior changes.
- Fixture commands exist for `tests/fixtures/low-context-ts` and `tests/fixtures/with-context`; use them when fixture behavior changes.
- Observed test naming examples: `apps/api/tests/api.test.ts`; release docs reference webhook tests, AI provider tests, and context render tests.
- Not detected: exact coverage policy. Fallback: run targeted tests plus root `vitest run` for behavior changes.

## Validation checklist
- Target file read before editing.
- Related caller, test, type definition, route, package manifest, or doc read before editing.
- Change stays inside requested scope.
- No unrelated formatting.
- No dependency or lockfile churn unless requested.
- Tests added or updated when behavior/contracts/generated output changed.
- Docs updated when CLI/setup/dashboard/GitHub Action/Docker Compose/smoke behavior changed.
- Scoped build/test/lint/typecheck commands run for touched surface.
- Broader documented gate considered for cross-app/package changes.
- Skipped checks documented with reason.
- Risky areas called out in PR notes.

## PR rules
- Include a concise summary of what changed and why.
- Include test evidence with exact commands run.
- Explicitly list skipped validation and why.
- State if high-risk areas were touched: GitHub App credentials, webhook verification, repository-content transfer, context PR writes, Docker Compose wiring, lockfiles, local repository upload/scanning.
- Confirm no unrelated formatting.
- Confirm no secrets or credentials were added.
- Include documentation updates for public behavior changes.
- Mention cautious inferences as assumptions, not facts.

## Known pitfalls
- Model-backed generation fails without explicit consent such as `--allow-write`.
- Offline deterministic MVP smoke validates plumbing but is not the content-quality demo.
- Existing context files are preserved by default; repeated generation emits skip entries for files that already exist.
- Web/API connectivity depends on `API_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL`, or fallback `http://localhost:4000`.
- `apps/web/next-env.d.ts` is generated by Next.js and should not be edited.
- Dependency review blocks pull requests introducing high-severity vulnerable dependencies.

## Generated files
- `audit` writes `.open-maintainer/profile.json` and `.open-maintainer/report.md` during normal CLI flow.
- `generate` can write context instruction files, repo-local skill files, profile, report, and `.open-maintainer.yml` when files are absent.
- `apps/web/next-env.d.ts` is generated by Next.js.
- TypeScript build outputs are configured under `dist` for API, CLI, worker, and packages.
- Next build output `.next` is ignored by Biome.
- Generated status for other files is not confirmed; treat unknown generated-looking files cautiously.

## Security and high-risk areas
- GitHub App credentials and webhook verification.
- Repository-content transfer to model providers; explicit consent is required.
- Context PR writes and branch/PR body generation.
- Docker Compose service wiring and environment values.
- Lockfiles.
- Local filesystem repository paths and uploaded repository files.
- Webhook signature verification, CodeQL, and dependency review workflows.
- Never add secrets or credentials to the repository.

## Documentation alignment
| Change type | Docs to update | Evidence/source |
| --- | --- | --- |
| CLI flags, demo flow, generated outputs | `README.md`, `docs/DEMO_RUNBOOK.md` | `README.md`, `docs/DEMO_RUNBOOK.md`, `CONTRIBUTING.md` |
| Setup, install, quality gates | `README.md`, `CONTRIBUTING.md` | `README.md`, `CONTRIBUTING.md` |
| Dashboard behavior or GitHub App setup | `README.md` | `README.md` |
| Docker Compose wiring or smoke gates | `README.md`, `CONTRIBUTING.md`, `docs/MVP_RELEASE_REVIEW.md` | documented docs and workflows |
| MVP scope or release evidence | `docs/MVP_RELEASE_REVIEW.md` | release review doc |
| Product/tech assumptions | `local-docs/PRODUCT_PRD.md`, `local-docs/TECH_STACK.md` | local docs list |

## Unknowns and missing evidence
- Not detected: deployment or release publishing process.
- Not detected: CODEOWNERS, ownership policy, or reviewer assignment policy.
- Not detected: explicit audit/compliance requirements beyond CodeQL, dependency review, and Open Maintainer audit workflows.
- Not detected: full package implementation details from selected excerpts.
- Not detected: production environment configuration beyond local Docker Compose and documented GitHub App values.
- Not detected: queue usage in source excerpts, even though BullMQ appears in lockfile evidence.
- Not detected: full database schema and migration strategy.
- Fallback: read local source, config, tests, and docs before changing any area with missing evidence.