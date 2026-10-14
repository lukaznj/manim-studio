---
status: accepted
date: 2026-10-09
---

# 0013 — Export: light and dark versions, and every language YouTube wants

## Context

A lecture is often needed in both themes: dark for screens, light for print-like slides. On YouTube a single video can carry several audio languages and subtitle tracks, which the viewer picks. Making those files by hand means translating, recording or voicing, aligning, and naming. Studio already has the narration as text, a voice in any language, and the timing of every sentence.

## Decision

- **The video's look is per project** (Settings → Video):
  - the theme, now changeable after creation
  - a custom background colour per theme
  - an optional background picture from media/ ([[0012-own-media-in-scenes]])
- **Versions.** Export renders the final video once per chosen theme, from the same scene (`render --theme <t> --out final-<t>`). The theme only changes the palette and background, never the layout.
- **Quality.** 1080p or 1440p (2560 × 1440, or 1440 × 2560 in portrait), at 30 or 60 fps, chosen in the export dialog (`render --size --fps`). 1080p at 30 fps is the default. Unlike the format ([[0010-fixed-aspect-per-project]]), resolution and frame rate don't change the layout, so a scene renders the same at either. 1440p keeps thin lines and small text sharp after YouTube's compression; 60 fps makes motion smoother. 4K isn't offered: over 1440p the gain is small for this kind of picture, and the export takes about twice as long again.
- **Languages.** For each extra language:
  - **Claude translates** the narration in one tool-less request, on the user's own sign-in and model. Translations are kept in `voice/translations/<lang>.json` (original sentence → translation), so each sentence is translated once and can be corrected by hand.
  - **The project's voice** speaks the translation in that language (`dub` in the runner): the system voice for that language, ElevenLabs' multilingual model, or OmniVoice cloning your voice.
  - **Same picture.** Each sentence starts where the original did. If it runs long, it's sped up, keeping its pitch, by at most 1.6×. If still too long, it pushes the next sentence back rather than overlapping it; the pauses after it absorb the delay, and the export warns when a sentence ends up more than 0.5 s behind its picture.
  - **Subtitles** in that language follow the dubbed speech.
- **Files, named for YouTube**, in a folder named after the video: `exports/<name>/` in the project, or `<folder>/<name>/` when the dialog's **Save to** chose another folder (`project.json` `export.folder`):
  - `<name>.mp4` (or `.dark.mp4` and `.light.mp4`), plus a `.jpg` thumbnail per version
  - `<name>.<lang>.srt` / `.vtt` for the original and every extra language
  - `<name>.<lang>.m4a`: each extra language's narration as an audio track, matching the video's length
  - optionally `<name>[.<theme>].<lang>.mp4`, a full video per language, for sites without audio tracks
- **The dialog remembers** the last choices per project (`project.json` `export`).
- **Claude Desktop's `export_video`** makes the default export (the project's theme and language) at the project's last resolution and frame rate.

## Consequences

- 1440p or 60 fps each make an export about 1.5× as long, both about 2× (measured; see [[../02-architecture/render-performance|render performance]]).
- One scene, one timing: there's no per-language re-render. On-screen text stays in the original language; formulas don't care.
- Translating uses the user's Claude plan, and voicing uses the chosen provider (ElevenLabs credits, for instance), once per sentence.
- The 1.6× limit and the "pushed back" rule keep speech natural but can drift. The warnings say where.
- Human recordings exist only for the original language; other languages are always text-to-speech.
