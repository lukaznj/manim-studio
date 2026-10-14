---
status: accepted
date: 2026-10-14
---

# 0020 — Parallel exports through the shared render cache

## Context

An export renders every animation at full quality in one manim process. Exports run in the background ([[0017-background-export-queue]]), but a long video still takes minutes, and quick and series mode make many of them.

## Decision

- **Fill the cache in parallel, then render once.** Before each theme's final render, `renderSlices` (`src/main/export.ts`) starts several processes that each draw a slice of the animations (`studio_runner render --from N --upto M`). The pieces of every slice that succeeded go into the project's render cache, and the normal final render finds them there and only joins them. The timeline, the subtitles, the narration and the result are exactly those of one render; a failed slice only costs time.
- **Each slice works in its own folders** (cache and partial movies), seeded with the project's text and formula caches: sharing them let one process read another's half-written file. Pieces are copied into the shared folder only from slices that finished.
- **Slices use only narration that exists** (`STUDIO_VOICE_OFFLINE`): several slices generating the same sentence would pay ElevenLabs for it several times. What's missing gets estimated silence in the slice, and the final render makes it once.
- **Partial movies live in the project's cache**, one folder per size and frame rate (`.studio/cache/partial/1920x1080@30`), for every render. Before, they sat next to each render's output, so exports of a project's copy couldn't reuse them.
- **How many slices:** one per two cores (the encoder already uses about two), one per 2.5 GB of memory, at least 8 animations each, at most 6. Short videos aren't split.

## Consequences

- About 2× faster on long videos on an 8–10 core machine (measurements in [[../02-architecture/render-performance|render performance]]); little gain on short ones.
- Renders made before this change can't reuse their old partial movies once; they're drawn again into the new folder, and the old folders are left behind in `.studio/`.
- The same slices are what a remote render worker with many cores would run.
