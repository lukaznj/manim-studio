# Design language

The full reasoning is in [[../04-decisions/0008-ink-at-night-design|ADR 0008]]. The tokens are in `src/renderer/src/styles/base.css`.

| | |
|---|---|
| ![[screenshots/editor.png]] | The editor after a Claude turn: code, preview, Claude Agent, and the timeline with sections, animations, voice and subtitles. Line 48 is marked because it produces the frame on screen. |
| ![[screenshots/editor-light.png]] | The same in the light theme, "ink on paper" |
| ![[screenshots/home.png]] | Projects, each with a thumbnail picked from the render |
| ![[screenshots/home-light.png]] | Projects in the light theme |
| ![[screenshots/new-project.png]] | New project: the format cards animate their frame, the theme swatches show the video palette, and the narration language is chosen here |
| ![[screenshots/recording-booth.png]] | The recording booth: a teleprompter over every voiceover block |
| ![[screenshots/history.png]] | Version history: renders and Claude turns as restorable versions |
| ![[screenshots/settings-voice.png]] | Voice settings per project |
| ![[screenshots/app-icon.png]] | The app icon: `build/icon.icon`, an Icon Composer document with Liquid Glass |
| ![[screenshots/icon-appearances.png]] | The icon in the default, dark, clear and tinted appearances, rendered with `ictool` |

## Rules of thumb

- **One action colour.** Chalk-yellow means "do this" or "this is time". Don't introduce a second accent for actions. In the light theme, yellow text becomes amber (`--sun-text`).
- **Both themes.** Appearance follows the system by default. Check every change in light and dark. One-off colours are `light-dark(light, dark)`, never a bare hex.
- **Copy.** English, sentence case. Buttons say what happens: "Save take", not "OK". Errors say what broke and offer the fix ("Fix with Claude").
- **Motion.**
  - Allowed: state changes the user should see (retiming, dialogs, progress).
  - Not allowed: decoration.
  - Everything respects `prefers-reduced-motion`.
- **Screenshots** never show an account or an e-mail address.
