---
status: accepted
date: 2026-10-17
---

# 0038 — Developer comparisons assign a model to each episode

## Context

Testing which agents can make a lesson needs several models to work on individual episodes of one Learn series, with the same voice, video defaults and material. Changing the global agent while a series runs cannot reliably assign that work.

## Decision

- Five consecutive clicks on the app version in Settings → General enable a persistent Develop tab. Clicks must be within 1.6 seconds of each other; another General control resets the sequence. Develop has an off-by-default episode model comparison switch and a way to disable developer mode.
- With comparison enabled in Learn (including Both's Learn workspace), the reviewed series plan offers a connected provider, model and supported effort for every episode. Planning still uses the selected agent. The assignment covers the episode's script, scene and render fixes.
- Assignments belong to episode objects, so reorder and removal preserve them. They are saved in `series.json` and `.studio/series-run.json`, shown on the run panel, and used again after pause or restart. Ordinary series also capture their initial provider and model.
- Accounts are checked and model catalogs validated before project folders are created. A catalog is what a provider offers to the client; a completed inference request is still the final access check. Model failures remain visible on the episode.
- An assigned comparison model may retry a capacity failure, but cannot substitute a fallback. The existing per-project tools and provider-owned authentication boundaries stay in place.

## Consequences

Comparisons can use Claude, Codex and Antigravity concurrently without rewriting global settings. Scripts still run in order and share the series bible ([[0023-parallel-series-episodes]]), so this is a practical workflow comparison rather than an isolated benchmark. Provider outages are recorded as failures rather than silently attributing a different model's work to the requested one.
