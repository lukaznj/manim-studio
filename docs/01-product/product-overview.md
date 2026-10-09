# Product overview

**Manim Studio** is an open-source desktop editor for short maths explainer videos. A video is [manim](https://www.manim.community) code. Claude writes and fixes that code. The app renders it, shows it on a timeline, gives it a voice and subtitles, and exports it.

## Who it's for

People who make maths explainers but don't want to hand-write manim: teachers, tutors, and content teams for study apps and courses. They don't have to be programmers. The code is always there for whoever wants it.

It started as the video tool for the admins of Maturita, a Croatian matura study app. Since [[../04-decisions/0011-open-source-english|ADR 0011]] it is general-purpose, and anything Maturita-specific lives in a fork.

Each person uses their own Claude plan or Anthropic API key ([[../04-decisions/0004-claude-via-agent-sdk|ADR 0004]]). It runs on macOS (Apple Silicon), Windows and Linux.

## The loop it's built around

1. **New project.** Pick a name, the format (16:9 or 9:16, fixed for the project), the light or dark theme, and the narration language.
2. **Describe.** Tell Claude what the video should show. Claude edits `scene.py`, renders, looks at frames, and fixes layout problems before it answers. Narration and on-screen text come out in the project's language, whatever language you chat in.
3. **Watch and adjust.** The preview plays the low-resolution render. The timeline shows sections, every animation, the narration and the subtitles. Each clip links to its line of code, and the line producing what's on screen lights up while the video plays.
4. **Retime by hand.** Drag a clip's edge and the `run_time=` literal in the code changes. Select clips and ask Claude about exactly that part.
5. **Voice.**
   - Drafts use a free voice: the system voice for the project's language, or local OmniVoice.
   - The final take is ElevenLabs, OmniVoice cloning your voice, or your own recording from the recording booth.
   - Animations stretch to the real speech.
6. **Export.** A 1080p mp4 in the light theme, the dark one, or both, with subtitles and a thumbnail. Add languages and you also get each language's narration as an audio track plus its subtitles: what YouTube needs to offer viewers several languages ([[../04-decisions/0013-export-versions-and-languages|ADR 0013]]).

Along the way you can add your own pictures and videos in the Media tab ([[../04-decisions/0012-own-media-in-scenes|ADR 0012]]). The first project you open starts a short tour of the editor.

## What it is not

- **Not a general video editor.** There is no compositing, there are no transitions between clips, and there are no keyframes. manim does all of the visuals ([[../04-decisions/0002-timeline-derived-from-render|ADR 0002]]).
- **Not a hosted service.** Everything runs on your machine. The only network calls go to Claude (with your own sign-in or key), to ElevenLabs when you choose it, to model downloads for OmniVoice and Whisper, and to GitHub Releases for updates.

## Status

**Working, verified on macOS:**

- Project creation and the editor
- Renders, with the timeline derived from them
- Timeline retiming, layout checks and render-error handling
- Claude chat end to end, with a Pro plan sign-in: edits, renders, frames, timeline, session resume
- All four voice sources except a live ElevenLabs call, plus subtitles, version history and export
- First-run environment install, and the packaged app with its Liquid Glass icon

**Built in CI but not run by hand yet:** Windows, Linux, and a signed and notarized macOS release. All three are in [[../06-operations/known-issues|known issues]]. Next steps are in [[roadmap]].
