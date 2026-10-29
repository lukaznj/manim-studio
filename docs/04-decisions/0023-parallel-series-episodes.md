---
status: accepted
date: 2026-10-15
---

# 0023 — A series makes several episodes at once

## Context

An unattended series (ADR 0019) made its episodes one after another, each in the window through the chat, like quick mode. A course of eight lectures took most of a day. Most of an episode's time is the agent writing the scene, rendering and looking at frames, which doesn't depend on the other episodes. What does depend on them is the script: each episode's series.md says what the earlier ones actually cover ("As made", from their script.md), so episode 5 can say "in episode 2 we saw…".

## Decision

- **Scripts in order, videos as soon as they can.** One agent writes the episodes' scripts one after another, each with series.md listing what the scripts before it cover. Each episode's video starts as soon as its script is approved, on its own agent. All eligible videos can run alongside the script writer by default. An optional app-wide agent budget in Settings prioritizes finishing active videos ([[0058-independent-production-jobs]]). Old `seriesAgents` settings and run `agents` fields are ignored. Developer measurement runs remain sequential because overlapping work invalidates their timings (ADR 0040). (At first every script was written before any video started; with 15 episodes the first video waited an hour or more.)
- **Background agents** (`src/main/agent.ts`): one Claude session per episode, outside the window, with the chat's tools and permissions bound to that episode's project (`claude.ts` `studioOptions(dir)`). The video pass resumes the script pass's session. Each records its conversation in the episode's chat.json and commits after each turn, so opening the episode later shows what it did and the chat can carry on.
- **Per-project renders.** Preview renders, frames and the PDF-source tools take a project folder; the open project's renders still report to the window, the others run unseen. While an agent works on an episode, the chat in that project waits.
- **Studio's check** (`quick.ts` `checkAndFix`) runs on each episode as in quick mode; a passing episode is queued for export at once while other ready episodes keep running.
- **Usage limits** pause an agent until the reset, then it carries on (`turnPastLimits`).
- **The course shows its run** ([[0050-course-production-workspace]]): an overview and focused unfinished-lesson views retain each episode's state, activity, Pause/Stop/Continue controls and developer reports. Home only shows compact progress on the series card.
- **The run is its states.** A loop (`series.ts` `drive`) hands out the work from each episode's state, and the run is saved in the series folder (`.studio/series-run.json`) on every change. So pausing (the series, or one episode, whose script the writer then skips), stopping and continuing are only states. Stopped also cancels the exports. Continue, also after quitting the app, gives an interrupted step its agent session back with "carry on where you stopped", exports again what didn't finish, and retries what failed.
- **Its own models** for planning and for the episodes, from Settings → Agent since [[0045-series-planner-and-maker]]; the chat keeps its own choice.
- **Recovery and shutdown** are strengthened by [[0049-series-recovery-and-shutdown]]: atomic backed-up checkpoints, creation journals, planning drafts, durable export receipts, one scheduler per course, and cancellation that settles before quit. Local exports cancel on series/episode pause and resume from their caches later, releasing the shared queue.
- **Developer comparisons** can assign each Learn episode its own connected provider and model; the assignment covers its script, video and fixes and survives restarts ([[0038-developer-episode-model-comparison]]).
- **Codex** kept the old one-at-a-time path at first; since [[0033-every-agent-in-the-background|ADR 0033]] Codex and Antigravity run the same background agents.

## Consequences

- Ready episodes run without an application agent-count limit. Account limits still wait or follow the configured fallback order. Users retain per-episode and whole-series Pause/Stop controls. Preview work may overlap; final exports remain serialized per render machine.
- Scripts written one after another keep the episodes consistent; the scene pass can't refer to details only another episode's code has.
- Opening an episode while its agent works shows its renders, but its chat is closed until the agent is done.
