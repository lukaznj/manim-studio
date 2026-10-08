# Design language

The full reasoning is in [[../04-decisions/0008-ink-at-night-design|ADR 0008]]. The tokens are in `src/renderer/src/styles/base.css`.

| | |
|---|---|
| ![[screenshots/home-first-run.png]] | Home on first run: setup steps, and an empty state drawing the parabola |
| ![[screenshots/new-project.png]] | New project: the format cards animate their frame, the theme swatches show the video palette |
| ![[screenshots/editor-code-follow.png]] | Editor while playing: line 35 is marked because it produces the frame on screen |
| ![[screenshots/editor-retimed-clip.png]] | After dragging FadeIn's edge: `run_time=1.8` in code, re-rendered, the clip and line selected |
| ![[screenshots/editor-render-error.png]] | A render error: the line is marked in the code, with "Popravi s Claudeom" |
| ![[screenshots/history.png]] | Version history |
| ![[screenshots/settings-voice.png]] | Voice settings per project |
| ![[screenshots/app-icon.png]] | App icon, rendered with manim (`scripts/make-icon.py`) |

## Rules of thumb

- **One action colour.** Chalk-yellow means "do this" or "this is time". Don't introduce a second accent for actions.
- **Copy.** Croatian sentence case. Buttons say what happens: "Spremi snimku", not "U redu". Errors say what broke and offer the fix.
- **Motion.**
  - Allowed: state changes the user should see (retiming, dialogs, progress).
  - Not allowed: decoration.
  - Everything respects `prefers-reduced-motion`.
