---
status: accepted
date: 2026-10-14
---

# 0016 — Script first: plan the video in words, then write the code

## Context

Today Claude goes straight from a request to `scene.py`. That works for short videos, but the structure, the explanations and the visuals are all decided at once, inside code, where they're hard to review. The goal is videos and series at the level of 3Blue1Brown's *Essence of linear algebra*. Their quality comes from the script: one central idea, a deliberate order, visuals designed to carry the explanation, and a consistent visual language across episodes. Quick mode and series mode ([[../01-product/roadmap|roadmap]]) also need a plan a person can approve before anything is generated.

## Decision

- **`script.md` in the project** is the video's plan, written by Claude before any code:
  - the one idea the viewer should leave with, who the video is for and what it assumes they know;
  - sections, each with its goal, the final narration, what's on screen and how it moves, and an estimated length;
  - references to the source PDFs (page numbers) where the material comes from.
- **Scripting is always part of generation.** The agent writes or revises `script.md` first and asks for approval, and only then writes `scene.py` to follow it. The narration in the code is the script's wording. There is no switch in Settings or New project to bypass this step; legacy `scriptFirst: false` metadata does not disable it.
- **The app shows the script** in a Script tab next to `scene.py` (`ScriptPane.tsx`): readable, editable, with Approve, which marks it approved and tells Claude to write the video from it. The tab opens by itself when Claude writes the script. Claude Desktop reads and writes it through `get_script` and `write_script`.
- **The brief** (`src/shared/script.ts`) gives every agent the format, the rules and what makes a great explainer. The Script tab is always available, including in older projects.
- **Series** add `series.md`, the series bible: what each episode covers and assumes, the notation, and the recurring visual vocabulary (colours and shapes that always mean the same thing). Each episode's script reads it, which is how a video refers back to an earlier one.
- Quick mode and series mode use script mode, with approval either by the user or automatic.

## Consequences

- Planning precedes the first render for every new video. Purely visual fixes can still go straight into the existing scene without rewriting an unchanged script.
- The script is plain Markdown in the project's git history, so it can be reviewed, diffed and reverted like the code.
- Script sections and rendered sections should be the same thing, matched by name, so the timeline can show which part of the script a clip belongs to.
