---
status: accepted
date: 2026-10-17
---

# 0036 — Guided setup, translated UI and shared video defaults

## Context

Accounts and Voice both exposed credentials, General mixed app and video preferences, and creation dialogs repeated the same voice and layout choices. First launch only chose a mode. Settings changed position when tabs differed in height, and theme transitions briefly hid native dialogs.

## Decision

- First launch guides the user through interface language, Learn/Create/Both, agent, sign-in or API key, and narration. Explain subscription versus API billing and ElevenLabs versus local OmniVoice. ElevenLabs is recommended for natural speech and exact timings. Users can explicitly postpone account or voice setup.
- Ship English and Croatian UI. English remains the source language for code, comments, docs, catalog keys, and project instructions. Add more of the most popular languages later. Onboarding language seeds narration language; later General language changes leave narration alone. Never translate user content, scene source, mathematical narration or attached material through the UI catalog.
- General owns app language, mode, appearance and folders, with version and update controls last. Show the releases-page fallback only after update failure.
- Agent selects the agent and model. Accounts owns every provider credential and desktop-assistant connection. Keys are entered in a focused modal and retain existing OS-encrypted storage and validation. Choosing ElevenLabs without a key directs users to Accounts before it can be used.
- Voice owns provider, narration language directly below the provider choice, and tone. Existing projects can override the new-project defaults. Environment owns component installation, including faster-whisper for exact recording bookmarks.
- Video owns export quality, aspect ratio and background/theme defaults in Learn and Create. Background choices are theme colours or custom colours; there is no background-picture selector. Existing saved picture backgrounds remain readable for compatibility. Scripting is always part of generation ([[0016-script-first]]), rather than a preference. Create additionally exposes preview quality, render-on-save, GPU encoding and render servers, with a guided pairing dialog. Both follows the active Home workspace for these extra controls.
- Creation forms inherit the defaults rather than repeating language, tone, theme, format or narration controls. Existing videos keep their aspect ratio, because layout depends on it ([[0010-fixed-aspect-per-project]]).
- Both libraries use a small plus button, with a larger central plus when empty. A chooser offers quick video, course/series and exercises, plus an editable project and open-folder action in Create.
- Shared segmented controls animate their selection, respecting reduced motion. Settings keep a fixed width and top position; only the body extends downwards and scrolls. Modal dismissal retains the complete content while fading. Theme changes apply directly while a native dialog is open.

## Consequences

This revises the UI-language portion of [[0011-open-source-english]], the control placement in [[0015-tone-and-pacing]], first-launch setup in [[0029-learn-and-create]], and export-quality placement in [[0035-720p-study-videos]]. A project snapshots defaults when created; changing defaults does not rewrite existing projects.
