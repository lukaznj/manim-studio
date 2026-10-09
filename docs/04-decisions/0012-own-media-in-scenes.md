---
status: accepted
date: 2026-10-09
---

# 0012 — Your own pictures and videos, inside the scene

## Context

People want photos, diagrams and screen recordings in their explainers, the way a Premiere-style editor has a media bin and tracks. In Studio, though, the video is the code and the timeline comes from each render ([[0002-timeline-derived-from-render]]). A separate media track composited after the render would be a second source of truth: Claude couldn't see it, the code wouldn't describe it, and the timeline couldn't retime it.

## Decision

- **Media lives in the project:** `<project>/media/`, filled from the **Media** tab next to `scene.py` (drop files, or Add…).
  - Files are copied in under tidy names (`My Photo.PNG` → `my-photo.png`).
  - Remove moves a file to the Trash, because a scene may still use it.
- **Scenes use media through two studio helpers** (`python/studio/media.py`):
  - `image("photo.png")`: an `ImageMobject`, scaled to fit the safe area.
  - `VideoClip("demo.mp4")`: a muted video whose picture follows the scene's clock. Show it, call `clip.start()`, then `self.wait(clip.duration)`. Decoding is done with PyAV. The decoder sits outside the mobject, since manim deep-copies mobjects while animating.
- **So media appears on the timeline like any animation.** Its FadeIn and the wait while a clip plays are clips, linked to their lines and retimable.
- **Insert** puts a ready snippet below the cursor, or at the end of the scene when the cursor isn't inside it. **Ask Claude** fills the chat box.
- **Claude knows what's there.** The project guide explains the helpers, and both the in-app chat and Claude Desktop are told the file names.
- **History:** pictures are committed with the project. Videos (`media/*.mp4` and similar) are ignored, because they're big; the rule is added to older projects on their first video import.
- **The background** can be a picture from media too (Settings → Video; see [[0013-export-versions-and-languages]]).

## Consequences

- No second timeline or compositing step: everything is still one scene, rendered by manim.
- Videos play without sound. Audio from a clip would need mixing with the narration; that's later.
- Restoring an old version doesn't bring back a deleted video, because videos aren't in the history.
