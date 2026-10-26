---
status: accepted
date: 2026-10-25
---

# 0045 — Series: a planner and a maker from Settings, and series without PDFs

## Context

New series asked for a title, required PDFs and asked for a model each time. Planning is one long read of the material where a stronger model pays off. Making the episodes runs many times, so a faster model saves time and limits. Users without course material had no way in, and the model picker in the dialog often showed "No effort setting": a saved full model id (`claude-sonnet-5-5`) wasn't recognised as the listed alias (`sonnet`).

## Decision

- **Two normal model choices in Settings → Agent:** the creation model/effort (editor chat, videos and series episodes) and "Series: planning". [[0051-study-assistant-and-notes]] adds an independent study-chat model/effort in Settings; its questions and notes do not change the creation selection.
  - Planning defaults: Claude Opus 5.5, Codex GPT-6-Astra, Antigravity Gemini 4 Argon; high effort.
  - Episode creation inherits the selected provider's normal creation model and effort. Codex creation defaults to GPT-6.1 Sol; its only other choice is GPT-6 Astra. Old blank/retired Codex planner and maker overrides migrate to Astra and Sol respectively.
  - **Advanced** offers an optional "Override model for series episodes". Existing saved maker selections remain explicit overrides; disabling one restores inheritance. Saved planner selections stay independent (`settings.seriesModels`, planner defaults in `shared/agent-selection.ts` `SERIES_PLANNERS`).
  - New series has no model picker; a run captures the maker at its start, as before.
- **Claude's model list shows only the 5.5 generation**, plus Studio's default. A saved full model id counts as the listed alias with the same name, so it keeps its effort levels.
- **New series is two steps:** first the PDFs, or "I have no PDFs"; then the details. Without PDFs, the user says what they want to learn and the planner chooses the curriculum, with episodes that have no sources. The optional instructions stay.
- **No title field.** The planner names the series. The plan review can still edit it, and the series' folder view on Home renames it later. Renaming updates the episodes' `project.json` and `series.json`, and folders keep their names.

## Consequences

Planning can spend more (Opus) once per series. Normal creation and series episodes share one model choice, with an advanced override when batch production needs a different model. Changing defaults or overrides affects new series only; running series and saved per-episode assignments retain their captured selections. This revises the "own model and effort" point of [[0023-parallel-series-episodes]].
