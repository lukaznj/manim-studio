# Render performance

Notes for when render time becomes worth working on. Nothing here is planned yet; an item gets an ADR when it's picked up ([[../01-product/roadmap|roadmap]]).

## How a render works today

`studio_runner render` uses manim's default **Cairo renderer**, on the CPU, in one process. For every `play()` and `wait()`, manim:

1. updates every mobject in Python, frame by frame (interpolation, copies, updaters)
2. rasterizes the vector paths with Cairo
3. pipes the frames to ffmpeg, which writes a partial movie
4. concatenates the partial movies into the video

There's no GPU anywhere in this. The caches:

- **Partial movies** in `.studio/cache/partial/<width>x<height>@<fps>/`, shared by every render of the project (previews, exports of its copies, slices of a parallel export). An animation with the same hash as before is reused, not drawn again.
- **LaTeX** (`MathTex` → latex → dvisvgm → SVG), once per formula.
- **Text** (Pango → SVG), once per string and style.
- **Narration**, once per sentence and voice (`voice/tts/`).

Preview: 854×480 at 15 fps (Settings → Preview). Export: 1080p or 1440p at 30 or 60 fps, chosen in the export dialog ([[../04-decisions/0013-export-versions-and-languages|ADR 0013]]).

## Measurements

- A 45.7 s scene (Text, MathTex, a `pdf_page` crop, system voice) previewed in 8.7 s on a Ryzen 5 3600 under Windows 11, warm caches. That's about 690 frames.
- The same scene exported (dark only, one language), each combination the first time at that size, so no partial movies were reused:

  | Export | Time | vs 1080p30 |
  |---|---|---|
  | 1080p 30 fps | 38 s | 1× |
  | 1080p 60 fps | 58 s | 1.5× |
  | 1440p 30 fps | 54 s | 1.4× |
  | 1440p 60 fps | 84 s | 2.2× |

  Less than frames × pixels would suggest: part of every export (Python start, LaTeX and narration from the cache, copying the video, the thumbnail) doesn't depend on either.
- Not profiled yet: how that time splits between Python, Cairo, encoding, interpreter startup and LaTeX.

## Likely bottlenecks

- **Python per frame.** manim moves and copies mobjects in Python every frame; in 2D explainer scenes this is usually the larger part.
- **Cairo.** C, but single-threaded.
- **Startup.** Starting Python and importing manim costs a few seconds per render on Windows, which is a large share of a short preview.
- **First-time costs.** LaTeX for new formulas (about a second each), and network round trips for new ElevenLabs sentences.

## Options, roughly by payoff for effort

1. **Profile first.** `py-spy record` on one preview and one export, on Windows and macOS. It decides which of the next items is worth doing.
2. **A warm render worker.** A Python process that stays up between renders, like the TTS worker (`studio_runner tts-worker`). It saves interpreter start and the manim import on every preview. manim keeps global state between scenes, so the worker needs a clean `config` per render, or a restart when that isn't possible.
3. **Parallel exports. Done** ([[../04-decisions/0020-parallel-exports|ADR 0020]]). Slices of the animations are drawn by separate processes (`--from`/`--upto`, manim's `from_animation_number`/`upto_animation_number`), each into its own folders; their pieces move into the shared cache, and the normal final render only joins them.
   - Measured on a 10-core M1 Pro, 1080p30, from an empty cache: a 1-minute, 40-animation scene took 21 s instead of 27 s (4 slices); a 3-minute, 120-animation scene 39 s instead of 72 s (4 slices), and 40 s in the app with 5.
   - One render already uses about two cores (the video encoder is threaded), which is why the gain is about 2× rather than the number of slices. Short videos gain little: each slice starts Python and manim and fast-forwards to its first animation.
4. **Keep the cache hitting.** Randomness, time-dependent values and some updaters change an animation's hash, so manim draws it again. A layout warning or a note in the project's CLAUDE.md could steer Claude away from those.
5. **Hardware encoding for exports.** NVENC, Quick Sync or VideoToolbox through ffmpeg, where available. It speeds up the encode only, so it's a modest gain.
6. **The OpenGL renderer** (`--renderer=opengl`, GPU through moderngl). It's less mature in manim Community Edition: partial-movie caching doesn't work, some mobjects behave differently, and `render.Recorder`'s hooks assume Cairo. It also depends on each user's graphics drivers. It would help crowded or 3D scenes more than typical 2D ones. Worth it only if render latency becomes the bottleneck after the items above.

## What wouldn't help

- **Rewriting the app** (in Rust or anything else). The app starts the render and shows the result; it isn't in the hot path.
- **Rewriting the renderer.** That means rewriting manim. The heavy lifting is already in C (Cairo, numpy, ffmpeg), and the scenes Claude writes rely on manim's Python API, so a new engine would have to copy that API or give up what Claude knows about manim. Native speedups of particular hot spots inside manim are possible, after profiling, without leaving it.
