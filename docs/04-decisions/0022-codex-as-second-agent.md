---
status: accepted
date: 2026-10-14
---

# 0022 — Codex as a second agent

## Context

Some users have a ChatGPT plan rather than a Claude one. Codex, OpenAI's coding agent, can do the same job as Claude in Studio if it gets the same brief and the same tools. Antigravity was considered and left out for now; the same approach added it later ([[0031-antigravity-as-third-agent]]).

## Decision

- **Settings → Agent** chooses Claude or Codex. The chat, quick mode, series planning and translation follow the choice; switching starts a new conversation. `claude.ts` keeps the chat's bookkeeping (messages, history commits, events) and hands a turn to `codex.ts` when Codex is chosen, which maps Codex's items to the same chat parts.
- **Codex runs through `@openai/codex-sdk`**, which spawns the Codex CLI. The CLI is about 340 MB, so it isn't shipped: choosing Codex installs the official npm package for the platform (`@openai/codex@<pinned>-<platform>`) into the app's data folder, checked against npm's published sha512, like the optional Python components. The SDK is in the app; the CLI packages are excluded from the build.
- **Sign-in** runs the CLI's own `codex login` (ChatGPT, in the browser), as Claude's runs `claude auth login` ([[0004-claude-via-agent-sdk]]): Studio never sees a token. An OpenAI API key saved in Settings is used instead while it's there.
- **Studio's tools** reach Codex through the stdio bridge Claude Desktop's extension uses (`mcpb/server.ts`, shipped as `mcp-bridge.js` and run by Electron as Node), allowed only the scene tools. Codex edits the project's files itself, sandboxed to the project (`workspace-write`, no approvals, since nobody is there to approve). The brief tells it to render only through `render_preview`.
- **Models:** Codex's default for the account, with the effort setting. The project keeps Codex's thread id (`codexThreadId`) to resume it after a restart.

## Consequences

- Choosing Codex costs a one-time 140 MB download; Claude users download nothing extra.
- Plan usage is shown for Claude only.
- Not tested with a signed-in Codex account yet: install, status, the MCP configuration and the bridge's tools were.
