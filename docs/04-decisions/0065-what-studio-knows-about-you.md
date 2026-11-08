---
status: accepted
date: 2026-11-08
---

# 0065 — What Studio knows about you: a short local note the user controls

## Context

Every study chat and every new video started from nothing. The agent didn't know the user was a maturita student, or a first-year engineer, or that they wanted short answers with one worked example, so the user repeated it or got answers pitched wrong. Automatic memory fixes that but brings its own problems: wrong or stale facts that quietly bend every answer, a hidden profile of what a student (often under 18) is bad at, answers that change for reasons nobody can see, and prompts that keep growing.

## Decision

- **One note, local only.** `about-you.md` in the app's data folder, never in a project, never synced or uploaded by Studio. Settings → General → *What Studio knows about you* turns it on (off by default) and shows it as plain text the user edits or clears.
- **Short by construction:** at most 20 non-empty lines of 200 characters (`shared/about-you.ts` `trimNote`). A new line pushes out the oldest once it's full.
- **Who reads it, while it's on:** the study chat (every action: answers, video advice, practice exercises), course planning, and the video agent's instructions (`studioPrompt`, so quick videos, course lessons, exercise solutions and the editor chat). It's labelled as the user's own note, for level, pace and examples, never as instructions. Exports, subtitles and translations don't read it.
- **The chat proposes, the user decides.** The study chat may end an answer with `REMEMBER: <one sentence>` when the conversation shows something lasting (level, course, goal, preferred kind of explanation). Studio strips the line, also while streaming, and shows a *Remember?* chip under the answer. Only a click on *Remember* writes it. It is told never to propose health, family or other personal details, or the student's mistakes. With the feature off it's never asked, and a stray line is still stripped.

## Consequences

Answers and videos can be pitched to the person without a hidden profile: everything Studio "knows" is on one screen in their own words. The cost is a line or two in each prompt and a chip the user occasionally dismisses. What it deliberately doesn't do is track progress or weaknesses across exercises. That would help most and is the most sensitive, so it waits until this simpler version shows people use it.
