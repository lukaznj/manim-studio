# Product overview

**Manim Studio** is a desktop editor in which the admins of [Maturita](https://github.com/lukaznj/maturita), the Croatian matura study app, make short maths explainer videos. A video is [manim](https://www.manim.community) code. Claude writes and fixes that code. The app renders it, shows it on a timeline, gives it a voice and subtitles, and exports it for the mobile app.

## Who uses it

A handful of maturita admins: teachers and content authors, not necessarily programmers. Each signs in with their own Claude plan (see [[../04-decisions/0004-claude-via-agent-sdk|ADR 0004]]), on macOS (Apple Silicon) or Windows.

## The loop it's built around

1. **New project.** Pick a name, the format (16:9 or 9:16, fixed for the project) and the light or dark theme.
2. **Describe.** Tell Claude, in Croatian, what the video should show. Claude edits `scene.py`, renders, looks at frames, and fixes layout problems before it answers.
3. **Watch and adjust.** The preview plays the low-resolution render. The timeline shows sections, every animation, the narration and the subtitles. Each clip links to its line of code, and the line producing what's on screen lights up while the video plays.
4. **Retime by hand.** Drag a clip's edge and the `run_time=` literal in the code changes. Select clips and ask Claude about exactly that part.
5. **Voice.**
   - Drafts use a free voice: macOS's Croatian system voice, or local OmniVoice.
   - The final take is ElevenLabs, or the admin's own recording from the recording booth.
   - Animations stretch to the real speech.
6. **Export.** You get a 1080p mp4, `.vtt`/`.srt` subtitles taken from the narration, and a thumbnail.

## What it is not

- **Not a general video editor.** There is no compositing, there are no transitions between clips, and there are no keyframes. manim does all of the visuals ([[../04-decisions/0002-timeline-derived-from-render|ADR 0002]]).
- **Not a hosted service.** Everything runs on the admin's machine. The only network calls are to Claude (through the user's own sign-in), to ElevenLabs when chosen, and to the update server.

## Status

**Working:**

- Project creation and the editor
- Renders, with the timeline derived from them
- Timeline retiming, layout checks and render-error handling
- All four voice sources
- Subtitles, version history and export
- First-run environment install, and packaging with auto-update metadata

**Not yet verified end to end:**

- Claude chat with a signed-in account
- Windows
- A signed and notarized release

All three are in [[../06-operations/known-issues|known issues]]. Next steps are in [[roadmap]].
