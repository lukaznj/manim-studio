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
- **Studio's tools** reach Codex through the stdio bridge Claude Desktop's extension uses (`mcpb/server.ts`, shipped as `mcp-bridge.js` and run by Electron as Node), allowed only the scene tools and pre-approved (`default_tools_approval_mode: 'approve'`) because `approvalPolicy: 'never'` has no interactive prompt. Codex edits the project's files itself, sandboxed to the project (`workspace-write`, with `windows.sandbox: 'unelevated'` on Windows so Codex does not fall back to `read-only`, and with Codex Desktop's computer-use/browser plugins disabled). The brief tells it to render only through `render_preview`.
- **Models:** the managed CLI's model catalog and supported effort levels ([[0039-codex-model-discovery-and-capacity-recovery|ADR 0039]]), or Codex's account default. The project keeps Codex's thread id (`codexThreadId`) to resume it after a restart. Capacity fallback is an explicit Settings choice.

## Consequences

- Choosing Codex costs a one-time 140 MB download; Claude users download nothing extra.
- Plan usage is shown for Claude only.
- Verified end-to-end with a signed-in ChatGPT account (including Windows `0.162.1`): install, status, `workspace-write` sandbox enforcement, the MCP bridge's scene tools, and chat turns.
