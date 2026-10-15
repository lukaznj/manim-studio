---
status: accepted
date: 2026-10-15
---

# 0023 — A series makes several episodes at once

## Context

An unattended series (ADR 0019) made its episodes one after another, each in the window through the chat, like quick mode. A course of eight lectures took most of a day. Most of an episode's time is the agent writing the scene, rendering and looking at frames, which doesn't depend on the other episodes. What does depend on them is the script: each episode's series.md says what the earlier ones actually cover ("As made", from their script.md), so episode 5 can say "in episode 2 we saw…".

## Decision

- **Two passes.** First every episode's script, one after another, each with series.md listing the scripts before it. Then the videos, `seriesAgents` at a time (Settings → Agent, default 3), each with series.md listing every script.
- **Background agents** (`src/main/agent.ts`): one Claude session per episode, outside the window, with the chat's tools and permissions bound to that episode's project (`claude.ts` `studioOptions(dir)`). The video pass resumes the script pass's session. Each records its conversation in the episode's chat.json and commits after each turn, so opening the episode later shows what it did and the chat can carry on.
- **Per-project renders.** Preview renders, frames and the PDF-source tools take a project folder; the open project's renders still report to the window, the others run unseen. While an agent works on an episode, the chat in that project waits.
- **Studio's check** (`quick.ts` `checkAndFix`) runs on each episode as in quick mode; a passing episode is queued for export at once and its agent slot goes to the next episode.
- **Usage limits** pause an agent until the reset, then it carries on (`turnPastLimits`).
- **Home shows the run** (SeriesPanel): each episode's state and what its agent is doing, Stop, and Dismiss when it's over.
- **Codex** keeps the old one-at-a-time path: its tools reach Studio through the MCP bridge, which works on the open project only.

## Consequences

- A series finishes several times faster, but uses the plan's limits as many times faster, and renders that many previews at once on this computer. The setting lets a Pro plan or a slow machine go down to 1.
- Scripts written one after another keep the episodes consistent; the scene pass can't refer to details only another episode's code has.
- Opening an episode while its agent works shows its renders, but its chat is closed until the agent is done.
