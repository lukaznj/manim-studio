---
status: accepted
date: 2026-11-01
---

# 0062 — Save video: a copy anywhere, subtitles as a file or burned in

## Context

Exports land in each project's `exports/` folder, named for YouTube (ADR 0013). Getting a finished lesson or video out to send it, keep it or put it on a phone meant finding that folder. Its file names are slugs, and its subtitles sit beside it as `.srt` and `.vtt` that many players and messaging apps ignore.

## Decision

- **Save video** copies a project's newest export (the same one the study screen plays) into a folder the user picks: Downloads at first, then the last folder used. The copy is named after the video's title, made safe for every file system, with "(2)" when the name is taken. It's offered on lessons, exercises, a project card's menu on Home, and finished exports in the exports list.
- **Subtitles, three ways:**
  - **As a file** (the default): the export's `.srt` beside the copy with the same name, which most players load by themselves and YouTube takes as captions.
  - **Burned in:** `studio_runner burn-subtitles` turns the `.srt` into an ASS script at the video's resolution, styled from the viewer's subtitle preference ([[0060-playback-subtitle-style]]) and placed inside the band projects keep clear for subtitles ([[0027-subtitle-band]]). ffmpeg (libass, already in the environment) re-encodes with x264, reporting progress.
  - **None.**
- The last folder and choice are remembered (`settings.saveCopy`). An unexported project says to export first; nothing is rendered by Save video.

## Consequences

Burning in re-encodes the whole video, so it takes a while for long videos, and its quality follows x264 CRF 18 rather than the export's encoder. Only the narration's language is offered; dubbed exports keep their per-language files in `exports/`.
