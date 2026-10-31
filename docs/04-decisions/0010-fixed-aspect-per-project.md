---
status: accepted
date: 2026-10-08
---

# 0010 — 16:9 or 9:16 per project, fixed

## Context

Study apps and short-video platforms want full-screen portrait video, but the same lessons are shown on projectors and YouTube. A scene's layout code depends on the frame's shape: positions, `next_to`, axis lengths.

## Decision

- **Fixed source geometry.** New videos from the interface use landscape 16:9. Existing projects and explicit integration requests retain their source format. Settings no longer offers an aspect-ratio default. Source geometry is not changed when exporting.
- **Delivery shape (2026-10-31 amendment).** Create users choose landscape 16:9 or portrait 9:16 in Export. Both follows its active workspace. Learn exposes no ratio selector. The export fits the whole rendered frame and adds padding sampled from its background when necessary, keeping diagrams, narration and timings intact. The choice is remembered per project as `export.aspect`. Local and remote renders share this final local delivery step; thumbnails and dubbed video versions use its result.
- **Frame geometry.**
  - Landscape is 14.2 × 8 units (manim's default).
  - Portrait mirrors it at 8 × 14.2, so default text sizes stay sensible.
  - Previews render at 854×480 or 480×854 at 15 fps; exports at 1920×1080 or 1080×1920 at the project's fps (30).
- **Constants for layout code.** `studio` exposes `PORTRAIT`, `FRAME_W/H`, `SAFE_W/H` and `MARGIN`, so one scene can adapt where that's cheap (the template does).

## Consequences

- A video can be exported in either shape without rewriting it. A composition redesigned for another source frame still needs a separate project; fitting adds padding rather than rearranging diagrams.
- The layout checker always uses the project's real frame size.
