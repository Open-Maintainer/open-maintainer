# Automated PR Routing

This note sketches a future routing policy for PR review output.

## Proposed Routing Inputs

- Contribution triage category.
- Changed surface.
- Failed or pending checks.
- Draft and mergeability state.
- Repository-owned labels.

## Routing Actions

- Leave a maintainer-visible summary.
- Apply a repository label.
- Escalate high-risk paths to a maintainer queue.

## Open Questions

- Whether repository-owned labels should override Open Maintainer defaults.
- Which actions can run from local CLI only.
- Which actions can run from a GitHub App installation.
- Whether auto-close behavior belongs in PR workflows at all.
