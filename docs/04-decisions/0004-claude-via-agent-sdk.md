---
status: accepted
date: 2026-10-08
---

# 0004 — Claude through the Agent SDK, each user's own sign-in

## Context

The first users (Maturita's admins) had their own Claude plans (not Max), with no API credits, and wanted to use those plans instead of an API key. Since the app went public ([[0011-open-source-english]]), other people will bring a plan or an API key of their own. Anthropic's terms (Claude Code docs, *Legal and compliance → Authentication and credential use*, checked October 2026):

- **Not allowed:**
  - offering Claude.ai login in a third-party app
  - collecting, storing or intermediating Claude credentials
  - routing requests through Free, Pro or Max credentials on behalf of users
- **Allowed:** "an end user signing in to the unmodified Claude Code binary with their own Claude subscription". The same page says a product may run Claude Code as long as the binary is unmodified and each end user authenticates with their own API key or plan credentials.
- **But:** the Agent SDK overview also says that, unless previously approved, third-party developers may not offer claude.ai login or rate limits for their products, "including agents built on the Claude Agent SDK".

The first two points fit this app: the binary is unmodified, the flow is Anthropic's own, and the app never touches credentials. The third reads against it, and it matters more now that anyone can download the app.

## Decision

- **The SDK.** Use `@anthropic-ai/claude-agent-sdk`. It runs the Claude Code binary shipped in its platform package.
- **Sign-in.**
  - "Sign in" runs that binary's own `claude auth login --claudeai`, which is Anthropic's browser OAuth.
  - Credentials are stored by Claude Code itself; the app never sees them.
  - Status comes from `claude auth status` and sign-out from `claude auth logout`.
- **API key, optional.** Settings → Claude takes an Anthropic API key from the user's own Console account. It's stored with `safeStorage` like the ElevenLabs key and handed to the binary as `ANTHROPIC_API_KEY`, which then takes precedence over the sign-in.
- **Environment.** Otherwise `ANTHROPIC_*`, `CLAUDECODE` and `CLAUDE_CODE_*` are stripped from the environment, so a stray key or parent session can't redirect usage. `CLAUDE_AGENT_SDK_CLIENT_APP` names the app to Anthropic.
- **Branding.** The chat pane is "Claude Agent", with no Claude Code branding or look, as the Agent SDK's branding guidelines ask.
- **Tools Claude gets.**
  - Read, Edit, Write, Glob, Grep, WebSearch, WebFetch and TodoWrite, plus three in-process MCP tools: `render_preview`, `get_timeline` and `view_frames` (frames returned as images).
  - **No Bash.**
  - `canUseTool` allows writes only inside the project, and reads only inside the project, the Studio Python package and the manim sources (so Claude reads the API instead of guessing it).
- **Session per project.** The session id is saved in `project.json` and resumed when the session file exists on this machine.
- **Commits.** Renders don't commit while Claude works; the turn commits once at the end as "Claude: …".
- **Model.** The default is the account's own default. Settings lists whatever `supportedModels()` offers that plan.

## Consequences

- No keys to distribute, and each person's usage stays on their own plan.
- If Anthropic changes these terms, this ADR is where to start. The API key path already works and needs no change.
- **Open question before public releases:** is the in-app "Sign in" button allowed for a publicly distributed app? There are three ways to settle it:
  - ask Anthropic (the terms page points to sales for exactly this)
  - make the API key the default and leave plan sign-in to users who already ran `claude auth login` themselves
  - drop plan sign-in from public builds
- Whatever the answer, the app has no servers, no shared account and no credentials of its own. Forks must keep it that way.
- **Verified** with a Pro plan sign-in: Claude edited `scene.py`, rendered, read the timeline, looked at frames, the turn was committed as "Claude: …", and the session resumed after a restart.
