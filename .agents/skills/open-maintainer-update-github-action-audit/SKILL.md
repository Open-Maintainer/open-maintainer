---
name: open-maintainer-update-github-action-audit
description: Use when changing the Open Maintainer composite GitHub Action, audit workflow, PR comment behavior, drift checks, or CI gates.
---

# Update GitHub Action Audit

## Use when
- Editing `action.yml`.
- Editing `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`, `.github/workflows/compose-smoke.yml`, `.github/workflows/dependency-review.yml`, or `.github/workflows/open-maintainer-audit.yml`.
- Changing action modes, readiness thresholds, report paths, drift checks, PR comments, refresh/review behavior, content-transfer consent, CI gates, CodeQL, Dependency Review, or Compose smoke CI behavior.

## Do not use when
- The change only affects local CLI implementation and action/workflow behavior is unchanged.
- The task asks for release publishing, tag creation, or deployment; Not detected in provided evidence.

## Read first
- `AGENTS.md`.
- `action.yml`.
- Changed workflow file under `.github/workflows`.
- `.github/workflows/ci.yml` for lint/typecheck/test/build/MVP smoke expectations.
- `.github/workflows/compose-smoke.yml` for Docker Compose smoke expectations.
- `.github/workflows/codeql.yml` and `.github/workflows/dependency-review.yml` for security gate context.
- CLI source under `apps/cli` when action invokes CLI behavior.
- `README.md` GitHub Action section and `CONTRIBUTING.md` when public CI behavior changes.

## Workflow
- Preserve supported `action.yml` mode validation unless intentionally changing it: `audit`, `refresh`, `review`.
- Preserve supported provider validation unless intentionally changing it: `codex`, `claude`.
- Preserve supported `context-target` and `skills-target` validation unless intentionally changing it: `codex`, `claude`, `both`.
- Preserve content-transfer consent gates for refresh and review modes unless intentionally changing them.
- Keep non-mutating audit behavior aligned with README evidence.
- Keep PR comment behavior opt-in and permission-aware.
- Keep Dependency Review severity behavior aligned with workflow evidence: high severity fails.
- Review shell syntax carefully; local action runner command is Not detected.

## Validation
- Lint workflow equivalent: `bun lint` or direct command `biome check .`.
- Typecheck workflow equivalent: `bun typecheck` or direct command `tsc -b`.
- Test workflow equivalent: `bun test` or direct command `vitest run`.
- Build workflow equivalent: `bun run build` or direct workspace build command from `package.json`.
- MVP smoke: `bun run smoke:mvp` or direct command `bun run tests/smoke/mvp-demo.ts`.
- Compose workflow changes after stack startup: `bun run smoke:compose` or direct command `bun run tests/smoke/compose-smoke.ts`.
- Local action runner command: Not detected; safest fallback is targeted tests plus shell review of `action.yml`.

## Documentation
- Update `README.md` for action inputs, permissions, report path, drift behavior, refresh/review behavior, or PR comment behavior.
- Update `CONTRIBUTING.md` when CI gates or validation process changes.
- Update `docs/MVP_RELEASE_REVIEW.md` when action acceptance evidence changes.

## Risk checks
- GitHub Action refresh/review content transfer is consent-gated and high risk.
- PR comments require appropriate permissions.
- CodeQL and Dependency Review are security-relevant workflows.
- Do not add secrets or credentials.
- Release publishing process, CODEOWNERS, and reviewer assignment policy: Not detected.

## Done when
- Action inputs, CLI invocations, workflow behavior, and docs agree.
- Workflow shell syntax was reviewed.
- CI-equivalent validation ran or skipped checks include reasons.
- Security gate changes are explicitly called out.