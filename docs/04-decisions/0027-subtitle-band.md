---
status: accepted
date: 2026-10-15
---

# 0027 — New projects keep a band clear for viewers' subtitles

## Context

Exports ship subtitles as files (.srt/.vtt), not burned in, so YouTube and other players draw them over the bottom of the video. A formula or label there disappears exactly when someone reads along, and those viewers (non-native speakers, sound off, hard of hearing) are a large part of a maths audience. In portrait, Shorts and TikTok also cover the bottom and the right edge with their own interface.

## Decision

- **Projects made from now on** carry `captionBand: true` in project.json. Older projects keep the even 0.5-unit margin they were made with, so finished videos don't shift or gain warnings.
- **The band:** the bottom 1.1 units in landscape (about 14% of the height), the bottom 2.6 units in portrait (about 18%) plus the right 0.9 units for the apps' buttons. The top and the other sides keep the 0.5 margin.
- **In scenes** (`studio`): `SAFE_W` and `SAFE_H` leave the band out, so `fit()` follows; `SAFE_CENTER` is the middle of what's left, and `BOTTOM_BUFF` (and `RIGHT_BUFF`) go with `to_edge`. For older projects these equal the plain margin and `ORIGIN`.
- **A layout warning, not a rule:** text and formulas reaching into the band are reported like off-screen text, and the agent fixes them as it fixes the others. Pictures, shapes and axes may cross it, so a full-frame picture or a graph running down still works.
- **The editor's preview** outlines the band (`shared/caption.ts` holds the same sizes as fractions).

## Consequences

- Landscape loses about 6% of its height to the band beyond the old margin; a tall stack of equations is scaled down a little more.
- Layouts centred on `ORIGIN` sit slightly low; the guide and the brief ask for `SAFE_CENTER`, and the warning catches what still lands in the band.
