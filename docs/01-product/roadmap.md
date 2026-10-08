# Roadmap

Ordered by how much each item helps the admins. Nothing here is committed. Each item gets an ADR when it's picked up.

## Next

- **Publish to Maturita.**
  - Upload the export (mp4 + vtt + thumbnail) to R2 through the maturita admin API.
  - Attach it to a waypoint as a video tab.
  - Needs a video tab type in maturita and its player (expo-video), with sidecar VTT captions that can be toggled.
- **MCP server for Manim Studio.** See [[../04-decisions/0009-mcp-server-later|ADR 0009]].
  - Expose the app's tools (render, timeline, frames, project list, export) over MCP.
  - Claude Desktop, Claude Code, or maturita's own content workflows could then drive Studio from outside.
  - The in-process tools from [[../02-architecture/system-overview|the system overview]] are the starting set.
- **Bookmark editing on the timeline.** Drag a bookmark diamond onto another word in the narration. The voice track already shows the diamonds.
- **Cut-and-reorder sections.** Drag a section on the section lane to move its block of code (an AST move of the code between `next_section` calls).

## Later

- Intel Mac builds: a second CI job, see [[../06-operations/releasing|releasing]].
- Several scene files per project, with helper modules opened as editor tabs.
- Music and sound effects: an audio lane backed by `self.add_sound()`.
- Translating subtitles and narration into English for bilingual videos.
- A real-time preview through manim's OpenGL renderer, only if render latency becomes the bottleneck. Today, cached 480p renders take 2–10 s.
