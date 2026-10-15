---
status: accepted
date: 2026-10-15
---

# 0026 — The exported thumbnail is a card: the key picture, a hook and the episode number

## Context

The export's `.jpg` was the most "contentful" frame by pixel variation, which in practice was often the title card: big text scores high. Videos go to YouTube, where the thumbnail decides whether anyone clicks, and a series needs its episodes to look like one series.

## Decision

- **The scene marks the moment.** `self.thumbnail("hook")` in scene.py, right after the animation that completes the key picture. The recorder (`render.py`) puts `{t, text, line}` into the timeline as `thumbnail`; outside a render the method does nothing. The agent is told to add it (the project guide and the brief). Without a mark, the end of the longest section after the first (not the title).
- **Studio composes the card** after every export, locally, also for render-server exports (`studio_runner/card.py`, Pillow, which manim already brings): 1280 × 720 (720 × 1280 for portrait). It has the frame zoomed slightly and moved right, with the text beside it (below it in portrait) on the video's own background; a chalk-yellow `#13` tag for a series episode or an exercise; the series' or set's name; the hook in Nunito Black, as large as it fits in three lines; a yellow rule.
- **Colours come from the frame:** its edge colour is the background, with light or dark text by its brightness. So custom backgrounds and pictures work, not only the two themes.
- The hook falls back to the project's title. Home's card thumbnails stay plain frames, from the marked moment when there is one.

## Consequences

- Thumbnails need no editing before upload and match across a series.
- A scene without a mark still gets a card, but with the title instead of a hook. Older projects get one once their scene is marked.
- The left of the frame is behind the text: the guide asks for the key picture near the middle.

## Later

This is a first step towards making many videos ready to publish at once. Expanding it is likely: thumbnail variants to choose from, the agent writing the YouTube title, description, chapters and tags alongside the hook, a series-wide thumbnail style, and uploading straight to a channel.
