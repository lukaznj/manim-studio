---
status: accepted
date: 2026-10-14
---

# 0019 — Series mode: a course's PDFs become a series of episodes

## Context

A course comes as a batch of lecture PDFs. Turning it into videos one by one loses what makes a series good: a plan across the whole course, notation and visuals that stay the same, and episodes that build on each other instead of repeating. The end goal is series at the level of 3Blue1Brown's *Essence of linear algebra*.

## Decision

- **New series** (Home, File → New Series…) takes the PDFs in course order, a title, format, language, tone and theme.
- **Claude plans it** in one request (`planSeries` in `src/main/series.ts`): Studio extracts each PDF's text (`pdf-index`, up to 40 000 characters per PDF) and Claude answers with the episodes (usually one per PDF, merged or split where that makes better videos, with the pages each uses and what it builds on) and a **series bible**: audience, arc, notation, and the visual vocabulary, which colour and shape always mean what.
- **You edit the plan** before anything is made: titles, summaries, order, removing episodes, the bible itself.
- **Each episode is an ordinary project** in a series folder (`<projects>/<series>/01-…`, with `series.md` and `series.json`), with its PDFs as sources and `meta.series` saying where it sits. Home lists the episodes with an "episode/total · series" badge.
- **Episodes refer to each other through `series.md`.** Each episode gets a copy of the bible plus the list of episodes, and for the finished ones, what they actually became (the idea and the sections of their script). It's refreshed when an episode is started or opened. Claude's brief says to follow the bible's notation and visuals, assume what earlier episodes taught and refer back to them, and leave later topics alone.
- **Unattended** (the default), the episodes are made without you and each is exported: with Claude, every script first and then several videos at once ([[0023-parallel-series-episodes]]); with Codex, one after another in quick mode ([[0018-quick-mode]]). Otherwise the first episode opens with "Make this episode." ready in the chat.

## Consequences

- The plan sees at most 40 000 characters per PDF; longer material is cut for planning, though each episode's Claude reads its own pages in full through `read_source`.
- Episodes are made in order, in the foreground. A long series keeps the app busy for a while; stopping stops the whole series.
- Episodes are independent projects, so any of them can be reopened, fixed and exported again.
