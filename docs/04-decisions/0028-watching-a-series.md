---
status: accepted
date: 2026-10-15
---

# 0028 — A series can be watched: a player, a transcript, a chat that knows the moment, follow-up videos

## Context

A finished series is studied more than it's edited. The editor is the wrong place to watch an episode, and a question about "this part" means nothing to the agent unless it knows which moment of which video. Exercise sets (ADR 0025) already had a player and a tutor-style chat.

## Decision

- **A Watch screen** (merged into the study screen by ADR 0030) for a series (Home → the series → Watch; `WatchView.tsx`, `src/main/watch.ts`): its episodes in order, each with its follow-ups; the exported video (the preview until there is one) in the shared study player (chapters, speed, subtitles, and where you left off, per video, on this computer); a transcript that follows the video, where a line jumps there or goes to the chat as a question; and the chat.
- **The chat knows the moment.** On the Watch and exercises screens a message carries `watchingAt`: Studio attaches the frame there and a note (`shared/moment.ts`) with the time, the section and the narration around it, and asks for a tutor's answer without changing files. The agents' own turns stay out of that chat (`ChatMessage.auto`).
- **Follow-up videos.** "Explain this part in a new video" makes a new project in the series folder's `extras/`, with `meta.extra` (which episode, where, what was asked), the episode's script as `episode-script.md` and the series bible. A background agent (ADR 0023) makes a 2–4 minute video that picks up from that moment and goes slower, then Studio checks and exports it. It's listed under its episode, not as an episode, and not on Home.
- **Narration reads labels as names:** R₂₃ is "R two three" ("er dva tri"), not "twenty-three" (project guide and brief).

## Consequences

- An episode is watched with the subtitles players would show, and a question costs no render; a follow-up costs a video.
- Follow-ups need a signed-in agent (any, since [[0033-every-agent-in-the-background|ADR 0033]]) and an episode's preview or export to ask from.
- **Watched marks** for episodes, follow-ups and exercises (`.studio/watched.json` in the project): set when playback passes 90%, or by hand; the lists show them and count them.
- Later: a quiz at the end of an episode, the whole series joined into one lecture.
