---
status: accepted
date: 2026-10-26
---

# 0049 — Recover series work and checkpoint before shutdown

## Context

A series takes hours. Planning was held only by its dialog; initial project creation had no recovery journal; run files were overwritten in place. Quit confirmed only active production, did not await cancellation or export cleanup, and on Windows/Linux could close the window before asking. Pause/resume could start another scheduler loop while the first was still unwinding.

## Decision

- Save planning inputs and editable plans locally. Reopen a draft after restart; interrupted planning is explicitly restarted by the user, never silently billed again. Successful creation clears the draft. No credentials are included.
- Write JSON checkpoints through a synced temporary file and atomic rename, with a previous JSON backup. Validate series checkpoints before restoring. Use the same protection for settings, project metadata/session IDs and saved chats.
- Journal initial series creation before copying projects. Create each episode in a disposable staging folder and rename it only after project initialization. A restart finishes missing episodes in the same folder without duplicating completed ones, and leaves unattended production stopped for Continue. Keep the journal if recovery fails.
- Restore the exact unfinished stage, connected-agent assignment, session IDs and individual holds. Clear transient activity and usage-limit timers. An already approved script can advance to video. A check resumes checking rather than asking the agent to rewrite the video. Completed export receipts are committed before queue completion, so an exported episode can be recovered as done. Interrupted exports without a receipt retry from the existing render/narration cache.
- One scheduler runs per course; independent courses may run together ([[0058-independent-production-jobs]]). Pause invalidates the in-flight step before resuming; Continue waits for that course's old turns and exports to settle. Pause cancels local exports for later cached resume, releasing the shared queue; remote exports still support Stop only. Late callbacks from a dismissed run cannot update its replacement.
- During initial project creation, defer quit until the journalled transaction settles. During active planning, production, paused series, quick jobs and exports, ask before user-initiated quit, defaulting to keep working. After approval, abort planning, stop agents/exports and await cancellation, chat/checkpoint writes and export narration-copyback before exiting. Failed cleanup cancels quit and reports the error. Repeated quit requests share one operation. Update installation uses the same path.
- On macOS, closing the window while production is active hides it and keeps work running. Quit remains explicit. On Windows/Linux, closing the production window uses the quit confirmation before closing it.
- Prevent idle application suspension during active planning, episode work and unpaused exports, while allowing display sleep. Release the blocker when work pauses or finishes. This does not override lid closure, forced sleep, Force Quit or power loss.
- When the OS requests shutdown/logoff, request the platform's shutdown delay, checkpoint and exit promptly without waiting for user confirmation. Windows uses `query-session-end`; macOS/Linux use the power monitor shutdown event. The OS can impose its own deadline or force termination; checkpoints remain the fallback, not a promise to block shutdown indefinitely.

## Consequences

Ordinary quit is a controlled interruption, not a lost run. Forced termination may redo the interrupted turn or incomplete export, but committed episodes remain done. Standalone export jobs still do not survive restart; series exports are reconstructed from their saved episode stage. An idle-sleep blocker keeps long jobs moving without keeping the display lit or taking control of deliberate system shutdown.

Tests cover checkpoint corruption, recovery at every saved episode stage, quit cancellation, transaction deferral, duplicate quit requests, cleanup failure and OS shutdown during an unanswered quit dialog. The isolated app driver exercises the complete series path with stand-in agents and real rendering.
