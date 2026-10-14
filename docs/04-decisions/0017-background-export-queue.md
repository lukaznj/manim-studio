---
status: accepted
date: 2026-10-14
---

# 0017 — Exports run in a background queue, each on a copy of its project

## Context

An export blocked the app: the dialog stayed open until it finished, and the export rendered "whatever project is open", so opening another project broke it. Exporting takes minutes, and the point of an export is often to move on to the next video. A future remote render worker needs a self-contained job format anyway.

## Decision

- **A queue in the main process** (`src/main/exports.ts`) runs exports one at a time. The dialog only collects the choices: Export queues the job and closes.
- **Each job works on a copy of its project** (`snapshotProject` in `export.ts`): everything but `.git`, `.studio` and earlier exports, in `<userData>/export-jobs/<id>/`, deleted afterwards. The project can be edited, closed or swapped for another while it exports, and every theme of one export renders the same source.
- **The copy shares the project's render cache** (`STUDIO_CACHE_DIR`), so unchanged animations aren't drawn again. Narration the copy generates is copied back into the project, so it's never paid for twice.
- **The title bar's Exports button** shows the running export's progress on every screen, and opens the list: stop, show the files, remove. A system notification says when an export is done or failed.
- **Jobs live in memory.** Quitting while exports run or wait asks first.
- Claude Desktop's `export_video` queues a job the same way and waits for it.

## Consequences

- One export at a time on one machine: exports use one core each, so the next step is splitting one export across cores, then sending jobs to a remote worker in the same format (the copy is exactly what gets uploaded).
- Copying a project with large videos in `media/` costs disk space and a few seconds per export.
- A queue that survives a restart would need the jobs on disk; not needed yet.
