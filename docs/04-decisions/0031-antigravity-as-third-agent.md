---
status: accepted
date: 2026-10-16
---

# 0031 — Antigravity as a third agent

## Context

Some users have a Google AI plan rather than a Claude or ChatGPT one. Google's Antigravity CLI (`agy`) runs Gemini 4 Argon, its frontier coding model, and has a headless mode with streamed JSON output, MCP servers and permission rules, so it can do Codex's job in Studio ([[0022-codex-as-second-agent]]). Two of its open issues stood in the way of running it unattended: in headless mode `permissions.allow` was ignored on some builds (google-antigravity/antigravity-cli#548), and `--dangerously-skip-permissions` also approves leaving the terminal sandbox (#36).

## Decision

- **Settings → Agent** offers Claude, Codex or Antigravity. `claude.ts` routes the chat, status, sign-in, models and one-off asks to `antigravity.ts` when it's chosen, as it does for Codex.
- **The CLI is installed on demand**: the pinned release (1.3.6) from Google's GitHub releases, checked against the published sha256, into `userData/antigravity/<version>`. `AGY_CLI_DISABLE_AUTO_UPDATE` keeps that version the one that runs.
- **Its own home.** Every run gets `HOME` set to `userData/antigravity/home` and an environment without inherited Google, Gemini or agent variables. Studio writes the CLI's settings (trusted workspace, permission rules, `modelProvider` for a key), the MCP config and the brief (an always-on rule in `.gemini/config/rules/`, the only place a headless run reads one from) before every run. The user's own `~/.gemini` is never touched.
- **Containment without the skip flag.** Headless runs refuse whatever the rules don't allow, and a refusal ends the turn. The rules allow writes in the project only; reads in the project, the studio and manim sources, and the CLI's own `brain/` and `mcp/` folders (where tool results and tool descriptions land); and the six scene tools by name. Measured on 1.3.6 with Gemini 3.8 Flash and Gemini 4 Argon: writes and reads outside the project, shell commands, a symlink out of the project and an Argon run told to "try every way" were all refused, and a full turn in the app (edit, `render_preview`, `view_frames`) changed nothing outside the project. Paths in the rules are real paths, since the CLI follows symlinks (`/var` is `/private/var` on macOS).
- **Studio's tools** come through the stdio bridge Codex uses (`paths.mcpBridge`), with Claude Desktop's project tools hidden (`disabledTools`).
- **Sign-in** is the CLI's own Google sign-in. It works only in its terminal UI, so `studio_runner agy-login` drives it in a pseudo-terminal: it confirms workspace trust only for Studio’s dedicated sign-in folder, picks Google OAuth, reports the link, types the code the user pastes in Settings, and stops once the sign-in is saved. Python's pty exists on macOS and Linux only, so on Windows the CLI opens in a console window of its own (`cmd /c start /wait`; Node's own `detached` with `stdio: 'ignore'` gives the child `DETACHED_PROCESS` and `NUL` stdin, so its TUI exits immediately without a window): the user signs in there, and Studio closes the window tree (`taskkill /T`) once the sign-in is in Windows Credential Manager. The app never reads the token: status checks only that the CLI's token file, keychain item or Credential Manager item (`cmdkey /list:gemini:antigravity`) exists.
- **Sign-in diagnostics** are redacted and shown only in developer mode, including onboarding. Normal users see sign-in progress, consent/code controls and a concise retryable error.
- **macOS keychain.** The CLI stores the sign-in through `/usr/bin/security`, which looks under `HOME`; with HOME moved it found no keychain and asked the user to reset theirs. The CLI's home links `Library/Keychains` to the user's, so the sign-in is one item, `antigravity`, in the login keychain, as when the user runs the CLI themselves. A separate keychain in the CLI's home can't be unlocked on macOS 27.
- **A Gemini API key** (`gemini` secret, safeStorage) is used instead of the sign-in while one is saved; `keys.ts` checks it like the other agents' keys (valid, Gemini 4 Argon listed, a one-token request).
- **Models** come from `agy models`, one per family with its efforts (`gemini-4-argon-{low,medium,high}`); the default is Gemini 4 Argon at medium, Antigravity's own default. The project keeps the conversation id (`antigravityConversationId`) to resume it with `--conversation`.
- **Background agents** run on Antigravity too, since [[0033-every-agent-in-the-background|ADR 0033]]: each project has its own home (`userData/antigravity/projects/<hash>`), so runs in different projects don't share settings, rules or Studio's tools. The sign-in lives in the system keyring (macOS keychain, linked into every home; Windows Credential Manager; Linux Secret Service), or in the main home's token file, which each project home links to. Signing out deletes the Credential Manager item `gemini:antigravity` on Windows (go-keyring's `<service>:<user>`).

## Consequences

- Choosing Antigravity costs a one-time 60 MB download (180 MB unpacked).
- Its events (`step_update`, `result`) are mapped in `antigravity-events.ts`, with tests on recorded runs. Turns aren't in the usage log yet: the CLI reports tokens but no price.
- Pictures attached in the chat reach it as files in the project to look at, since headless input takes text only.
- Untested: Linux (its keyring).
