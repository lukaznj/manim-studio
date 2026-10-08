---
status: accepted
date: 2026-10-08
---

# 0010 — 16:9 or 9:16 per project, fixed

## Context

Maturita is a phone app, so full-screen portrait video fits it, but some videos will also be shown on a projector. A scene's layout code depends on the frame's shape: positions, `next_to`, axis lengths.

## Decision

- **Chosen per project.** The new-project dialog asks for the format, "Vodoravno 16:9" or "Uspravno 9:16". It can't be changed later.
- **Frame geometry.**
  - Landscape is 14.2 × 8 units (manim's default).
  - Portrait mirrors it at 8 × 14.2, so default text sizes stay sensible.
  - Previews render at 854×480 or 480×854 at 15 fps; exports at 1920×1080 or 1080×1920 at the project's fps (30).
- **Constants for layout code.** `studio` exposes `PORTRAIT`, `FRAME_W/H`, `SAFE_W/H` and `MARGIN`, so one scene can adapt where that's cheap (the template does).

## Consequences

- A video in both formats is two projects. Claude can port one to the other.
- The layout checker always uses the project's real frame size.
