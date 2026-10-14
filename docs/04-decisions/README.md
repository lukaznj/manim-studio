# Decisions

One note per non-obvious decision, from [[_template]]. Keep this index in sync: an agent reads the status here before changing anything a decision covers. If a change contradicts an *accepted* decision, say so and update the ADR, don't silently route around it.

| ADR | Decision | Status |
|---|---|---|
| [[0001-electron-desktop-app]] | Desktop app on Electron, not a web app | accepted |
| [[0002-timeline-derived-from-render]] | The timeline is produced by each render; no separate model | accepted |
| [[0003-python-env-via-pixi]] | Python, manim and LaTeX are installed by the app (pixi + TinyTeX) | accepted |
| [[0004-claude-via-agent-sdk]] | Claude through the Agent SDK with each user's own sign-in or API key | accepted |
| [[0005-voice-providers]] | ElevenLabs, OmniVoice and recordings, chosen per project; sidecar subtitles | accepted |
| [[0006-auto-update-github-releases]] | Auto-update from this repo's GitHub Releases, three platforms | accepted |
| [[0007-history-is-git]] | Version history is git, committed automatically | accepted |
| [[0008-ink-at-night-design]] | "Ink at night" design language with a light twin (System by default), Liquid Glass icon | accepted |
| [[0009-mcp-server-later]] | Claude Desktop drives Studio through an extension (.mcpb) and a local endpoint | accepted |
| [[0010-fixed-aspect-per-project]] | 16:9 or 9:16 chosen per project, fixed | accepted |
| [[0011-open-source-english]] | Open source (MIT), English, platform integrations in forks | accepted |
| [[0012-own-media-in-scenes]] | Your own pictures and videos go into the scene through studio helpers, not a separate track | accepted |
| [[0013-export-versions-and-languages]] | Export light and dark versions, and dubbed audio tracks plus subtitles per language | accepted |
| [[0014-pdf-sources]] | PDFs are sources in the project, read by Claude through Studio tools and shown with pdf_page() | accepted |
| [[0015-tone-and-pacing]] | Tone per project (professional, warm, playful); pacing by clarity, no target length | accepted |
| [[0016-script-first]] | Claude writes script.md and gets it approved before writing scene.py; series share a series.md | accepted |
| [[0017-background-export-queue]] | Exports run in a background queue, one at a time, each on a copy of its project | accepted |
| [[0018-quick-mode]] | Quick mode: Claude makes the video on autopilot, Studio checks the render and exports it | accepted |
