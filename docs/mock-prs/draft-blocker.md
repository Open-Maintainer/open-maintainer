# Draft PR Gate Mock

This fixture is opened as a GitHub draft PR.

Expected behavior:

- Contribution triage may inspect the changed file and PR text.
- The CLI must refuse `open-maintainer/ready-for-review` while GitHub reports
  `isDraft: true`.
- Maintainers can use this PR to verify the draft gate independently from CI
  failure and merge conflict gates.
