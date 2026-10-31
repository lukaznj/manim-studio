---
status: accepted
date: 2026-10-31
---

# 0060 — Subtitle appearance belongs to playback preferences

## Context

Viewers need larger captions, different contrast and a position that does not cover a diagram. These choices belong to the viewer rather than to the source scene or its exported subtitle files.

## Decision

- Settings → Video starts with a Playback section available in Learn, Create and Both. It offers subtitle visibility, size (75–200%), text/background colors, background opacity, top/bottom position and an optional contrast outline. Include a live sample and Reset for appearance.
- Persist one normalized `subtitleStyle` preference across videos and app restarts. Clamp numeric values and accept only six-digit hex colors. Defaults are white text on a 70% black background, 100% size, bottom position and an outline. Visibility reuses the existing `studyCaptions` preference.
- Style the study player's native WebVTT cues, preserving track loading and caption keyboard controls. Position cues in memory; size text with the actual displayed video frame, including portrait and fullscreen. Playback uses the media's intrinsic aspect ratio so delivery padding does not stretch the picture.
- Apply the same style and visibility preference to the editor's caption overlay. Settings apply immediately without seeking, rendering or rewriting a scene. Exported VTT/SRT files and narration timings are unchanged; other players use their own caption preferences.

## Consequences

This extends [[0036-settings-onboarding-and-languages]] and [[0041-focused-study-workspace]]. It preserves the subtitle-safe layout convention in [[0027-subtitle-band]]; viewers can still choose another position. Styling uses native CSS `::cue`, `VTTCue` positioning, CSS variables and ResizeObserver, with no runtime dependency.
