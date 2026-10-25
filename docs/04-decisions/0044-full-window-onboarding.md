---
status: accepted
date: 2026-10-25
---

# 0044 — Full-window onboarding that installs everything first

## Context

First launch was a small modal that mirrored Settings. It never said what the app is. The environment install was a stray button inside the voice step, and a "Complete setup" button on Home caught whatever onboarding left behind. So a user could reach the library without the engine and find out only when the first render failed.

## Decision

- First launch is a full-window guided flow, shown instead of Home until a mode is chosen. It explains what Studio is and how a video is made, then asks for one decision per page: mode, projects folder, agent, sign-in, voice. Every page saves as it goes.
- Leaving the mode page starts every install that mode needs, in the background: the engine (pixi env) and LaTeX in parallel. In Create and Both, Whisper follows once the engine is in (two pixi installs in one folder would collide). OmniVoice is installed only when someone picks it. Codex or Antigravity installs when its sign-in page opens.
- The last page waits until the engine and LaTeX are ready. After onboarding, a setup screen replaces the app whenever either is missing (quit mid-install, or an update needs a newer engine). The screen restarts the install and opens the app when it finishes. Home's "Complete setup" button is gone; only a skipped agent sign-in shows a "Connect your AI agent" hint.
- Agent sign-in and the voice stay optional ("Set up later"). The last page lists what's missing, with a button back to each page.
- The left half is a manim-style stage that stays dark in both themes, like a video frame. Its drawings animate on each page (with reduced motion respected), and on the install page they show the real progress.

## Consequences

Nobody reaches the library without a working engine, at the cost of a wait on first launch. Settings keeps the same controls for later changes; onboarding reuses the folder step, voice picker and ElevenLabs permission check, but has its own inline key field. This revises the first-launch part of [[0036-settings-onboarding-and-languages]].
