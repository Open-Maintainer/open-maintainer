# Ready For Review Mock PR

Purpose: provide a small documentation-only fixture for validating the
`ready_for_review` contribution triage path.

Acceptance criteria:

- The PR changes only this mock fixture document.
- The PR body states validation evidence.
- CI is expected to pass without source, workflow, dependency, lockfile, or
  generated-context changes.

Validation:

- `bun test tests/cli-help.test.ts tests/cli-review.test.ts`
