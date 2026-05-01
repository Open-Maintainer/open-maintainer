---
name: open-maintainer-pr-review
description: Use when reviewing or preparing an Open Maintainer pull request for correctness, validation evidence, docs, and high-risk changes.
---
# PR Review

## Use when
- Reviewing a diff or preparing PR notes for Open Maintainer.
- Checking whether tests, docs, and validation match the changed behavior.
- Looking for high-risk regressions in CLI, API, dashboard, GitHub App, context PR, Docker Compose, or generated artifact flows.

## Do not use when
- The user asks for implementation only and no review or PR summary is needed.
- The change is outside the provided repository evidence; ask for more context instead of guessing.

## Read first
- `AGENTS.md` PR rules and risk areas.
- `CONTRIBUTING.md` Pull Request Workflow and Safety Notes.
- `README.md` sections matching changed public behavior.
- Relevant tests near the changed surface.
- Relevant workflows in `.github/workflows/` when CI behavior or validation gates changed.
- `action.yml` when GitHub Action audit behavior changed.

## Workflow
- Lead with bugs, behavioral regressions, missing tests, missing docs, or unsafe changes.
- Verify the target file and at least one related caller, test, type definition, route, package manifest, or doc were considered.
- Check that the change is bounded to the requested app/package surface.
- Check public API or behavior changes have matching tests and docs.
- Check PR notes include exact validation commands and skipped checks.
- Check PR notes state whether high-risk areas were touched.
- Treat cautious inferences as assumptions, not facts.

## Validation
- Review-only task: Not detected; safest fallback is to inspect diff, related files, and available test evidence.
- If preparing PR validation, route commands through `open-maintainer-validation-testing`.
- Public behavior or cross-surface change full gate when services are available: `bun lint && bun typecheck && bun test && bun run build && bun run smoke:mvp && docker compose up --build && bun run smoke:compose`.

## Documentation
- Require docs for CLI flags, generated outputs, setup, dashboard behavior, GitHub Action behavior, Docker Compose wiring, or smoke gate changes.
- Candidate docs: `README.md`, `CONTRIBUTING.md`, `docs/DEMO_RUNBOOK.md`, `docs/MVP_RELEASE_REVIEW.md`, `local-docs/PRODUCT_PRD.md`, `local-docs/TECH_STACK.md`.

## Risk checks
- Explicitly flag changes touching GitHub App credentials, webhook verification, repository-content transfer, context PR writes, Docker Compose wiring, lockfiles, local repository upload/scanning, or generated context artifacts.
- Confirm no secrets or credentials were added.
- Confirm no unrelated formatting, dependency churn, lockfile churn, or generated-file churn occurred unless requested.
- Not detected: CODEOWNERS, reviewer assignment policy, release publishing process.

## Done when
- Findings are ordered by severity with exact file references when available.
- Missing tests/docs/validation are called out.
- PR summary states what changed and why.
- Validation evidence and skipped checks are explicit.
- High-risk areas and assumptions are named.