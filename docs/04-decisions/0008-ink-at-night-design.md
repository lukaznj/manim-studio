---
status: accepted
date: 2026-10-08
---

# 0008 — "Ink at night" design language, Croatian UI

## Context

This is a tool for admins: serious, used for hours, and showing dark video stages most of the time. It should feel like part of the maturita family without copying the student app's light "Fokus" look.

## Decision

- **Palette.**
  - Surfaces in maturita's ink navy: `#070e19` → `#0b1626` → `#111f33`. The panels share the hue of the dark video theme, so the preview reads as part of the stage.
  - **Chalk-yellow `#FFD166`** (maturita's "sun") is the single action colour: the playhead, primary buttons, and the duration numbers in code, which are what the timeline edits.
  - Blue `#6B97FF` marks selection, coral `#FF6F59` marks recording and errors, mint `#4CC26A` marks done.
- **Type.**
  - Nunito, maturita's display face, heavy, only for titles and the wordmark.
  - Inter for the UI and JetBrains Mono for code and timecodes. All three are bundled.
- **Signature: the code follows the video.** While it plays, a yellow gutter marker moves through `scene.py` to the line producing what's on screen, and that clip glows on the timeline.
- **Motion that carries meaning:**
  - Clips glide to their new timings after each render.
  - Dialogs rise in (`@starting-style`) and screens cross-fade (View Transitions).
  - Reduced motion is respected.
  - No animation library: CSS and native APIs only.
- **Language.** Croatian UI copy and English identifiers, as in maturita.

## Consequences

- Colours are tokens in `src/renderer/src/styles/base.css`; components use the tokens. The Monaco theme uses the same values.
- Screenshots: `../05-design/screenshots/`.
