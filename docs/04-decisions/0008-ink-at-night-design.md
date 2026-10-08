---
status: accepted
date: 2026-10-08
---

# 0008 — "Ink at night" design language

## Context

This is a work tool: serious, used for hours, and showing dark video stages most of the time. It began next to Maturita, so the palette and display face come from there, but it shouldn't look like the student app's light "Fokus" theme.

## Decision

- **Palette.**
  - Surfaces in an ink navy: `#070e19` → `#0b1626` → `#111f33`. The panels share the hue of the dark video theme, so the preview reads as part of the stage.
  - **Chalk-yellow `#FFD166`** (Maturita's "sun") is the single action colour: the playhead, primary buttons, and the duration numbers in code, which are what the timeline edits.
  - Blue `#6B97FF` marks selection, coral `#FF6F59` marks recording and errors, mint `#4CC26A` marks done.
- **Type.**
  - Nunito, heavy, only for titles and the wordmark.
  - Inter for the UI and JetBrains Mono for code and timecodes. All three are bundled.
- **Signature: the code follows the video.** While it plays, a yellow gutter marker moves through `scene.py` to the line producing what's on screen, and that clip glows on the timeline.
- **Motion that carries meaning:**
  - Clips glide to their new timings after each render.
  - Dialogs rise in (`@starting-style`) and screens cross-fade (View Transitions).
  - Reduced motion is respected.
  - No animation library: CSS and native APIs only.
- **Mark.** y = x² halfway through being drawn: an orange→yellow curve with a blue pen dot at its tip. It's the wordmark, the home screen's empty state, and the app icon.
- **App icon.** An Icon Composer document (`build/icon.icon`) with Liquid Glass on macOS 26 and later.
  - Groups: an ink gradient fill, faint grid paper, the curve in glass (orange→yellow), and the pen in a blue glass orb.
  - electron-builder compiles it with `actool` into `Assets.car` plus an `.icns` for older macOS.
  - Windows and Linux use `build/icon.png`, rendered from the same document with `ictool`.
- **Language.** English UI copy (it was Croatian until [[0011-open-source-english]]).

## Consequences

- Colours are tokens in `src/renderer/src/styles/base.css`; components use the tokens. The Monaco theme uses the same values.
- Edit the icon in Icon Composer (Xcode 26+), then re-export `build/icon.png` from it.
- Screenshots: `../05-design/screenshots/`.
