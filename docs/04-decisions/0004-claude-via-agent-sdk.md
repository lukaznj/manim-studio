---
status: accepted
date: 2026-10-08
---

# 0004 — Claude through the Agent SDK, each admin's own sign-in

## Context

The admins have their own Claude plans (not Max), so no API credits come with them, and they want to use those plans instead of an API key. Anthropic's terms (Claude Code docs, *Legal and compliance → Authentication and credential use*, checked October 2026):

- **Not allowed:** a third-party app offering its own Claude.ai login, collecting or storing Claude credentials, or routing requests through one user's plan on behalf of others.
- **Allowed:** an end user signing in to the unmodified Claude Code binary with their own subscription. The help center says Agent SDK usage signed in with a plan draws from that plan's limits.

## Decision

- **The SDK.** Use `@anthropic-ai/claude-agent-sdk`. It runs the Claude Code binary shipped in its platform package.
- **Sign-in.**
  - "Prijavi se" runs that binary's own `claude auth login --claudeai`, which is Anthropic's browser OAuth.
  - Credentials are stored by Claude Code itself; the app never sees them.
  - Status comes from `claude auth status` and sign-out from `claude auth logout`.
- **Environment.** `ANTHROPIC_*`, `CLAUDECODE` and `CLAUDE_CODE_*` are stripped from the environment, so a stray API key or parent session can't redirect usage.
- **Tools Claude gets.**
  - Read, Edit, Write, Glob, Grep, WebSearch, WebFetch and TodoWrite, plus three in-process MCP tools: `render_preview`, `get_timeline` and `view_frames` (frames returned as images).
  - **No Bash.**
  - `canUseTool` allows writes only inside the project, and reads only inside the project, the Studio Python package and the manim sources (so Claude reads the API instead of guessing it).
- **Session per project.** The session id is saved in `project.json` and resumed when the session file exists on this machine.
- **Commits.** Renders don't commit while Claude works; the turn commits once at the end as "Claude: …".
- **Model.** The default is the account's own default. Settings lists whatever `supportedModels()` offers that plan.

## Consequences

- No keys to distribute, and each person's usage stays on their own plan.
- If Anthropic changes these terms, this ADR is where to start. The fallback is an API key from the admin's own Console account. The SDK supports it, but a settings field for it doesn't exist yet.
- Claude chat could not be tested end to end during development without a signed-in account. The wiring (tool list, MCP connection, failure handling) was verified with the binary; see [[../06-operations/known-issues|known issues]].
