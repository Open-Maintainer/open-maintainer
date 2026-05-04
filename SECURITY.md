# Security Policy

## Reporting a Vulnerability

Please do not report security vulnerabilities in public GitHub issues, pull requests, or discussions.

Use GitHub private vulnerability reporting for this repository when available. If that is unavailable, contact the maintainers through a private channel and include enough detail to reproduce and assess the issue.

Helpful reports include:

- affected version, commit, branch, or deployment mode
- affected component or path
- reproduction steps or proof of concept
- expected and actual impact
- relevant logs, screenshots, or request examples with secrets removed

## Scope

Security reports are especially relevant for:

- GitHub App authentication, webhook verification, and repository permissions
- repository-content transfer to model providers
- local repository scanning and uploaded repository handling
- GitHub write paths for comments, labels, branches, and pull requests
- Docker Compose service wiring and environment variables
- secrets, credentials, tokens, and private keys

## Handling

Maintainers will acknowledge valid private reports as soon as practical, investigate the issue, and coordinate a fix and disclosure timeline based on severity and exploitability.

Do not include real secrets, private repository contents, or third-party credentials in a report unless the maintainers explicitly request them through a private channel.

## Supported Versions

Open Maintainer is in active development. Security fixes target the default branch unless maintainers explicitly announce supported release branches.
