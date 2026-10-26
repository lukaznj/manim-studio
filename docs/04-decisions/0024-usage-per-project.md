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
- **Subscription accounts show reported account usage.** Claude and Codex expose whichever usage windows their managed client reports (including five-hour and weekly limits), with used percentages and reset times. These are account-wide and shared with other apps, never attributed as a video's or episode's exclusive consumption. Missing counters, including Antigravity's, are unavailable rather than synthetic zeros. The series panel, chat meter and Accounts show the provider actually being used; a running series keeps its captured provider independently of the current Settings selection.
- **Project breakdowns show recorded tokens** by model, step and turn. No conversion from tokens or API prices into subscription-limit percentages is made.
- **Prices are estimates using API rates, not subscription charges or invoices.** Series totals and per-episode estimates are developer-only. Project prices are visible outside developer mode only when every logged turn records API-key authentication and has a reported price. Mixed, legacy (unknown auth) and unpriced usage retains token detail without a dollar amount. New turns capture their auth mode when execution starts; changing Settings does not relabel historical turns.

## Consequences

- Turns before this version aren't counted.
- Codex and Antigravity turns retain their reported tokens (ADR 0040); absent prices remain unknown. Developer reports keep API-equivalent comparisons.
