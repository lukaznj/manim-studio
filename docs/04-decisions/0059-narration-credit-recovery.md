---
status: accepted
date: 2026-10-30
---

# 0059 — Narration credit recovery without losing the video

## Context

A voice provider can fail after the video has been written. ElevenLabs reports exhausted credits using a provider error code; HTTP 401 can also mean an invalid API key. Treating every failure as a failed video hides usable visuals and gives no clear way to complete the narration.

## Decision

- Keep ADR 0005's silence fallback. A render records structured provider issues alongside `voiceWarnings` and marks each silent block. Exhausted-credit codes are distinct from authentication and network failures. After one credit failure, that render stops requesting uncached ElevenLabs blocks; existing paid audio and human recordings still work.
- Show a persistent recovery notice beside playback when narration is missing. Explain that the video remains watchable with silent sections. Offer retry after topping up, voice settings, and an explicit local OmniVoice alternative. If OmniVoice is not installed, open its installation settings. Never download the model or change the voice automatically.
- Recovery queues an export of the existing scene, without a writing agent. It reuses provider-specific narration caches and regenerates timings with the selected voice. The provider override applies only to the export snapshot, preserving the project's original choice so ElevenLabs can be retried later.
- Publish recovery into a new export version only after completion. Incomplete/cancelled/failed recovery folders are excluded from playback discovery; the previous video remains available. Exported study context stores chapter/subtitle timing and narration state for that exact video. A successful local fallback remains identified, with the option to retry ElevenLabs; successful original-provider narration clears the warning.

## Consequences

- Recovery may need to redraw animations when spoken timing changes. It does not rewrite code or discard earlier exports. Cached paid narration is never replaced by silence.
- Partial failures remain playable and can be retried. Errors from the export queue remain visible on the recovery notice.
- This extends the failure policy in [[0005-voice-providers]] and versioned exports in [[0013-export-versions-and-languages]].
- Provider error classification follows [ElevenLabs' API troubleshooting](https://elevenlabs.io/docs/help-center/technical/api-error-code-400-or-401) and [error reference](https://elevenlabs.io/docs/eleven-api/resources/errors).
