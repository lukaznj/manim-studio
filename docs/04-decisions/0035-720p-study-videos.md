---
status: accepted
date: 2026-10-16
---

# 0035 — Videos made to study are 720p

## Context

Exercises, follow-up videos and courses are watched in the app or on a laptop, not published, and every one of them is exported in the background. They were 1080p like everything else, which made a learner wait for sharpness they don't need.

Measured on a 24-second lesson with text and a graph, from an empty cache, on 4 cores:

| Export | Time | vs 1080p30 |
|---|---|---|
| 1080p 30 fps | 17.2 s | 1× |
| 1080p 24 fps | 12.6 s | 1.4× faster |
| 720p 30 fps | 7.5 s | 2.3× faster |
| 720p 24 fps | 6.6 s | 2.6× faster |

## Decision

- **720p is an export size** (1280 × 720), next to 1080p and 1440p in the export dialog.
- **Exports that name no size** use the study size in Learn and Both (Settings → Video → Study videos: 720p, or 1080p), and 1080p in Create. That covers the background exports of exercise sets, follow-ups, series and quick videos. An export from the dialog keeps the size chosen there, and a project's last export size is used again.
- **No 24 fps.** On top of 720p it saves another 12%, and motion gets visibly choppier in the animations these videos are made of (moving dots, transforms). 30 fps stays the lowest.

## Consequences

- A lecture video joins only videos of one size, so exercises exported before the switch (or after changing Study videos) are asked to be exported again.
- The thumbnail card is 1280 × 720 at every size, so it doesn't change.
