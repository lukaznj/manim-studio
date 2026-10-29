---
status: accepted
date: 2026-10-29
---

# 0058 — Independent production jobs and an optional agent budget

## Context

The singleton series controller refused a second course, including when the first was paused. A rejected start could discard an editable plan. Quick video had the same singleton restriction. Removing the old per-series agent count also made it easier to spread account usage over many unfinished episodes. Exports were queued, but preview renders from separate projects could still compete for the machine.

## Decision

- Each course has its own controller, agent sessions, cancellation generation, task tracking and atomic run checkpoint. A local registry remembers all controllers across restart. Pause, Stop, Continue, fallback selection, retry and dismissal target the owning course. Unreadable checkpoints remain registered for later recovery.
- New courses start alongside existing courses by default. An explicit **Queue series** action offers FIFO deferred starts; a paused course does not block that queue. There is no limit on the number of courses or videos a user may create. Starting or continuing work authorizes queue processing for that app session; restoring the app never silently resumes agent work.
- Archive the complete editable plan before attempting project creation. **Save plan** also archives it without starting production; **Saved plans** restores it for editing. Keep the existing live draft and creation journal. A rejected start cannot lose its plan.
- Quick videos have independent controllers and checkpoints under the app's `quick-videos/` directory. Migrate the old singleton checkpoint, recover working jobs as stopped, and reuse completed export receipts. The library and title-bar job menu can reopen each job. Updates from one job never replace another project's progress page.
- **Agents at once**, in Settings → Agent, is an optional app-wide background-turn budget. Its default is **Unlimited**. Enabling a limit initially offers three slots and accepts any positive integer. It covers course, quick, exercise and additional-video agents. Interactive chat remains available. Old per-series limits remain ignored.
- Slot selection prefers checking/fixing work, then scene implementation, then new scripts, preserving FIFO within each priority. Changing capacity applies at turn boundaries and never aborts an active turn. Cancelling a waiting job removes its request before any model turn starts. This improves the chance of finishing videos under a limited account allowance; it cannot guarantee an episode fits that allowance.
- Local Python drawing processes share one cancellable render queue, including previews and final export slices. Export assembly retains its existing per-destination queue. Authentication, PDF indexing, narration and inspection stay independent. Pausing a course cancels its local export for later cached resume, releasing the queue instead of blocking unrelated courses. Remote workers retain their own scheduling.
- Shutdown stops every controller and awaits all pending work. Each recovered course and video retains its own unfinished stage, while completed jobs remain completed.

## Consequences

Users can create and organize new work while other courses are active or paused. Unlimited agents can spend usage broadly; the optional shared budget trades parallel authoring for earlier completed work. Rendering stays bounded independently of the number of model sessions. Serial local drawing favors predictable resource use over simultaneous local export slices; remote export destinations may still work concurrently.
