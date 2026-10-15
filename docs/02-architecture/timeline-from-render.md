# The timeline is produced by the render

The central idea ([[../04-decisions/0002-timeline-derived-from-render|ADR 0002]]): there is no separate timeline model. Every render produces `timeline.json`, and the UI only displays that file and turns gestures into code edits.

## How the runner records it

`python/studio_runner/render.py` monkeypatches four things before the scene is built:

| Patched | Recorded |
|---|---|
| `Scene.play`, which `wait()` also goes through | start/end time (`renderer.time`), the animations and their targets, and the **innermost `scene.py` line** on the call stack |
| `Scene.next_section` | name, start time, line |
| `VoiceoverScene._add_voiceover_text` | start/end, spoken text, the recording key, the audio source used, bookmark times |
| `StudioScene.thumbnail` (a no-op outside a render) | the moment marked as the video's key picture and its hook text, for the exported thumbnail ([[../04-decisions/0026-thumbnail-card\|ADR 0026]]) |

Subtitles come from `file_writer.subcaptions`. Layout warnings come from `layout.py`, which runs after every `play()` and flags text outside the frame and text overlapping text.

## Clips the timeline can retime

`source.py` reads `scene.py` with `ast` and annotates each clip:

- **`edit`.** The clip is a `self.play(...)` or `self.wait(...)` on that line with a literal duration, or with none (the edit inserts one). The span is in 1-based lines and 0-based **characters**, not UTF-8 bytes, so `č` earlier on the line doesn't shift it.
- **`locked`**, with a reason the UI shows:
  - `voiceover`: the narration tail
  - `bookmark`: a `wait_until_bookmark`
  - `computed:<expr>`: a duration like `run_time=v.duration`
  - `helper`: the call is inside a helper function
  - `ambiguous`: several calls on one line
  - `kwargs`, `syntax`
- **`repeat`.** How many clips share one literal (a loop), so the UI can warn that the drag changes all of them.

A drag becomes a Monaco edit (`src/renderer/src/lib/edits.ts`, unit-tested), then a save, then a render. The new clips glide to their new positions, which is what makes the retiming visible.

## Contract

The shape is `Timeline` in `src/shared/types.ts`, and `render.py` is the producer. Change both together. `python/tests/test_runner.py` renders a fixture project and checks the contract end to end.
