# Decisions

One note per non-obvious decision, from [[_template]]. Keep this index in sync: an agent reads the status here before changing anything a decision covers. If a change contradicts an *accepted* decision, say so and update the ADR, don't silently route around it.

| ADR | Decision | Status |
|---|---|---|
| [[0001-electron-desktop-app]] | Desktop app on Electron, not a web app | accepted |
| [[0002-timeline-derived-from-render]] | The timeline is produced by each render; no separate model | accepted |
| [[0003-python-env-via-pixi]] | Python, manim and LaTeX are installed by the app (pixi + TinyTeX) | accepted |
| [[0004-claude-via-agent-sdk]] | Claude through the Agent SDK with each user's own sign-in or API key | accepted |
| [[0005-voice-providers]] | System voice, ElevenLabs, OmniVoice and recordings, per project language; sidecar subtitles | accepted |
| [[0006-auto-update-github-releases]] | Auto-update from this repo's GitHub Releases, three platforms | accepted |
| [[0007-history-is-git]] | Version history is git, committed automatically | accepted |
| [[0008-ink-at-night-design]] | "Ink at night" design language with a light twin (System by default), Liquid Glass icon | accepted |
| [[0009-mcp-server-later]] | Claude Desktop drives Studio through an extension (.mcpb) and a local endpoint | accepted |
| [[0010-fixed-aspect-per-project]] | 16:9 or 9:16 chosen per project, fixed | accepted |
| [[0011-open-source-english]] | Open source (MIT), English, platform integrations in forks | accepted |
