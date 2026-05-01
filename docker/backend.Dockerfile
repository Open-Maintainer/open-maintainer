FROM node:24-bookworm-slim

ARG BUN_VERSION=1.3.13
ARG CODEX_CLI_VERSION=0.128.0
ARG CLAUDE_CLI_VERSION=2.1.126

ENV BUN_INSTALL=/root/.bun
ENV PATH=/root/.bun/bin:/usr/local/bin:$PATH

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates curl gh git unzip \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash -s -- "bun-v${BUN_VERSION}"

RUN npm install -g \
  "@openai/codex@${CODEX_CLI_VERSION}" \
  "@anthropic-ai/claude-code@${CLAUDE_CLI_VERSION}"

WORKDIR /app
