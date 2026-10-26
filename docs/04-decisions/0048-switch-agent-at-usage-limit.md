---
status: accepted
date: 2026-10-25
---

# 0048 — Carry on with another agent at a usage limit

## Context

When a plan's usage limit stopped a series or an exercise set, its agents waited for the reset, sometimes for hours. A user who was also signed in to another agent, or had an API key saved, had no way to use them for the waiting work. On Codex and Antigravity a limit wasn't recognised at all: the episode failed.

## Decision

- **While episodes wait on a limit, show the reset time and a button per alternative.** This appears in Home's series panel and on an exercise set's study page (`LimitSwitch.tsx`). The alternatives (`agentRoutes`) are:
  - each other agent that's signed in, using the method Settings → Accounts chose for it
  - a saved Claude or OpenAI key, when that agent normally uses its account

  Antigravity keeps its sign-in in its own settings files, so it only offers the method Settings chose.
- **Choosing one switches the whole run.** For a series, that's its agent, sign-in and model, taking that agent's "making the episodes" model from Settings ([[0045-series-planner-and-maker]]). For an exercise set, it's the set's agent. Every turn waiting on the limit ends at once (`turnPastLimits` `moved`). Its episode opens the new agent and carries on from the project's files ("Another agent was working on this…"). Later steps use it too. An explicit switch also replaces unfinished developer-comparison assignments and their sign-in method. Completed episodes and episodes already exporting keep their assignments. Metrics preserve the initial selection and record agent changes so a mixed episode is not presented as a single-model benchmark. This supersedes the original 0.12.1 exclusion of comparison episodes.
- **The sign-in choice applies to that run only.** It's passed per session: Claude's environment, Codex's client key. The chat and Settings don't change.
- **Codex and Antigravity limits wait like Claude's.** An error that reads like a usage limit is treated as one, with an unknown reset, so the agent tries again in half an hour, and the switch is offered meanwhile.

## Consequences

A run can finish on a different agent than it started with, and its chat history in each episode shows both. A switched exercise set reverts to Settings after a restart; a series keeps its switch in its saved run.
