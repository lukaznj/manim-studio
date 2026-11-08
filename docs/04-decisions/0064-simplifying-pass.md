---
status: accepted
date: 2026-11-08
---

# 0064 — The simplifying pass: one composer, four Settings tabs, fewer words

## Context

Features landed faster than the screens around them were tidied. By 0.18.0 most screens carried a paragraph explaining them, three separate "new" dialogs (quick video, course, exercise set), seven Settings tabs, and two words for the same thing (series/course, episode/lesson). The Croatian interface mixed the formal "vi" with the informal "ti". The roadmap asked for a pass through every screen ([[roadmap]]).

## Decision

- **Words.** The interface says *course* and *lesson* everywhere (Croatian *tečaj*, *lekcija*); files and code keep `series` and `episode`. Croatian addresses the user as *ti*. Counts use ICU-lite plurals in the catalog (`{0, plural, one {# lesson} other {# lessons}}`, `lib/i18n.ts` `format`), so Slavic and Baltic forms are right.
- **No explanatory paragraphs.** A row is a title and its control. A note stays only when it reports state: signed in or not, a saved key, a synced folder, an error, a missing GPU, the cache size.
- **One composer.** *New* opens one box for the request and its files, with Video, Course and Exercises as tabs, the defaults as a strip below, and Empty project / Open folder in the footer in Create. A course goes straight to planning ([[0045-series-planner-and-maker]]); exercises are solved as before.
- **Settings in four tabs:** Agent (with Accounts below it), Voice, Video, General (with Tools below it), plus Develop in developer mode. Rarely changed controls (lesson model override, automatic model switching, agents at once) sit in one closed *Advanced* section. This revises the tab list in [[0036-settings-onboarding-and-languages]].
- **Study pages.** The lesson header is a watched check and a ⋯ menu (save video, open in the editor, reveal); the library card shows the kind and progress; Transcript and Chat are tabs only when both exist.
- **Onboarding in six steps:** welcome, mode, install, agent (choice and sign-in on one page), voice, done. The projects folder is no longer asked: new installs use `~/Manim Studio`, and a first run with an old `Documents/Manim Studio` that holds anything uses that instead. Settings → General still changes it. This revises [[0043-projects-folder-and-render-cache]].
- **Editor.** Save and Render sit in the code tabs row; timeline clips name what they do (`.shift`, not `.animate`), so the timeline contract's `anims[]` carries `methods` for `.animate` builders ([[0002-timeline-derived-from-render]]).

## Consequences

Screens are shorter and the same action has one name everywhere, but help that used to be on screen now lives only in the tours and docs. Strings shown through `toast()` or lookup tables are not found by the catalog extractor, so a few still show in English until they are added by hand. Each new feature should follow the same rules: one primary action, no paragraph, state in notes only.
