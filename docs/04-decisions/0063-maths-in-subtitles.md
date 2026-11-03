---
status: accepted
date: 2026-11-03
---

# 0063 — Maths in subtitles: written as LaTeX, typeset in the app, plain text in files

## Context

Subtitles were the narration's text, and the narration is written to be spoken ("tau is much less than T P"), so viewers read the words a speech engine needs, not the symbol on screen. Subtitles in other languages came from the translated narration and had the same problem.

## Decision

- **A block's written form is its `subcaption`.** manim-voiceover already takes `self.voiceover(spoken, subcaption=written)`. The project template tells the agent to give one whenever a sentence speaks maths, with the maths between `$…$`. Blocks without one keep their narration as subtitles.
- **Formulas stay whole.** `StudioScene.add_wrapped_subcaption` splits at spaces like manim-voiceover, but never inside `$…$`, and measures a formula by what it shows. The dub splitter does the same.
- **The timeline keeps the LaTeX:** `subtitles[].text` and `voice[].subtitle` ([[0002-timeline-derived-from-render]] contract). The study player draws a video's subtitles itself, with KaTeX, when they contain maths, in the viewer's subtitle style ([[0060-playback-subtitle-style]]); videos without maths keep native cues. The transcript and the editor preview typeset them too.
- **Files get plain text.** No player, YouTube or libass renders LaTeX, so `.srt` and `.vtt` get the closest Unicode (`studio_runner/captions.py`): `τ ≪ Tₚ`, `x²`, `T/2`, `√(a+b)`. Save video's "As a file" copies that `.srt`, and "Burned in" ([[0062-save-video-copy]]) draws the same text.
- **Other languages translate the written form separately**, with every `$…$` kept as written, and cache it in `voice/translations/<lang>.json` beside the narration.

## Consequences

Plain text is an approximation: capital subscripts have no Unicode form, so `T_P` shows as `Tₚ`, and a long fraction becomes `(a+b)/(c+d)`. Burned-in subtitles could draw real maths by rendering each cue as a picture; that waits until the plain form proves not good enough. Videos made before this keep their spoken subtitles until the agent adds subcaptions and they are exported again.
