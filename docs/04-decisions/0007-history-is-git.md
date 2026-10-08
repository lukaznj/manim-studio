---
status: accepted
date: 2026-10-08
---

# 0007 — Version history is git, committed automatically

## Context

Claude makes large edits, and admins need a way back. A custom undo system would duplicate what git already does.

## Decision

- **A repository per project,** through isomorphic-git (pure JS, so no git install is needed).
- **Automatic commits:** after every successful preview render that changed something ("Uređivanje"), and once at the end of every Claude turn ("Claude: <first line of the request>").
- **Restoring:**
  - The history popover lists the commits.
  - "Vrati" first commits the current state ("Prije vraćanja"), checks out the chosen commit's files, then commits that as a new version.
  - Nothing is ever lost.
- **Ignored:** `.studio/` (renders) and `exports/`.

## Consequences

- Projects can be pushed to a shared remote later for collaboration. Nothing in the app depends on that.
- Voice audio is binary in git. That's acceptable at this scale (minutes of audio per video).
