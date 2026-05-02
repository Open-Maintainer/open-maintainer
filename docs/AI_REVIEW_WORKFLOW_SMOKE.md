# AI Review Workflow Smoke

This temporary document exists to exercise the v0.4 rule-grounded PR review
workflow on a safe docs-only pull request.

Expected validation:

- The Open Maintainer audit job runs as usual.
- The opt-in review job runs only when repository review configuration is
  enabled.
- The review job writes a GitHub Step Summary and, when permitted, posts capped
  review feedback to the pull request.
