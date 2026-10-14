---
status: accepted
date: 2026-10-14
---

# 0015 — Tone per project, pacing by clarity

## Context

Claude wrote every video in the same voice, and the project conventions asked for a 2–4 minute video. Some audiences want a strict lecture, others learn better with a friendlier teacher who jokes and uses everyday analogies. A length target made Claude rush or pad the material instead of explaining it.

## Decision

- **Tone** is a project setting on one scale with three stops: professional (a neutral lecture, no jokes), warm (a clear, friendly teacher; the default) and playful (light humour and real-life analogies where they fit, the maths stays exact). `src/shared/tone.ts` holds the labels and the exact text Claude is given.
- It's chosen in the new-project dialog and in Settings → Video, and Claude Desktop's `create_project` takes it too.
- It's a default, not a rule. The brief tells Claude to follow it unless the user asks for something else in the chat, so "make this part funnier" works for one request. Changing it applies from Claude's next turn; nothing is rewritten or re-rendered.
- **Pacing** has no target length: take the time the material needs to be explained clearly, and no more. Both Claudes get this in their brief, which overrides the old target in the `CLAUDE.md` of existing projects. New projects get the new wording from the template.

## Consequences

- Three stops instead of a slider: each stop has wording Claude follows reliably, where "62 % friendly" wouldn't mean anything.
- Videos made from long material get longer. A future script phase ([[0016-script-first]]) will show the planned length before any code is written.
