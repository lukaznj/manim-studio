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
  - Labels and indices are names, not amounts: say R₂₃ (`R_{23}`) as "R two three", never "R twenty-three"; `x_{12}` as "x one two". Only a quantity is read as a number.
- **On-screen text** — prose uses `Text` or `MarkupText`, rendered in the bundled Nunito. Formulas use `MathTex` (LaTeX). Never put prose sentences inside `Tex`/`MathTex`.
- **Colours** — use only the palette names: `TEXT`, `MUTED`, `ACCENT`, `HIGHLIGHT`, `POSITIVE`, `NEGATIVE`. They follow the project's light/dark theme, so never hardcode hex colours.
- **Layout** — keep everything inside the safe area:
  - Use `fit(mobject)` to scale anything wide down into `SAFE_W × SAFE_H`.
  - Use `MARGIN` with `to_edge`, but `BOTTOM_BUFF` at the bottom: `to_edge(DOWN, buff=BOTTOM_BUFF)`.
  - The bottom of the frame (and in portrait its right edge) is kept clear for viewers' subtitles and phone apps' buttons. Centre a full layout on `SAFE_CENTER`, not `ORIGIN`; text and formulas in that band get a layout warning. Pictures, shapes and axes may cross it.
  - Portrait projects (`PORTRAIT` is True; frame 8 wide × 14.2 tall) stack content vertically.
  - Landscape projects (14.2 × 8) can place things side by side.
- **Timing the timeline can edit**:
  - Call `self.play(...)` and `self.wait(...)` directly in `construct`.
  - Give `run_time=` as a plain number.
  - The editor can drag those clips to retime them. Clips inside helper functions or with computed durations are locked.
- **Your pictures and videos** — files the user added in Studio's Media panel are in `media/`:
  - `image("photo.png")` is a picture, already scaled to fit the safe area.
  - `VideoClip("demo.mp4")` plays a video inside the scene, without sound: show it, call `clip.start()`, then `self.wait(clip.duration)`.
  - Use only the files Studio lists for this project; `media_path(name)` raises with the list if a name is wrong.
- **PDF sources** — PDFs the user added in Studio's Sources panel are in `sources/`: notes, worksheets, textbook chapters to make the video from.
  - Read their text with `read_source` and look at their pages with `view_source_pages`, not with Read.
  - Follow the material: its order, notation, examples and numbers. Explain it rather than read it out, and don't add claims it doesn't make.
  - Rebuild formulas and graphs with `MathTex` and manim so they animate.
  - Show the page itself when the original matters (the exercise as printed, a figure): `pdf_page("notes.pdf", 3)` is page 3, and `crop=(left, top, right, bottom)` keeps part of it, in fractions of the page from its top-left corner. Find the crop with `view_source_pages`.
- **Thumbnail** — call `self.thumbnail("A short hook")` once, right after the animation that completes the video's key picture: the core idea fully on screen, nothing half-drawn. The hook is 2 to 5 words in the narration language that make someone want to watch ("Why the vertex is the minimum"), not the title. The exported thumbnail shows that frame with the hook and the episode number on its left, so keep the key picture near the middle.
- **Pacing** — take the time each idea needs to be explained clearly; there is no target length. One idea per section. Leave about 0.5 s of stillness after an important result.
- **Tone** — Studio tells you the project's tone (professional, warm or playful). Follow it unless the user asks otherwise.

## Checking your work

After every change, call `render_preview`. If it reports an error, fix it. If it reports layout warnings (off screen, overlapping text), fix those too.

Then call `view_frames` at the moments you changed. Don't call something done before you have looked at it.
