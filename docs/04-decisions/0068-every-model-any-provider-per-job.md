---
status: accepted
date: 2026-11-23
---

# 0068 — Every model, any provider for each job

## Context

Studio filtered each provider's models to a hand-kept list (ADR 0039 for Codex, a "5.5 and Fable 5.2" match for Claude). Every release meant a code change, and a rename in Claude Code once hid all of Claude's models but Fable. One Agent toggle also tied every job to one provider, so course planning on Gemini 4 Argon, videos on Sonnet and lesson chat on GPT-6.2 Sol were impossible together.

## Decision

- **No filtering.** Pickers list every model the signed-in account offers, except Claude Code's own "Default" alias.
- **Newest first.** None of the CLIs report a release date, so the version in the name stands in for one: GPT-6.2 Sol comes before GPT-6.1 Sol. Within a version, the provider's own order stays (`sortModels`).
- **Defaults are kept by hand in one place,** `src/shared/model-defaults.ts`:
  - Video creation (and the editor's chat) and the lesson chat: Sonnet 5.5, GPT-6.2 Sol and Gemini 4 Hydrogen.
  - Course planning: Opus, GPT-6.2 Sol and Gemini 4 Neon.
- **An untouched model setting stays empty** and resolves to the current default when it's used. Updating the constant therefore moves everyone who never picked a model. Defaults that older versions saved as explicit values are cleared once (`defaultsVersion: 2`); explicit choices are kept.
- **Each job picks its own provider.** One picker per job lists the models of every signed-in provider, grouped by provider, and the Agent toggle is gone. The jobs are video creation, lesson chat, course planning and the advanced lesson override.
  - `agent` remains video creation's provider. `studyAgent`, `planAgent` and `lessonAgent` default to it.
  - Models are still remembered per provider, so switching a job back to a provider restores its last model there.

## Consequences

- A retired or renamed model a user picked shows as unavailable in the picker, not silently replaced.
- New models appear without a release of Studio, but a new default still needs one.
- Supersedes the fixed Codex list in [[0039-codex-model-discovery-and-capacity-recovery|ADR 0039]] (its capacity fallback stays). [[0045-series-planner-and-maker|ADR 0045]]'s planner and override now choose a provider too.
