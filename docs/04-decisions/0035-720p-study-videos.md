---
status: accepted
date: 2026-10-16
---

# 0035 — Render at 1080p by default, with optional lower resolutions

## Context

Exercises, follow-up videos and courses are exported in the background. This decision originally chose 720p for Learn and Both to reduce waiting. On 2026-10-23 the product decision changed to prioritize sharpness and consistent defaults: previews and exports now default to 1080p in every mode. Lower resolutions remain explicit choices.

Measured on a 24-second lesson with text and a graph, from an empty cache, on 4 cores:

| Export | Time | vs 1080p30 |
|---|---|---|
| 1080p 30 fps | 17.2 s | 1× |
| 1080p 24 fps | 12.6 s | 1.4× faster |
| 720p 30 fps | 7.5 s | 2.3× faster |
| 720p 24 fps | 6.6 s | 2.6× faster |

## Decision

- **720p is an export size** (1280 × 720), next to 1080p and 1440p in the export dialog.
- **Exports that name no size** default to 1080p in Learn, Create and Both. Settings → Video can explicitly choose 720p instead. This covers background exports of exercise sets, follow-ups, series and quick videos, as well as the export dialog. A project's explicitly chosen export size is still used again.
- **Previews also default to 1080p**, both in the app and in the Python runner. Create retains explicit 480p and 720p preview options. Existing explicit user preferences are preserved. Frame rates are unchanged.
- **No 24 fps.** On top of 720p it saves another 12%, and motion gets visibly choppier in the animations these videos are made of (moving dots, transforms). 30 fps stays the lowest.

## Consequences

- A lecture video joins only videos of one size, so exercises exported before the switch (or after changing Study videos) are asked to be exported again.
- The thumbnail card is 1280 × 720 at every size, so it doesn't change.
