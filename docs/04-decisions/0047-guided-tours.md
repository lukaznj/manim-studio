---
status: accepted
date: 2026-10-25
---

# 0047 — Guided tours for the library and the study page

## Context

Only the editor had a tour, so Learn users, who never open the editor, had none. The editor tour's text also wasn't translated.

## Decision

- **One tour component, three tours** (`Tour.tsx`):
  - Home (the library)
  - the study page
  - the editor

  Each step spotlights a `data-tour` element and explains it. Steps whose element isn't on screen are skipped, so one list covers Learn, Create, Both, courses and exercise sets. A step can be centred with no spotlight when its element is elsewhere (Settings is in the macOS menu bar).
- **Learn has its own wording** where it differs: adding a course rather than a video, a library rather than projects.
- **Each tour starts by itself the first time its screen opens**, after onboarding and when no dialog is open. `settings.toursSeen` remembers Home and the study page; the editor keeps `tutorialDone`.
- **Settings → General → Guided tours → "Show the tours again"** plays the tour for the screen you're on, and lets the others show again when you reach them. Help → Tutorial does the same.
- All tour text goes through the UI catalog (English and Croatian).

## Consequences

New screens add steps to a list rather than a new component. Existing users see the Home and study tours once after updating.
