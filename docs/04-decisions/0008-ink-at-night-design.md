---
status: accepted
date: 2026-10-08
---

# 0008 — "Ink at night" design language, with a light twin

## Context

This is a work tool: serious, used for hours, and showing dark video stages most of the time. It began next to Maturita, so the palette and display face come from there, but it shouldn't look like the student app's light "Fokus" theme.

## Decision

- **Palette.**
  - Surfaces in an ink navy: `#070e19` → `#0b1626` → `#111f33`. The panels share the hue of the dark video theme, so the preview reads as part of the stage.
  - **Chalk-yellow `#FFD166`** (Maturita's "sun") is the single action colour: the playhead, primary buttons, and the duration numbers in code, which are what the timeline edits.
  - Blue `#6B97FF` marks selection, coral `#FF6F59` marks recording and errors, mint `#4CC26A` marks done.
- **Light theme, "ink on paper"** (added 2026-10-08).
  - Same roles, light values: grey chrome `#e7ebf1`, near-white panes `#f6f8fb`, ink text `#0d1a2b`.
  - Chalk-yellow stays the action colour (`#FBC232` fills). Where it is text or an icon, it becomes amber `#8C5E00` (`--sun-text`), since yellow text doesn't read on paper.
  - Light text is at least as legible as dark: the faint grey reaches 4.2:1 on panes, against 3.8:1 in dark.
  - Overlays on the video (captions, the render-status pill, thumbnail times) keep their dark look in both themes, because they sit on the picture, not the UI.
- **Appearance setting.** Settings → General: System (default), Light or Dark.
  - It sets Electron's `nativeTheme.themeSource`, so native menus, dialogs and `<select>` popups match, and `prefers-color-scheme` follows.
  - Styles key off `html[data-theme]`, not the media query, so a switch can be animated. `lib/theme.ts` flips the attribute inside a View Transition (type `theme`), and the whole window cross-fades in 0.45 s. That includes when the OS changes on its own in System mode.
  - Monaco has a matching `studio-light` theme, switched inside the same transition.
- **Type.**
  - Nunito, heavy, only for titles and the wordmark.
  - Inter for the UI and JetBrains Mono for code and timecodes. All three are bundled.
- **Signature: the code follows the video.** While it plays, a yellow gutter marker moves through `scene.py` to the line producing what's on screen, and that clip glows on the timeline.
- **Motion that carries meaning:**
  - Clips glide to their new timings after each render.
  - Dialogs rise in (`@starting-style`), and screens and themes cross-fade (View Transitions).
  - Reduced motion is respected.
  - No animation library: CSS and native APIs only.
- **Mark.** A custom rounded M for Manim, drawn in an orange→yellow stroke and finished with a blue dot. The same geometry appears in the wordmark and app icon.
- **App icon.** An Icon Composer document (`build/icon.icon`) with Liquid Glass on macOS 26 and later.
  - A plain ink gradient background, a glass M (orange→yellow), and a blue glass finish. No grid or axes. The simple silhouette remains legible at Dock and title-bar sizes.
  - electron-builder compiles it with `actool` into `Assets.car` plus an `.icns` for older macOS.
  - Windows and Linux use `build/icon.png`, rendered from the same document with `ictool`.
- **Language.** English UI copy (it was Croatian until [[0011-open-source-english]]).

## Consequences

- Colours are tokens in `src/renderer/src/styles/base.css`, with a `[data-theme='light']` block of overrides; components use the tokens.
- A one-off colour outside the tokens is written `light-dark(<light>, <dark>)`, which follows `color-scheme`. A bare hex is a bug in one of the two themes.
- The Monaco themes (`studio`, `studio-light` in `CodePane.tsx`) repeat the token values by hand.
- Edit the icon in Icon Composer (Xcode 26+), then re-export `build/icon.png` from it.
- Screenshots: `../05-design/screenshots/`.
