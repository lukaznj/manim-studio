---
paths:
  - "src/renderer/**"
---

# Renderer UI

- **Tokens.** Colours and type come from the tokens in `styles/base.css` (ADR 0008). Chalk-yellow `--sun` is the single action colour; don't add another accent. Use `--sun-text` when it's text or an icon.
- **Two themes.** Every colour must work in light and dark: use a token, or `light-dark(<light>, <dark>)` for a one-off. Things drawn on the video (captions, overlays) stay fixed. Screenshot UI changes in both themes: `eval window.studio.setSettings({appearance:'light'})` in the driver.
- **Layout.** Grid and flex containers with scrolling or nowrap children need `minmax(0, 1fr)` / `min-width: 0`. Three on-screen bugs came from content-sized tracks.
- **Playback.** The playhead and anything per-frame subscribe to `lib/playback.ts`, not React state.
- **Code edits.** Go through `lib/editor-bridge.ts` (Monaco) so they're undoable. Timeline-to-code math lives in `lib/edits.ts`, which has tests.
- **Dialogs.** Use `<Modal>` (native `<dialog>`). Mark the field that should take focus with `data-autofocus`; otherwise focus lands on the dialog itself, not its close button.
- **Copy.** English, sentence case, verbs that say what happens ("Save take", not "OK"). Errors say what broke and how to fix it.
- **Motion.** Only for state changes, and it must respect `prefers-reduced-motion`.
