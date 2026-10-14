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

- **Providers.** Two per project (the OS voice was removed in 0.4.0, see the amendment below):
  - `elevenlabs` (default): final quality. Uses `/with-timestamps` for exact word timings.
    - Model: v4 by default; v3 is offered too. `language_code` pins the project's language. If a model rejects the language, the request is retried without it.
    - Voices: the picker shows the language's ten most-used voices from ElevenLabs' voice library, searches the whole library, and lists the voices in the account, each with a sample to play. Library voices work in text to speech by their id, without saving them to the account first (ElevenLabs allows this on paid plans only). Without a key the library shows three voices and no search.
  - `omnivoice`: local and free, 600+ languages, clones the user's voice from a 5–10 s reference read in Settings. The reference text follows the project's language.
- **Chosen per project.** The new-project dialog asks for the language and the voice. Settings → Voice changes the open video's voice, or the default that new projects start with.
- **Re-voicing is a click, not automatic.** A voice change doesn't render by itself: browsing ElevenLabs voices would spend credit on every pick. The app notices that the narration was made with another voice and offers "Re-voice with <name>".
- **Recordings win.** A human recording for a block overrides any provider (the recording booth). Optional Whisper alignment places bookmarks on the spoken word.
- **Failures degrade.** A TTS failure becomes estimated silence with a warning, never a failed render.
- **Committed audio.** All audio is committed with the project; regenerating costs money or a re-take.
- **Sidecar subtitles.** Subtitles come from the narration text and are exported as `.vtt`/`.srt` sidecars, not burned in, so a player can toggle them.
- **Verified in development:** OmniVoice synthesized Croatian maths sentences on MPS in 6–12 s, and Whisper read them back almost word for word. Lana, Whisper alignment and the silence fallback were exercised too. ElevenLabs was not called (no key).

## Consequences

- **Language.** `project.json` `voice.language` (an ISO 639-1 code) chooses the ElevenLabs voices on offer, Whisper's language for alignment, and the language Claude writes narration in. ElevenLabs is told the language; OmniVoice detects it from the text.
- **OmniVoice's memory.** The worker keeps the model loaded between renders, which takes several GB (about 5.7 GB on Apple Silicon, where it runs in float32). It quits after 10 minutes without a request, and the next render starts it again.
- Anyone can make a whole video with no paid service (OmniVoice, or recordings), then switch the provider or record over individual sentences. The timing re-flows because animations sit inside voiceover blocks.
- ElevenLabs pricing is per character. The key lives encrypted on each machine (`safeStorage`).

## Amendment (0.4.0): no system voice, ElevenLabs v4 by default

- **The OS voice is gone.** Nobody used it past the first draft, it sounded robotic, and it was the one provider that depended on the operating system (`say`, SAPI, `espeak-ng`), which a Linux render worker can't reproduce. ElevenLabs is the default for new projects.
- **ElevenLabs offers v4 (default) and v3.** Multilingual v2 and Flash v2.5 are no longer offered.
- **Old settings** (`src/shared/voice.ts`, `migrateVoice`): a project or default voice saved as `system` opens as ElevenLabs with no voice picked, so it renders silence with a warning until one is chosen, and never spends credit by surprise. A project on Multilingual v2 or Flash v2.5 keeps its model until changed, because switching would re-voice, and bill, the whole narration.
