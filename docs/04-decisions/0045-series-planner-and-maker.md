---
status: accepted
date: 2026-10-25
---

# 0045 — Series: a planner and a maker from Settings, and series without PDFs

## Context

New series asked for a title, required PDFs and asked for a model each time. Planning is one long read of the material where a stronger model pays off. Making the episodes runs many times, so a faster model saves time and limits. Users without course material had no way in, and the model picker in the dialog often showed "No effort setting": a saved full model id (`claude-sonnet-5-5`) wasn't recognised as the listed alias (`sonnet`).

## Decision

- **Two series models per agent, in Settings → Agent:** "Series: planning" and "Series: making the episodes" (`settings.seriesModels`, defaults in `shared/agent-selection.ts` `SERIES_MODELS`).
  - Claude: Opus 5.5 plans, Sonnet 5.5 makes.
  - Codex: GPT-6-Astra for both.
  - Antigravity: Gemini 4 Argon for both.
  - Effort defaults to high everywhere.
  - New series has no model picker; a run captures the maker at its start, as before.
- **Claude's model list shows only the 5.5 generation**, plus Studio's default. A saved full model id counts as the listed alias with the same name, so it keeps its effort levels.
- **New series is two steps:** first the PDFs, or "I have no PDFs"; then the details. Without PDFs, the user says what they want to learn and the planner chooses the curriculum, with episodes that have no sources. The optional instructions stay.
- **No title field.** The planner names the series. The plan review can still edit it, and the series' folder view on Home renames it later. Renaming updates the episodes' `project.json` and `series.json`, and folders keep their names.

## Consequences

Planning spends more (Opus) once per series, and every episode runs on the cheaper maker unless Settings say otherwise. Changing the series models affects new series only. This revises the "own model and effort" point of [[0023-parallel-series-episodes]].
