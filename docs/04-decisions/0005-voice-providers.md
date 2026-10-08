---
status: accepted
date: 2026-10-08
---

# 0005 — Voice: system voice, ElevenLabs, OmniVoice, recordings

## Context

The first videos were narrated in Croatian, a language most TTS models skip, so that drove the choice. Since [[0011-open-source-english]], the narration language is per project. The open-source TTS landscape (researched October 2026):

- **Croatian supported:**
  - **OmniVoice** (k2-fsa, Apache-2.0, 600+ languages including hr, zero-shot voice cloning, about 3.3 GB of weights, runs on Apple Silicon through MPS)
  - **Supertonic 3** (31 languages including hr, about 99M params, CPU-only). Its weights are OpenRAIL-M and the repository is archived.
- **No Croatian:** Chatterbox Multilingual, XTTS-v2 (non-commercial licence), Qwen3-TTS, VibeVoice, Kokoro.
- **Piper:** has no hr_HR voice, only a Serbian one, which mispronounces ijekavian.
- **Commercial:** ElevenLabs is the most natural-sounding. Azure has the hr-HR neural voices Gabrijela and Srećko.

## Decision

- **Providers.** Three per project:
  - `system` (default): the OS voice for the project's language. Free, instant, good for pacing.
    - macOS `say`: by default the best installed voice for the language, skipping novelty and Eloquence voices (Samantha for English, Lana for Croatian).
    - Windows SAPI: the voice for the language's culture.
    - Linux: `espeak-ng`.
  - `elevenlabs`: final quality. Uses `/with-timestamps` for exact word timings.
  - `omnivoice`: local and free, 600+ languages, clones the user's voice from a 5–10 s reference read in Settings. The reference text follows the project's language.
- **Recordings win.** A human recording for a block overrides any provider (the recording booth). Optional Whisper alignment places bookmarks on the spoken word.
- **Failures degrade.** A TTS failure becomes estimated silence with a warning, never a failed render.
- **Committed audio.** All audio is committed with the project; regenerating costs money or a re-take.
- **Sidecar subtitles.** Subtitles come from the narration text and are exported as `.vtt`/`.srt` sidecars, not burned in, so a player can toggle them.
- **Verified in development:** OmniVoice synthesized Croatian maths sentences on MPS in 6–12 s, and Whisper read them back almost word for word. Lana, Whisper alignment and the silence fallback were exercised too. ElevenLabs was not called (no key).

## Consequences

- **Language.** `project.json` `voice.language` (an ISO 639-1 code) chooses the system voice, Whisper's language for alignment, and the language Claude writes narration in. ElevenLabs' multilingual model and OmniVoice detect it from the text.
- Anyone can make a whole video with no paid service, then switch the provider or record over individual sentences. The timing re-flows because animations sit inside voiceover blocks.
- ElevenLabs pricing is per character. The key lives encrypted on each machine (`safeStorage`).
