---
status: accepted
date: 2026-10-16
---

# 0032 — The study screen's transcript: lines that follow the video, and search that moves it

## Context

A learner often remembers a word, not a moment: "where did it say Thévenin?". The transcript under the Watch screen's player (ADR 0028) was a short scrolling card, exercises had none, and finding a word meant reading through it.

## Decision

- **A Transcript tab** next to Chat in the study screen's right column (ADR 0030), the default. It shows everything the video says, line by line, like song lyrics: the line being said is lit and kept in the middle, lines already said are dimmed. Clicking a line plays from it. A line's ask button puts a question about it in the chat.
- **Search what's said.** Typing marks every match and moves the transcript and the video to the first one; Enter and Shift+Enter (or the arrows) step through them, with "2 of 5". Matching ignores case, accents and spacing (`shared/transcript.ts`, tested), so it works in any narration language. Cmd/Ctrl+F on the study screen goes to the search.
- **The words come from the render's timeline** (`watchDetail`, the subtitles the narration was cut into), for lessons, follow-ups and exercises alike. After you scroll the transcript yourself, it stops following the video for a few seconds.

## Consequences

- Search covers one video at a time; a whole course's search (the exercise search covers exercises' statements and solutions) could later include what the lessons say.
- A video without narration shows no transcript.
