# Not Agent Ready Mock PR

This fixture intentionally touches CI wiring and asks for automation behavior
without an implementation plan.

Risk signals:

- The branch changes `.github/workflows/ci.yml`.
- The PR asks maintainers to reason about repository automation before handing
  the work to an agent.
- The PR should require explicit human review of the CI surface before any
  coding-agent handoff.

Validation:

- CI workflow syntax review is required.
- `bun lint`, `bun typecheck`, and `bun test` should remain required gates.
