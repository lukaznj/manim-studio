# Scene conventions

Every new project gets `templates/project/CLAUDE.md`, the rules Claude follows inside a video project. In short:

- **One class.** `scene.py` has one `class Video(StudioScene)`. Start with `from manim import *` and `from studio import *`.
- **Sections.** `self.next_section("Naziv")` per part. Sections become the chapter lane of the timeline.
- **Narration.**
  - Every spoken sentence goes in a `with self.voiceover("…") as v:` block, with its animations inside the block.
  - Maths is spelled out the way a teacher says it ("x na kvadrat"), because TTS reads symbols badly.
- **Text.** Croatian prose uses `Text`/`MarkupText`, which defaults to the bundled Nunito, the maturita display face. Formulas use `MathTex`. Croatian sentences never go inside `Tex`.
- **Colours.** Only the semantic palette from `studio.brand` (`TEXT`, `MUTED`, `ACCENT`, `HIGHLIGHT`, `POSITIVE`, `NEGATIVE`), which follows the project's light or dark theme.
- **Layout.**
  - Stay inside `SAFE_W × SAFE_H`; `fit(mobject)` scales anything down into it.
  - Portrait is 8 × 14.2 units and landscape is 14.2 × 8 ([[../04-decisions/0010-fixed-aspect-per-project|ADR 0010]]).
- **Retimable code.** `self.play`/`self.wait` called directly in `construct` with literal `run_time=` values. That's what the timeline can retime.

The checks back these up: the layout checker flags anything off the frame and text overlapping text, and Claude must call `render_preview` and `view_frames` before saying it's done.
