# Open Maintainer Report: local/open-maintainer

Agent Readiness: 73/100

## Category Scores

### setup clarity: 20/20

- No missing items detected.
- Evidence: apps/api/package.json (package manifest)
- Evidence: apps/cli/package.json (package manifest)
- Evidence: apps/web/package.json (package manifest)
- Evidence: apps/worker/package.json (package manifest)
- Evidence: package.json (package manifest)
- Evidence: packages/ai/package.json (package manifest)
- Evidence: packages/analyzer/package.json (package manifest)
- Evidence: packages/config/package.json (package manifest)
- Evidence: packages/context/package.json (package manifest)
- Evidence: packages/db/package.json (package manifest)
- Evidence: packages/github/package.json (package manifest)
- Evidence: packages/shared/package.json (package manifest)
- Evidence: tests/fixtures/low-context-ts/package.json (package manifest)
- Evidence: tests/fixtures/with-context/package.json (package manifest)
- Evidence: bun.lock (detected repository context)
- Evidence: tests/fixtures/low-context-ts/bun.lock (detected repository context)
- Evidence: CONTRIBUTING.md (detected repository context)
- Evidence: docs/DEMO_RUNBOOK.md (detected repository context)
- Evidence: docs/MVP_RELEASE_REVIEW.md (detected repository context)
- Evidence: local-docs/MVP_IMPLEMENTATION_PLAN.md (detected repository context)
- Evidence: local-docs/PRODUCT_PRD.md (detected repository context)
- Evidence: local-docs/SKILLS_GENERATION.md (detected repository context)
- Evidence: local-docs/TECH_STACK.md (detected repository context)
- Evidence: README.md (detected repository context)

### architecture clarity: 20/20

- No missing items detected.
- Evidence: apps/api/package.json (package manifest)
- Evidence: apps/cli/package.json (package manifest)
- Evidence: apps/web/package.json (package manifest)
- Evidence: apps/worker/package.json (package manifest)
- Evidence: packages/ai/package.json (package manifest)
- Evidence: packages/analyzer/package.json (package manifest)
- Evidence: packages/config/package.json (package manifest)
- Evidence: packages/context/package.json (package manifest)
- Evidence: packages/db/package.json (package manifest)
- Evidence: packages/github/package.json (package manifest)
- Evidence: packages/shared/package.json (package manifest)
- Evidence: tests/fixtures/low-context-ts/package.json (package manifest)
- Evidence: tests/fixtures/with-context/package.json (package manifest)
- Evidence: tests/fixtures/low-context-ts/bun.lock (detected repository context)
- Evidence: CONTRIBUTING.md (detected repository context)
- Evidence: docs/DEMO_RUNBOOK.md (detected repository context)
- Evidence: docs/MVP_RELEASE_REVIEW.md (detected repository context)
- Evidence: local-docs/MVP_IMPLEMENTATION_PLAN.md (detected repository context)
- Evidence: local-docs/PRODUCT_PRD.md (detected repository context)
- Evidence: local-docs/SKILLS_GENERATION.md (detected repository context)
- Evidence: local-docs/TECH_STACK.md (detected repository context)
- Evidence: README.md (detected repository context)
- Evidence: apps/api/tsconfig.json (detected repository context)
- Evidence: apps/cli/tsconfig.json (detected repository context)
- Evidence: apps/web/tsconfig.json (detected repository context)
- Evidence: apps/worker/tsconfig.json (detected repository context)
- Evidence: biome.json (detected repository context)
- Evidence: docker-compose.yml (detected repository context)
- Evidence: packages/ai/tsconfig.json (detected repository context)
- Evidence: packages/analyzer/tsconfig.json (detected repository context)
- Evidence: packages/config/tsconfig.json (detected repository context)
- Evidence: packages/context/tsconfig.json (detected repository context)
- Evidence: packages/db/tsconfig.json (detected repository context)
- Evidence: packages/github/tsconfig.json (detected repository context)
- Evidence: packages/shared/tsconfig.json (detected repository context)
- Evidence: tests/fixtures/low-context-ts/tsconfig.json (detected repository context)
- Evidence: tsconfig.base.json (detected repository context)
- Evidence: tsconfig.json (detected repository context)

### testing and CI: 20/20

- No missing items detected.
- Evidence: apps/api/package.json (package manifest)
- Evidence: apps/cli/package.json (package manifest)
- Evidence: apps/web/package.json (package manifest)
- Evidence: apps/worker/package.json (package manifest)
- Evidence: package.json (package manifest)
- Evidence: packages/ai/package.json (package manifest)
- Evidence: packages/analyzer/package.json (package manifest)
- Evidence: packages/config/package.json (package manifest)
- Evidence: packages/context/package.json (package manifest)
- Evidence: packages/db/package.json (package manifest)
- Evidence: packages/github/package.json (package manifest)
- Evidence: packages/shared/package.json (package manifest)
- Evidence: tests/fixtures/low-context-ts/package.json (package manifest)
- Evidence: tests/fixtures/with-context/package.json (package manifest)
- Evidence: .github/workflows/ci.yml (detected repository context)
- Evidence: .github/workflows/codeql.yml (detected repository context)
- Evidence: .github/workflows/compose-smoke.yml (detected repository context)
- Evidence: .github/workflows/dependency-review.yml (detected repository context)
- Evidence: .github/workflows/open-maintainer-audit.yml (detected repository context)

### agent instructions: 0/20

- Missing: AGENTS.md or CLAUDE.md is missing.
- Missing: Repo-local skills are missing.

### safety and review rules: 13/20

- Missing: .open-maintainer.yml policy file is missing.
- Evidence: CONTRIBUTING.md (detected repository context)
- Evidence: docs/DEMO_RUNBOOK.md (detected repository context)
- Evidence: docs/MVP_RELEASE_REVIEW.md (detected repository context)
- Evidence: local-docs/MVP_IMPLEMENTATION_PLAN.md (detected repository context)
- Evidence: local-docs/PRODUCT_PRD.md (detected repository context)
- Evidence: local-docs/SKILLS_GENERATION.md (detected repository context)
- Evidence: local-docs/TECH_STACK.md (detected repository context)
- Evidence: README.md (detected repository context)

## Commands

- dev: bun run --cwd apps/api dev (apps/api/package.json)
- build: bun run --cwd apps/api build (apps/api/package.json)
- build: bun run --cwd apps/cli build (apps/cli/package.json)
- dev: bun run --cwd apps/web dev (apps/web/package.json)
- build: bun run --cwd apps/web build (apps/web/package.json)
- dev: bun run --cwd apps/worker dev (apps/worker/package.json)
- build: bun run --cwd apps/worker build (apps/worker/package.json)
- lint: biome check . (package.json)
- typecheck: tsc -b (package.json)
- test: vitest run (package.json)
- build: bun run --cwd packages/shared build && bun run --cwd packages/db build && bun run --cwd packages/config build && bun run --cwd packages/github build && bun run --cwd packages/analyzer build && bun run --cwd packages/ai build && bun run --cwd packages/context build && bun run --cwd apps/cli build && bun run --cwd apps/api build && bun run --cwd apps/worker build && bun run --cwd apps/web build (package.json)
- diagnostics: bun run tests/smoke/local-health.ts (package.json)
- smoke:compose: bun run tests/smoke/compose-smoke.ts (package.json)
- smoke:mvp: bun run tests/smoke/mvp-demo.ts (package.json)
- build: bun run --cwd packages/ai build (packages/ai/package.json)
- build: bun run --cwd packages/analyzer build (packages/analyzer/package.json)
- build: bun run --cwd packages/config build (packages/config/package.json)
- build: bun run --cwd packages/context build (packages/context/package.json)
- build: bun run --cwd packages/db build (packages/db/package.json)
- build: bun run --cwd packages/github build (packages/github/package.json)
- build: bun run --cwd packages/shared build (packages/shared/package.json)
- dev: bun run --cwd tests/fixtures/low-context-ts dev (tests/fixtures/low-context-ts/package.json)
- test: bun run --cwd tests/fixtures/low-context-ts test (tests/fixtures/low-context-ts/package.json)
- build: bun run --cwd tests/fixtures/low-context-ts build (tests/fixtures/low-context-ts/package.json)
- lint: bun run --cwd tests/fixtures/low-context-ts lint (tests/fixtures/low-context-ts/package.json)
- test: bun run --cwd tests/fixtures/with-context test (tests/fixtures/with-context/package.json)

## Architecture

- apps/api
- apps/cli
- apps/web
- apps/worker
- docs
- packages/ai
- packages/analyzer
- packages/config
- packages/context
- packages/db
- packages/github
- packages/shared
- tests

## Risk Hints

- No repo-local agent context files detected.