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

The first two points fit this app: the binary is unmodified, the flow is Anthropic's own, and the app never touches credentials. The third reads against it.

**Resolved (2026-10-08, by the maintainer):** plan sign-in stays, in public releases too. The app doesn't offer a login of its own: "Sign in" runs Anthropic's flow inside the unmodified Claude Code binary, and each user's usage goes on their own subscription, which the legal page explicitly allows. Anthropic hasn't been asked or given approval; this is the maintainer's reading of the terms.

## Decision

- **The SDK.** Use `@anthropic-ai/claude-agent-sdk`. It runs the Claude Code binary shipped in its platform package.
- **Sign-in.**
  - "Sign in" runs that binary's own `claude auth login --claudeai`, which is Anthropic's browser OAuth.
  - Credentials are stored by Claude Code itself; the app never sees them.
  - Status comes from `claude auth status` and sign-out from `claude auth logout`.
- **Account or API key, chosen explicitly.** Settings → Claude has a switch, "Use Claude with: Claude account | API key" (`settings.claudeAuth`, default account).
  - The API key comes from the user's own Console account. It's stored with `safeStorage` like the ElevenLabs key, and handed to the binary as `ANTHROPIC_API_KEY` only while the switch says API key.
  - A saved key no longer silently overrides the sign-in.
  - Switching ends the running chat session; the next message starts Claude Code with the new method and resumes the conversation.
- **Plan usage, shown.** With an account, the chat header shows the plan's tightest limit, and Settings → Claude lists every limit with its reset time. The limits are shared with claude.ai and Claude Desktop.
  - The numbers come from the SDK's `/usage` call (`usage_EXPERIMENTAL_…`), refreshed after each turn and when the window regains focus (at most once a minute).
  - The SDK marks that call experimental, so if it disappears or changes shape, the meter hides instead of failing.
  - The plan name is no longer shown in the chat header.
- **Environment.** Otherwise `ANTHROPIC_*`, `CLAUDECODE` and `CLAUDE_CODE_*` are stripped from the environment, so a stray key or parent session can't redirect usage. `CLAUDE_AGENT_SDK_CLIENT_APP` names the app to Anthropic.
- **Branding.** The chat pane is "Claude Agent", with no Claude Code branding or look, as the Agent SDK's branding guidelines ask.
- **Tools Claude gets.**
  - Read, Edit, Write, Glob, Grep, WebSearch, WebFetch and TodoWrite, plus three in-process MCP tools: `render_preview`, `get_timeline` and `view_frames` (frames returned as images).
  - **No Bash.**
  - `canUseTool` allows writes only inside the project, and reads only inside the project, the Studio Python package and the manim sources (so Claude reads the API instead of guessing it).
- **Session per project.** The session id is saved in `project.json` and resumed when the session file exists on this machine.
- **Commits.** Renders don't commit while Claude works; the turn commits once at the end as "Claude: …".
- **Model and effort.** Two pickers under the chat box (and in Settings → Claude) list what `supportedModels()` offers the current account, with each model's effort levels.
  - Empty means the account's default model. Effort is always a real level: medium unless chosen, which is what Claude Code itself ran at by default, so the picker never says a vague "default".
  - A change applies to the running session (`setModel`, `applyFlagSettings({ effortLevel })`), so switching keeps the conversation. Verified: the next turn ran on the new model and effort, in the same session.
  - Picking a model that doesn't offer the chosen effort resets effort to the model's default. Otherwise Claude Code would lower it silently while the picker showed the old value.
  - The list is fetched again whenever the sign-in or API key changes.
  - Settings are global, not per project.

## Consequences

- No keys to distribute, and each person's usage stays on their own plan.
- Which model and effort make the best videos for the usage they cost is still open. See the model comparison in the [[../01-product/roadmap|roadmap]].
- If Anthropic changes these terms, this ADR is where to start. The API key path already works and needs no change.
- If Anthropic objects to plan sign-in in a third-party app, the fallbacks are ready: make the API key the default, or drop the in-app "Sign in" and leave plan use to people who ran `claude auth login` themselves.
- The app has no servers, no shared account and no credentials of its own. Forks must keep it that way, or the reading above no longer holds.
- **Verified** with a Pro plan sign-in: Claude edited `scene.py`, rendered, read the timeline, looked at frames, the turn was committed as "Claude: …", and the session resumed after a restart.
