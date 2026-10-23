---
status: accepted
date: 2026-10-23
---

# 0042 — Resume and optional continuous course playback

## Context

The study player stored rounded positions against export filenames and ignored the first three and last five seconds. Re-exporting a lesson lost its history. Courses also required manually selecting every episode, and the native speed selector did not match the player.

## Decision

- Save fractional playback positions per project in this computer's app profile, including exercises and follow-ups. Save periodically and on seeking, pausing, navigation and app closure. Read the old filename-based history when no project history exists. An ended video reopens at its beginning; an interrupted video resumes paused even near its beginning or end. Re-exporting at the same project path retains the position, clamped to the new duration.
- Add an accessible Autoplay next lesson switch to series players, off by default and remembered in Settings. On completion, advance only to the immediately following exported, ready episode, starting at zero. Stop at an unfinished lesson or the end of the series. Follow-ups and exercises do not advance automatically. Manual selection continues to resume paused.
- Retain the player's fullscreen container between lessons. Only the video source changes, so continuous playback stays in fullscreen without an intermediate page transition.
- Remember playback speed across study videos and app restarts. Use a compact button with a native top-layer popover, radio choices, keyboard navigation, outside-click dismissal and an initial Escape that closes the menu before exiting fullscreen. Offer 0.5× through 2×. Keep the toolbar a single row.

## Consequences

This refines playback in [[0028-watching-a-series]] and [[0041-focused-study-workspace]]. Watched marks remain separate and keep their existing 90% threshold. History remains local to this app profile, rather than syncing between computers or moving with project folders. No additional runtime dependency or IPC is required.
