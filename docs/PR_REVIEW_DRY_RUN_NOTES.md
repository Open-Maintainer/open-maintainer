# PR Review Dry-Run Notes

Use dry-run review when a maintainer wants to inspect the generated review
without writing GitHub comments.

Recommended local command:

```sh
bun run cli review . \
  --pr 123 \
  --model codex \
  --allow-model-content-transfer \
  --dry-run
```

The command should print the reviewed pull request number and confirm that no
PR comments were posted.
