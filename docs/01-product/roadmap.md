# Roadmap

Nothing here is committed. Each item gets an ADR when it's picked up.

## Next

- **MCP server for Manim Studio.** See [[../04-decisions/0009-mcp-server-later|ADR 0009]].
  - Expose the app's tools (render, timeline, frames, project list, export) over MCP.
  - Claude Desktop, Claude Code or other agents could then drive Studio from outside.
  - The in-process tools from [[../02-architecture/system-overview|the system overview]] are the starting set.
- **Bookmark editing on the timeline.** Drag a bookmark diamond onto another word in the narration. The voice track already shows the diamonds.
- **Cut-and-reorder sections.** Drag a section on the section lane to move its block of code (an AST move of the code between `next_section` calls).
- **Signed builds.** A notarized macOS build, which can update itself, and a signed Windows installer ([[../06-operations/releasing|releasing]]).

## Later

- Intel Mac builds: a second macOS job, see [[../06-operations/releasing|releasing]].
- Several scene files per project, with helper modules opened as editor tabs.
- Music and sound effects: an audio lane backed by `self.add_sound()`.
- Translated subtitles and narration, for one video in several languages.
- A real-time preview through manim's OpenGL renderer, only if render latency becomes the bottleneck. Today, cached 480p renders take 2–10 s.

## In forks, not here

Integrations with one particular platform, such as publishing to a study app's CMS, belong in a fork ([[../04-decisions/0011-open-source-english|ADR 0011]]). Maturita's "publish to a lesson" flow is the first: upload the export (mp4 + vtt + thumbnail) and attach it to a lesson as a video tab. If a fork needs a hook in Studio to stay small, such as an export target, the hook can come upstream.
