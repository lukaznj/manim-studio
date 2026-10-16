---
status: accepted
date: 2026-10-15
---

# 0025 — Exercise sets: written solutions first, then short videos

## Context

Students mostly don't need a 10-minute explainer: they need one exercise solved, a step they don't follow explained, and a way back to what they solved last week. The editor and its timeline are too much for that, and a video takes minutes, while the answer is wanted now. Exercises arrive as typed text, screenshots, photos of a textbook page or a problem sheet in a PDF, often many at once.

## Decision

- **A set is a folder of ordinary projects** (`src/main/exercises.ts`): `exercises.json` holds the set's title, who it's for, its look and voice, and its exercises' folders in order (`01-…`, `02-…`). Each exercise is a project with `meta.exercise`, `problem.md` (the statement), and the original picture in `media/` or PDF in `sources/`. So the editor, the chat, renders and exports work on an exercise unchanged, and "Open in editor" is always there.
- **Intake reads the exercises out of what was given**, many at once: one request with the typed text, the pictures and the PDFs' text (a scanned PDF's pages go as pictures). The answer is plain delimited blocks, not JSON: LaTeX backslashes like `\frac` silently corrupt JSON strings (`\f` is a valid escape).
- **The written solution comes first.** A background agent (ADR 0023's `agent.ts`) writes `solution.md`: front matter (topic, tags, answer), then the steps as `##` sections. It checks its computations with a new `calculate` tool (a short Python program in the render environment: math, fractions, numpy; 30 s), since agents can't run commands. Every exercise gets its written solution before any video starts.
- **Then a short video of it** (typically 1–3 minutes): sections named after the steps, so the screen links each step to its moment in the video. Studio's check (`checkAndFix`) and the export queue follow, as in quick mode.
- **Its own screen** (`ExercisesView.tsx`): the exercises with their state and search, the selected one's statement, the exported video (or the preview until then) with chapters and speed, the steps with an "Ask" button each, and the chat. The chat there hides the agents' own turns (`ChatMessage.auto`) and answers questions right away; "Explain something better in the video" redoes the video with that part expanded.
- **Search** covers every set: titles, topics and tags, statements and solutions, accent-insensitive (`shared/exercise.ts`).
- **A lecture video** joins chosen exercises' exports without re-encoding (`studio_runner/concat.py`, PyAV), with joined subtitles and a YouTube chapter list.
- **KaTeX** (`katex`) typesets the maths on the screen and in the chat. Rendering LaTeX can't be done in a few lines, and the agents write maths in LaTeX everywhere.
- **Any agent** since [[0033-every-agent-in-the-background|ADR 0033]] (Claude only at first, when the bridge worked on the open project only).

## Consequences

- An exercise's answer is readable within a minute or two; its video follows. Pausing, removing and revising are states the loop reads, and opening a set carries on with what's unfinished, also after a restart.
- Several agents at once (Settings → Agent's `seriesAgents`) use the plan's limits as many times faster.
- Exercises live outside Home's project list: a set is one card. Moving a set's folder by hand loses it until it's in the projects folder again.
- The lecture needs every video exported with the same size and codec; a mismatch is refused with what to export again.
