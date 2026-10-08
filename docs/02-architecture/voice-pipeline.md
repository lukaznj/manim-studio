# Voice pipeline

Scenes subclass `StudioScene`, a `VoiceoverScene` from [manim-voiceover](https://github.com/ManimCommunity/manim-voiceover) wired to `studio.voice.StudioSpeech`. Narration lives in the code:

```python
with self.voiceover("Tjeme je <bookmark mark='t'/>najniža točka.") as v:
    self.play(Create(graph), run_time=1.5)
    self.wait_until_bookmark("t")
```

## Which audio a block gets

`StudioSpeech` replaces manim-voiceover's cache and Whisper handling. For each block it uses the first of these that applies:

1. **A human recording** at `voice/recordings/<key>.wav`. `key` is a hash of the spoken words only, ignoring whitespace and bookmarks, so moving a bookmark keeps the recording.
2. **The project's provider:**

   | Provider | Where | Word timings | Notes |
   |---|---|---|---|
   | `system` (default) | macOS `say -v Lana` / Windows SAPI hr-HR | proportional | Free and offline, good for pacing drafts |
   | `elevenlabs` | REST `/with-timestamps` | exact, from the character alignment | Needs an API key (Settings → Glas, stored encrypted). Multilingual v2 by default |
   | `omnivoice` | local worker, `k2-fsa/OmniVoice` | proportional | Apache-2.0, Croatian, clones the admin's voice from a 5–10 s reference |
3. **Silence of an estimated length**, if the provider fails. The render never blocks on TTS; the timeline marks the block in coral and a toast says why.

Audio is cached under `voice/tts/<key>-<provider-signature>.{wav,mp3}`. Changing the provider or the voice regenerates it; re-renders don't.

## Recording booth

The booth lists every voiceover block from the last render as a teleprompter.

- **Recording.** `MediaRecorder` captures the take; silence is trimmed and the audio is encoded as 16-bit mono WAV in the renderer (`lib/audio.ts`), so manim can read it without ffmpeg.
- **Word timings.** If the optional `transcribe` environment is installed, faster-whisper word timestamps are aligned to the script with difflib (`studio_runner/align.py`), and bookmarks land on the spoken word.
- **On close.** The project re-renders, and every animation inside a voiceover block stretches to the new length.

## Subtitles

Each voiceover adds subcaptions (split at 70 characters). Export writes `.vtt` (for the maturita player, which can toggle it) and `.srt`. Nothing is burned into the picture ([[../04-decisions/0005-voice-providers|ADR 0005]]).
