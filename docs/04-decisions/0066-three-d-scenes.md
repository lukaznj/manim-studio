---
status: accepted
date: 2026-11-10
---

# 0066 — 3D scenes: manim's ThreeDScene, measured through the camera

## Context

Many engineering and maths explanations need depth: surfaces z = f(x, y), vectors and planes in space, solids of revolution, fields, rotating mechanisms. manim draws these with `ThreeDScene` and its 3D camera, and a scene can combine it with `StudioScene` (`class Video(StudioScene, ThreeDScene)`), so voice, sections, the timeline, previews and exports already worked. Three things were missing. The agents were never told 3D exists, so they drew everything flat. The layout checker measured objects by their 3D coordinates as if the camera looked straight down, so a well-framed 3D scene got "goes outside the frame" warnings the agent would then chase. And a camera move showed on the timeline as `.set_value`.

## Decision

- **Every scene-writing agent gets a short 3D brief** (`shared/three-d.ts`): Studio's own agents through `studioPrompt`, Claude Desktop through its project guide. It says when 3D helps, how to declare the scene, how to set and move the camera, how to pin text to the screen, to keep surfaces coarse, and to look at frames across a camera move. It isn't in the project template, so existing projects get it too.
- **Layout checks measure what the camera draws.** With a 3D camera, `studio_runner/layout.py` measures each object through `camera.transform_points_pre_display`: projected for objects in space, unchanged for ones pinned to the screen. Off-frame, overlap and subtitle-band checks then mean the same as in 2D.
- **A camera move is one `camera` clip** on the timeline (`render._anim`), however many of the camera's trackers it animates.
- **Exports need nothing new:** the final pass renders in order and the clip cache includes the camera's state, so parallel slices can't put a rotation at the wrong angle (checked frame by frame against the preview).
- `python/tests/fixture3d` renders a 3D scene with narration; the tests assert that only a truly off-frame object is warned about and that the camera move is one clip.

## Consequences

3D videos are slower to render and export than flat ones, mostly because of shaded surfaces. Depth can hide one object behind another, which no layout check catches; the agent has to look at the frames. manim's OpenGL renderer is not used: everything stays on the Cairo renderer that the rest of Studio relies on.
