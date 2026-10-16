---
status: accepted
date: 2026-10-16
---

# 0030 — A course is a series with its own exercises, studied on one screen

## Context

A series (ADR 0019, 0028) and an exercise set (ADR 0025) were two things with two screens, but for a student they are one course: the lectures, then the problems that practise them, in the same notation. Exercises added on their own didn't know the series' notation, and a series had nowhere to put its exercises.

## Decision

- **On disk, nothing new.** A course is a series folder; its exercises are an ordinary exercise set nested in it, at `<series>/exercises/`, made the first time exercises are added (`courseExercises`, settings from the first episode). Its `exercises.json` names the series (`course`). An exercise set on its own is a course with only exercises; a single video is a course of one lesson.
- **A course's exercises use its notation.** Each one gets the series bible as `course.md`, and the brief tells the agent to follow it and to point to the episode that teaches a method.
- **One study screen** (`StudyView.tsx`, the store's `study` screen) replaces the Watch and exercises screens. One list, with a "Lessons" and an "Exercises" heading when a course has both; the selected lesson or exercise in the middle (`LessonView.tsx`, `ExerciseView.tsx`); one chat that knows the moment (ADR 0028); one set of watched marks. "Add exercises" works on any course. Opening a series, its set or any of their videos lands here.
- **Home** shows a course once: the series card counts its exercises, and its nested set has no card of its own. In Learn mode "New series" reads "New course".

## Consequences

- Moving or copying a series folder takes its exercises with it.
- Search still covers every exercise set, a course's included.
- Exercises can't yet be planned with the series (one request for lectures and problems together); they are added once the series exists.
