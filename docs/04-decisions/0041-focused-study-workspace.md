---
status: accepted
date: 2026-10-18
---

# 0041 — A focused study workspace with expandable course lessons

## Context

The study screen showed lesson and exercise navigation together, a global exercise search above lessons, many chapter chips and a second video-creation action. Lyrics-style transcript padding left a large empty area. Native video controls did not match the rest of Studio. Existing courses also had no way to add a full lesson.

## Decision

- The course sidebar switches between Lessons and Exercises. Its exercise footer offers Add exercises and relevant pause/resume controls, without the lecture-video shortcut. Exercise search and exercise actions appear only in Exercises; the search still covers all sets. Lessons have their own title search when the list is long. Switching lists does not interrupt the current video.
- [[0050-course-production-workspace]] adds the course's production overview and unfinished-lesson task views. While a selected lesson is being made or awaits recovery, its player and tutor/transcript are omitted; completed lessons retain the study layout described here.
- Use a compact, keyboard-accessible video control strip: seeking with chapter markers, play/pause, skips, volume, subtitles, speed and full screen. A Chapters icon opens a numbered, timestamped chapter browser. Chapter numbers and names stay in that browser, without an extra row beneath the controls. Resume and continuous playback are refined in [[0042-study-playback-preferences]]; watched marks retain their existing behavior. A file reveal action remains available on load failure.
- Both sidebars collapse outward to narrow reopening rails, without unmounting their contents. The assistant has a draggable, keyboard-accessible divider: its existing responsive width is the minimum (350/300/280 px), it can grow to 640 px while keeping at least 360 px for the main content, and its preferred width and both collapse choices persist independently of the editor. Lesson actions and transcript search reopen the assistant when needed.
- Fullscreen owns the study workspace so the same assistant can dock beside the player. A fullscreen Chat control opens it paused at the current moment, with the existing transcript, tools, resize divider, drafts and saved conversation. The library and other lesson content stay hidden. The fullscreen assistant toggle is transient and leaves the windowed collapse choice unchanged; Escape closes an image/menu first, then the assistant, then fullscreen. Global settings leave fullscreen to open their dialog.
- Transcript and Chat share a persistent segmented control and crossfade as independent panels, retaining search and draft state. The transcript uses compact timestamped rows with no percentage padding. It follows the current line only when needed to keep it visible; manual scrolling pauses following until Follow video is selected. Search, line seeking, per-line questions and Ctrl/Cmd+F remain.
- [[0051-study-assistant-and-notes]] replaces the separate question/follow-up buttons and modal with a chat tools menu, composer action pills without a separate additional-video row under the player. Follow-ups remain collapsible under their original lesson, with timestamp detours and notes below the player.
- Add lesson creates a full episode from a title and topic or PDFs. It appends to `series.json`, preserves ordering, updates the series total in episode metadata and uses the course's voice, aspect, theme and notation. The selected agent makes, checks and exports the new lesson in the background. Its request/error persists in `.studio/lesson.json`; interrupted or failed lessons can be retried. A single video or standalone exercise set is not implicitly converted into a series.
- Motion uses CSS/native APIs and respects reduced motion. UI copy is English/Croatian. No new runtime dependency is needed.
- Electron's full-screen permission checks and requests permit only the main Studio web contents to control its full-screen state. Other non-media permissions remain denied.

## Consequences

The initial screen prioritizes watching and finding material. Existing projects and timelines keep their formats; only newly added lessons have the extra request state. This updates the combined-list presentation in [[0030-courses]] and the centered lyrics presentation in [[0032-searchable-transcript]], while retaining their underlying workflows.
