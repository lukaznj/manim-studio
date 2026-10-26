---
status: accepted
date: 2026-10-26
---

# 0050 — Series production belongs inside its course

## Context

The library's large series panel was the only place to follow unattended production. Opening an unfinished lesson showed an empty or partial player and the tutor/transcript panel, without the run's pause, recovery or agent-switch controls. Progress for an unrelated course also took over the library.

## Decision

- Replace the library-wide panel with a compact status and completion count on the active series card. Opening it leads to the course workspace. Starting an unattended series opens that workspace automatically.
- Keep Production in the course sidebar beside its lesson/exercise navigation. It opens an overview with completed-episode count, each lesson's production stage, per-episode pause/resume and the run's Pause, Resume, Stop and Continue actions. Finished lessons remain selectable while others are made. Course renaming remains available in the sidebar.
- Selecting an unfinished lesson shows a focused task view: its stage, current activity, actual export percentage when available, pause/recovery controls and errors. Do not mount the player, transcript or tutor until the series marks that lesson done, even if a preview or partial export exists. Added lessons and follow-ups use the same unfinished-content treatment with their own retry action. Exercise solution workflows remain unchanged.
- A finished selected lesson becomes a normal study view without autoplay; production remains reachable through the sidebar. Refresh exported media when an episode completes. Unrelated courses never inherit another run's production controls. The overview does not require an episode project to be open.
- Keep usage-limit takeover, account-wide usage and developer-only model comparisons, API estimates, elapsed times and HTML reports. Usage is expandable, rather than taking up the main overview. The sidebar signals usage-limit attention while the user watches another lesson. Use real completed-episode counts for overall progress, not an invented percentage for writing or reasoning.
- Persist production history with the course's existing run checkpoint. Dismissing the active run unpins it without deleting that history. A stopped historical course can be continued from its own workspace, subject to the existing one-active-series rule. A failed episode can be retried independently; retain its failure stage so a failed check/export need not redo its script/video.
- Use the existing tokens and native/CSS controls, support both themes and reduced motion, and localize the new compact labels in all interface catalogs. Move the progress tour step into the study workspace.

## Consequences

This replaces the Home-panel placement in [[0023-parallel-series-episodes]] and extends [[0041-focused-study-workspace]] with a production state. Disk formats gain optional production/failure-stage metadata; existing courses remain readable. The scheduler, credentials, voice pipeline and recovery rules from [[0049-series-recovery-and-shutdown]] remain shared rather than reimplemented in the UI.
