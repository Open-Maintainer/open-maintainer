# Changes Requested Gate Mock

This fixture is intended to receive a GitHub "request changes" review after the
PR is opened.

Expected behavior:

- GitHub should report `reviewDecision: CHANGES_REQUESTED`.
- The CLI must refuse `open-maintainer/ready-for-review` while changes are
  requested.
- The fixture isolates the review-decision gate from draft and conflict gates.
