# Roadmap

Nothing here is committed. Each item gets an ADR when it's picked up.

## Next

- **Model and effort comparison.** Find which model and effort level make the best videos for the usage they cost. That decides the default, and what to recommend on smaller plans.
  - A fixed set of briefs, run unchanged across models × effort levels:
    - portrait and landscape
    - one formula-heavy and one graph-heavy video
    - one narrated in a language other than English
  - Measure per run:
    - render errors and layout warnings in the final render
    - turns and tool calls until Claude says it's done
    - wall time
    - usage: tokens, or cost from the `result` message
    - a blind human rating of the finished video
  - Claude Code's session transcript records the model and effort of every turn, so each run can be audited afterwards.
  - Output: a results note in this vault, then an ADR if it changes the default.
- **Bookmark editing on the timeline.** Drag a bookmark diamond onto another word in the narration. The voice track already shows the diamonds.
- **Cut-and-reorder sections.** Drag a section on the section lane to move its block of code (an AST move of the code between `next_section` calls).
- **Signed builds.** A notarized macOS build, which can update itself, and a signed Windows installer ([[../06-operations/releasing|releasing]]).

## Later

- Claude Code and other MCP clients: the extension's server (`out/mcpb/server/index.js`) is a plain stdio MCP server, so they can run it too. Documenting that is all it needs ([[../04-decisions/0009-mcp-server-later|ADR 0009]]).

- Intel Mac builds: a second macOS job, see [[../06-operations/releasing|releasing]].
- Several scene files per project, with helper modules opened as editor tabs.
- Music and sound effects: an audio lane backed by `self.add_sound()`.
- Translated subtitles and narration, for one video in several languages.
- Faster renders: profile first, then a warm render worker and parallel exports. The OpenGL renderer comes last, only if render latency stays the bottleneck. Today, cached 480p renders take 2–10 s ([[../02-architecture/render-performance|render performance]]).

## In forks, not here

Integrations with one particular platform, such as publishing to a study app's CMS, belong in a fork ([[../04-decisions/0011-open-source-english|ADR 0011]]). Maturita's "publish to a lesson" flow is the first: upload the export (mp4 + vtt + thumbnail) and attach it to a lesson as a video tab. If a fork needs a hook in Studio to stay small, such as an export target, the hook can come upstream.
