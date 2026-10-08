---
status: accepted
date: 2026-10-08
---

# 0002 — The timeline is produced by each render

## Context

A manim video is a program, not a stack of clips. A timeline stored next to the code would drift from it the moment Claude or a person edits `scene.py`.

## Decision

- **No timeline model.** Each render records every `play`/`wait`, section and voiceover block with its time and the `scene.py` line that produced it, and writes `timeline.json` ([[../02-architecture/timeline-from-render|details]]).
- **The UI only displays it.** It turns gestures into code edits: dragging a clip edge rewrites a `run_time=` literal.
- **No compositing.** There are no transitions, keyframes or video layers in the editor. manim is the compositor.

## Consequences

- Code is always the source of truth. Undo, history and Claude all work on one artifact.
- Only literal durations in direct calls can be retimed by hand. Anything computed is locked on the timeline with a reason, and the user asks Claude instead.
- Each change costs a render. manim caches unchanged animations, so preview renders take 2–10 s.
