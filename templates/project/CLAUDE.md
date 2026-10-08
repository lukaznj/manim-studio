# Video project (Manim Studio)

One educational maths video, made with manim 0.21 + manim-voiceover. Manim Studio renders `scene.py` and builds the timeline from each render. The narration language is the project's language; Studio tells you which.

## Files

- `scene.py` — the video: exactly one `class Video(StudioScene)`.
- `project.json` — format, theme, language, voice settings. Changed through the app, not by hand.
- `voice/` — generated speech (`tts/`) and human recordings (`recordings/`). Never edit or delete.

## How to write scenes

- Start with `from manim import *` and `from studio import *`. `studio` gives `StudioScene`, the frame constants and the palette.
- **Structure** — `self.next_section("Name")` for each part (Intro, Definition, Example…). Sections become chapters on the timeline.
- **Narration** — every spoken sentence goes in a voiceover block, and the animations go inside it:
  ```python
  with self.voiceover("The vertex is the <bookmark mark='v'/>lowest point.") as v:
      self.play(Create(graph), run_time=1.5)
      self.wait_until_bookmark("v")
      self.play(Indicate(vertex))
  ```
  The block waits for the speech to finish. Bookmarks sync an animation to a word. Subtitles are generated from the narration automatically.
- **Speakable narration**:
  - Spell out maths the way a teacher says it ("x squared", "f of x", "equals", "over"). Speech engines read symbols badly.
  - Write numbers in words when they are part of a sentence.
- **On-screen text** — prose uses `Text` or `MarkupText`, rendered in the bundled Nunito. Formulas use `MathTex` (LaTeX). Never put prose sentences inside `Tex`/`MathTex`.
- **Colours** — use only the palette names: `TEXT`, `MUTED`, `ACCENT`, `HIGHLIGHT`, `POSITIVE`, `NEGATIVE`. They follow the project's light/dark theme, so never hardcode hex colours.
- **Layout** — keep everything inside the safe area:
  - Use `fit(mobject)` to scale anything wide down into `SAFE_W × SAFE_H`.
  - Use `MARGIN` with `to_edge`.
  - Portrait projects (`PORTRAIT` is True; frame 8 wide × 14.2 tall) stack content vertically.
  - Landscape projects (14.2 × 8) can place things side by side.
- **Timing the timeline can edit**:
  - Call `self.play(...)` and `self.wait(...)` directly in `construct`.
  - Give `run_time=` as a plain number.
  - The editor can drag those clips to retime them. Clips inside helper functions or with computed durations are locked.
- **Pacing** — a 2–4 minute video is the target. One idea per section. Leave about 0.5 s of stillness after an important result.

## Checking your work

After every change, call `render_preview`. If it reports an error, fix it. If it reports layout warnings (off screen, overlapping text), fix those too.

Then call `view_frames` at the moments you changed. Don't call something done before you have looked at it.
