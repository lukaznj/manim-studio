---
status: accepted
date: 2026-10-15
---

# 0023 — A series makes several episodes at once

## Context

An unattended series (ADR 0019) made its episodes one after another, each in the window through the chat, like quick mode. A course of eight lectures took most of a day. Most of an episode's time is the agent writing the scene, rendering and looking at frames, which doesn't depend on the other episodes. What does depend on them is the script: each episode's series.md says what the earlier ones actually cover ("As made", from their script.md), so episode 5 can say "in episode 2 we saw…".

## Decision

- **Scripts in order, videos as soon as they can.** One agent writes the episodes' scripts one after another, each with series.md listing what the scripts before it cover. Each episode's video starts as soon as its script is approved, on one of the other agents. Together they never exceed `seriesAgents` (Settings → Agent, default 3): while scripts are still being written, the writer holds one of them. (At first every script was written before any video started; with 15 episodes the first video waited an hour or more.)
- **Background agents** (`src/main/agent.ts`): one Claude session per episode, outside the window, with the chat's tools and permissions bound to that episode's project (`claude.ts` `studioOptions(dir)`). The video pass resumes the script pass's session. Each records its conversation in the episode's chat.json and commits after each turn, so opening the episode later shows what it did and the chat can carry on.
- **Per-project renders.** Preview renders, frames and the PDF-source tools take a project folder; the open project's renders still report to the window, the others run unseen. While an agent works on an episode, the chat in that project waits.
- **Studio's check** (`quick.ts` `checkAndFix`) runs on each episode as in quick mode; a passing episode is queued for export at once and its agent slot goes to the next episode.
- **Usage limits** pause an agent until the reset, then it carries on (`turnPastLimits`).
- **Home shows the run** (SeriesPanel): each episode's state, what its agent is doing and what it cost, with Pause and Stop for the series and Pause for an episode.
- **The run is its states.** A loop (`series.ts` `drive`) hands out the work from each episode's state, and the run is saved in the series folder (`.studio/series-run.json`) on every change. So pausing (the series, or one episode, whose script the writer then skips), stopping and continuing are only states. Stopped also cancels the exports. Continue, also after quitting the app, gives an interrupted step its agent session back with "carry on where you stopped", exports again what didn't finish, and retries what failed.
- **Its own model and effort** (New series), for planning and every episode; the chat keeps the Settings choice.
- **Codex** kept the old one-at-a-time path at first; since [[0033-every-agent-in-the-background|ADR 0033]] Codex and Antigravity run the same background agents.

## Consequences

- A series finishes several times faster, but uses the plan's limits as many times faster, and renders that many previews at once on this computer. The setting lets a Pro plan or a slow machine go down to 1.
- Scripts written one after another keep the episodes consistent; the scene pass can't refer to details only another episode's code has.
- Opening an episode while its agent works shows its renders, but its chat is closed until the agent is done.
