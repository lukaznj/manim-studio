---
status: accepted
date: 2026-10-25
---

# 0046 — App sounds, synthesized in code

## Context

Renders, exports and series take minutes, and people look elsewhere while they run. Nothing told them when something finished or failed, short of watching the window.

## Decision

- **Nine short cues, synthesized with the Web Audio API** (`src/renderer/src/lib/sounds.ts`):
  - render finished, export ready, episode done, series finished
  - right answer, not quite
  - setup finished, needs you, something failed

  They're oscillators with envelopes, bell partials, filtered noise and a short generated room. Each is rendered once, levelled to −6 dBFS and played at the Settings volume. No audio files and no dependency, and the sounds are ours under MIT.
- **They follow the app's state, not its handlers.** One store subscription turns transitions into cues:
  - an export or exercise moving to done or failed
  - an episode or the series finishing
  - quick mode finishing
  - the engine and LaTeX becoming ready after an install
  - the chat agent answering while the window isn't focused

  A render plays a cue only when you waited for it: at least 4 s, and not during the agent's own iterations. Editor render errors stay silent, because the editor already shows them.
- **Usage limits also send a native desktop notification and the attention cue**, from the main process after an agent actually refuses a turn. This covers Claude, Codex and Antigravity in chat, planning, series and exercises. Alerts share a gate per provider/sign-in: concurrent episodes and retries do not repeat the same reset window; an unknown window stays quiet until a successful turn, with a one-minute minimum between alerts. The notification names the provider and reset time when available, and opens the app when clicked. It never includes raw provider errors. The renderer plays the cue at the selected volume; without a window, the OS supplies its notification sound. Muting app sounds keeps the visual notification.
- **Quiet and polite:** one cue at a time, the more important one wins, and nothing plays while a video is playing. Settings → General has on/off and a volume (default 50, about −15 dB).
- Right answer and not quite are in the set for answer checking, which the app doesn't have yet.

## Consequences

Sounds are easy to tune: each is a few lines of numbers. Sound effects inside the videos are a separate, later feature (roadmap).
