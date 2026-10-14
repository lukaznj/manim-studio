# Manim Studio knowledge base

This folder is an [Obsidian](https://obsidian.md) vault. Open `docs/` as a vault to get backlinks, graph view and search. It's also plain markdown, so it reads and diffs fine without Obsidian.

## Layout

- `01-product/`: what the app is, who uses it, what's next ([[01-product/product-overview|overview]], [[01-product/roadmap|roadmap]])
- `02-architecture/`: how it works
  - [[02-architecture/system-overview|processes and data flow]]
  - [[02-architecture/timeline-from-render|the timeline contract]]
  - [[02-architecture/voice-pipeline|voice]]
  - [[02-architecture/render-performance|render performance]]
- `03-video-authoring/`: how a video project is written ([[03-video-authoring/scene-conventions|scene conventions]])
- `04-decisions/`: one note per non-obvious decision. The [[04-decisions/README|index]] lists them with status, and new ones start from [[04-decisions/_template|the template]].
- `05-design/`: the UI's design language and screenshots
- `06-operations/`
  - [[06-operations/development|running it locally]]
  - [[06-operations/releasing|releasing and auto-update]]
  - [[06-operations/known-issues|known issues]]

## Conventions

- One topic per note, short filenames, link liberally with `[[wikilinks]]`.
- Prefer a decision note over a long comment thread. Decisions rot less when they're addressable.
- This vault is the source of truth for *why*. `CLAUDE.md` and `.claude/rules/` are the source of truth for *how to work in the repo*.
- When a PR makes or changes a decision, add or update an ADR and its row in the index in the same PR. A pure refactor or bugfix needs no docs change.
