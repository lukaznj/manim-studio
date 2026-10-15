---
status: accepted
date: 2026-10-16
---

# 0024 — What each video used, per agent turn

## Context

Making videos got expensive, and nothing showed why: which model ran, which step (script, video, fix rounds, chat) used the most, or what the agent did in it. Claude Code's plan meter (Settings → Agent) only shows the plan's limits, shared with claude.ai.

## Decision

- **Every agent turn is recorded in its project** (`.studio/usage.json`, `src/main/usage.ts`): the step, the tokens by model (input, cache reads and writes, output) with their API price, the tool calls by name, and the time. Series planning goes into the series folder.
- **From the SDK's own numbers.** A turn's result carries per-model totals (`modelUsage`) that add up over a session, and a resumed session starts from its saved total. So an entry is the difference from that session's last one (`src/shared/usage.ts`, tested).
- **Shown where it's spent:** a cost chip in the chat's header opens the breakdown (by model, by step, every turn); a series shows each episode's cost and the total.
- **Prices are the API's.** On a Claude plan nothing is billed per token, but the proportions show where the usage went.

## Consequences

- Turns before this version aren't counted.
- Codex turns aren't recorded yet; its SDK reports tokens but no price.
