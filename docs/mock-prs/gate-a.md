# Mock Gate A

Purpose: add a small fixture document for exercising PR review against a
bounded documentation-only change.

Acceptance criteria:

- The fixture document is present.
- No source, workflow, dependency, lockfile, or generated-code behavior changes.

Validation:

- `bun test tests/cli-help.test.ts tests/cli-review.test.ts`
