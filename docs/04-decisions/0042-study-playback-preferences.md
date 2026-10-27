---
status: accepted
date: 2026-10-23
---

# 0042 — Resume and optional continuous course playback

## Context

The study player stored rounded positions against export filenames and ignored the first three and last five seconds. Re-exporting a lesson lost its history. Courses also required manually selecting every episode, and the native speed selector did not match the player.

## Decision

- Save fractional playback positions per project in this computer's app profile, including exercises and follow-ups. Save periodically and on seeking, pausing, navigation and app closure. Read the old filename-based history when no project history exists. An ended video reopens at its beginning; an interrupted video resumes paused even near its beginning or end. Re-exporting at the same project path retains the position, clamped to the new duration.
- The course sidebar uses this same local history for a thin yellow position line and remaining video time on started lessons, additional explanations and exercise videos. Rows update about once a second and on seeking or pausing. Completed playback shows a full line, and simply reopening it at zero preserves that completion until replay starts. Production states take precedence. Position is a resume marker rather than a measurement of unique seconds watched; the existing manual/90% watched marks remain independent.
- Add an accessible Autoplay next lesson switch to series players, off by default and remembered in Settings. On completion, advance only to the immediately following exported, ready episode, starting at zero. Stop at an unfinished lesson or the end of the series. Follow-ups and exercises do not advance automatically. Manual selection continues to resume paused.
- [[0051-study-assistant-and-notes]] adds voluntary additional-video detours that return to the original lesson at the captured position and playing state. Manual navigation cancels the return.
- Retain the study workspace as the fullscreen container between lessons, with the player DOM unchanged. Only the video source changes, so continuous playback stays in fullscreen without an intermediate page transition. This also allows the existing assistant to dock beside the video (see [[0041-focused-study-workspace]]).
- Remember the last selected lesson, additional video, course exercise or production overview per course in the local app profile. Reopening restores that view, while an explicit lesson link takes precedence. Removed or unrelated saved paths fall back safely. This complements each video's existing playback-position resume.
- Remember playback speed, volume, mute and subtitle visibility across all study videos and app restarts, including manual selection, automatic advance, exercises and follow-ups. A video without subtitles does not change the saved subtitle preference. Apply these preferences before automatic playback starts.
- Use a compact speed button with a native top-layer popover, radio choices, keyboard navigation, outside-click dismissal and an initial Escape that closes the menu before exiting fullscreen. Offer 0.5× through 2×. Keep the toolbar a single row.

## Consequences

This refines playback in [[0028-watching-a-series]] and [[0041-focused-study-workspace]]. Watched marks remain separate and keep their existing 90% threshold. History remains local to this app profile, rather than syncing between computers or moving with project folders. No additional runtime dependency or IPC is required.

The current chapter title occupies the centre of the player toolbar and opens the chapter list. It follows seeking and playback, truncates long names with the full title in its tooltip, and replaces the separate chapter icon. Narrow players hide the volume slider and skip buttons before compromising chapter navigation.
