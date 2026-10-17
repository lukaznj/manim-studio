---
status: accepted
date: 2026-10-17
---

# 0040 — Episode measurements produce local HTML reports

## Context

Model comparisons need usage, phase timing and resource curves. Claude's turn logs already contain tokens and API-equivalent cost; the Codex and Antigravity adapters were discarding their reported token counters. Account plan percentages and device hardware counters cannot be attributed precisely while episodes overlap.

## Decision

- Develop has independent usage, timing and hardware switches, off by default. A new unattended series captures them. Any enabled measurement serializes whole episodes, including export, irrespective of the normal parallel-agent setting. Existing unmeasured series retain their scheduling.
- Keep per-project reported turn counters. Codex's cached input is part of input_tokens and must not be counted twice. Preserve original CLI usage fields, including Antigravity's total/thinking counters. Do not invent token prices for providers that omit them. Counts arrive at turn completion, so usage graphs are step curves rather than interpolated token rates. Interrupted turns may omit usage.
- ElevenLabs requests append character-cost response headers, requested text length, model, timestamp, cache flag and success to a local JSONL ledger. Cache hits have zero new billing; absent or malformed billing headers remain unknown. Narration and secrets never enter this ledger. Export snapshots retain the source episode's attribution. This does not change the timeline contract.
- Sample Claude's five-hour and weekly windows, and whichever windows Codex returns, at baseline, roughly every minute and completion. These are explicitly account-wide, including other apps, subject to resets and provider reporting delays. API-key accounts and unsupported providers may return none. Sample ElevenLabs' account character counter separately when its key permits it.
- Sample hardware around every five seconds without elevation: system CPU/RAM, Studio plus descendant process CPU and summed RSS/working set, and supported GPU counters (Windows GPU engines, NVIDIA, Linux gpu_busy_percent). CPU is normalized to the logical CPU count. GPU is device-wide, not per episode; remote worker hardware is not sampled. Unsupported counters are unavailable, never synthetic zeros. Sampling can miss short peaks and adds overhead.
- Persist phase boundaries and samples in `.studio/episode-metrics.json`, write `.studio/episode-report.html` and a combined `developer-report.html` in the series folder. Reports work offline, escape project text, and disallow scripts/network content. Completed, failed and explicitly stopped episodes have reports. Resume appends to existing measurements; pause/offline gaps are labelled. Open reports from the run panel. Data stays local unless the user shares it.

## Consequences

Measured series favor attribution over throughput. Account percentages and sampled hardware remain observational rather than exact billing or exclusive process accounting; reports say so alongside the graphs. Course planning is shared and excluded from per-episode totals. The existing series scheduler and provider-owned authentication boundaries remain in use.
