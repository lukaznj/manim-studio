---
status: accepted
date: 2026-10-08
---

# 0011 — Open source (MIT), English, platform integrations in forks

## Context

Manim Studio was built for Maturita's admins: Croatian UI, Croatian narration, and a roadmap item to publish straight into Maturita. Nothing about the core loop is specific to Maturita, though: describe a video, Claude writes manim, the timeline comes from the render, and you add voice and subtitles. Other teachers and course makers could use it, and more contributors help it more than a private tool would.

## Decision

- **Public** at `lukaznj/manim-studio`. Initially MIT-licensed; the licensing part is superseded by [[0054-agpl-copyleft-license]] for future versions.
- **English source language**, with English and Croatian UI catalogs ([[0036-settings-onboarding-and-languages]]): the project template and the `CLAUDE.md` Claude follows inside projects, docs, and identifiers.
- **Narration language is per project** (`project.json` `voice.language`), seeded from the onboarding language, then chosen independently in Settings → Voice:
  - Claude writes narration and on-screen text in it, and replies in whatever language the user writes in.
  - The ElevenLabs voices on offer, Whisper alignment and the OmniVoice reference text follow it.
  - Slugs keep non-English titles readable ("Kvadratna funkcija — tjeme" → `kvadratna-funkcija-tjeme`).
- **Platform integrations live in forks.** Maturita's "publish to a lesson" goes in a Maturita fork. Upstream accepts small, generic hooks that keep forks thin (an export target, say), not integrations with one platform.
- **No personal data in the repo.** No e-mail in `package.json` or the installers, and screenshots never show an account.

## Consequences

- Croatian is now one language among many, not the default. Croatian-specific choices that cost nothing stay: the Croatian hyphenation packages in TinyTeX, and Lana as the preferred macOS voice for `hr`.
- Releases come from the same public repo ([[0006-auto-update-github-releases]]).
- Plan sign-in stays in public releases ([[0004-claude-via-agent-sdk]] explains why).
- Docs written before this ADR can mention admins and Maturita as history. Product docs speak to anyone.
