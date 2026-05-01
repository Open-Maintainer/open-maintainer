---
name: open-maintainer-update-github-action-audit
description: Use when changing the Open Maintainer composite GitHub Action, audit workflow, PR comment behavior, drift checks, or CI gates.
---
# Update GitHub Action Audit

## Use when
- Editing `action.yml`.
- Editing `.github/workflows/open-maintainer-audit.yml`, `.github/workflows/ci.yml`, `.github/workflows/compose-smoke.yml`, `.github/workflows/codeql.yml`, or `.github/workflows/dependency-review.yml`.
- Changing audit mode, readiness thresholds, report paths, drift checks, PR comments, CI gates, CodeQL, dependency review, or compose smoke CI behavior.

## Do not use when
- The change only affects local CLI implementation without action/workflow behavior changes.
- The task asks for release publishing; release publishing process is Not detected.

## Read first
- `AGENTS.md` GitHub Action and CI rules.
- `action.yml` for composite action behavior.
- `.github/workflows/open-maintainer-audit.yml`.
- `.github/workflows/ci.yml`.
- `.github/workflows/compose-smoke.yml`.
- `.github/workflows/codeql.yml` and `.github/workflows/dependency-review.yml` for security gate context.
- `apps/cli/src/index.ts` when action behavior invokes CLI commands.
- `README.md` GitHub Action Audit Mode section.
- `CONTRIBUTING.md` CI and quality gate notes.

## Workflow
- Keep MVP action mode aligned with documented `mode: audit`; unsupported modes are rejected in `action.yml`.
- Preserve non-mutating PR audit behavior unless intentionally changed: action audit uses `--no-profile-write` by default in selected evidence.
- Keep drift diagnostics routed through `cli doctor`.
- Keep PR comment behavior gated by `comment-on-pr` and pull request event context.
- Keep dependency review severity behavior aligned with workflow evidence: high severity blocks PRs.
- Update CLI tests/docs when action inputs or CLI invocation behavior changes.

## Validation
- Root CI-equivalent checks: `bun lint`, `bun typecheck`, `bun test`, `bun run build`, `bun run smoke:mvp`.
- Direct command equivalents from manifests: `biome check .`, `tsc -b`, `vitest run`, `bun run tests/smoke/mvp-demo.ts`.
- Compose workflow changes: `docker compose up --build` then `bun run smoke:compose` or `bun run tests/smoke/compose-smoke.ts`.
- Action-specific local runner command: Not detected; safest fallback is targeted tests plus root CI-equivalent checks and careful review of `action.yml` shell syntax.

## Documentation
- Update `README.md` GitHub Action Audit Mode for input, permission, report, drift, or PR comment changes.
- Update `CONTRIBUTING.md` when CI gates change.
- Update `docs/MVP_RELEASE_REVIEW.md` when action acceptance evidence changes.

## Risk checks
- GitHub Action audit should not mutate checked-out context files unless the user chooses a repository `report-path`; preserve this unless intentionally changed.
- PR comments require appropriate permissions documented in README.
- CodeQL and dependency review are security-relevant workflows.
- Not detected: release publishing process, CODEOWNERS, reviewer assignment policy.

## Done when
- Action inputs, CLI invocations, and docs agree.
- Workflow syntax and shell behavior were reviewed.
- CI-equivalent validation ran or skipped checks include reasons.
- Security gate changes are explicitly called out.