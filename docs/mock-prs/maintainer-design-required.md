# Maintainer Design Required Mock PR

This fixture proposes a product-policy decision rather than a bounded
implementation task.

Proposal:

- Add organization-level automatic PR routing for all contribution-triage
  categories.
- Let repository owners define custom escalation rules for labels, comments,
  and closure behavior.
- Decide whether PR triage labels should be configurable per repository or
  fixed to the Open Maintainer defaults.

Open questions:

- Which labels should be canonical versus repository-owned?
- Which writes should be allowed from CLI, dashboard, Action, or GitHub App
  contexts?
- Which states require explicit human approval before mutation?

This fixture should require maintainer design before implementation because it
changes governance, permissions, and product policy.
