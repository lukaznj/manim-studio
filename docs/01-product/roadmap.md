# Roadmap

Nothing here is committed. Each item gets an ADR when it's picked up.

## Done in 0.4.0

Background export queue ([[../04-decisions/0017-background-export-queue|ADR 0017]]), script first ([[../04-decisions/0016-script-first|0016]]), quick mode ([[../04-decisions/0018-quick-mode|0018]]), series mode ([[../04-decisions/0019-series-mode|0019]]), parallel exports ([[../04-decisions/0020-parallel-exports|0020]]), render servers ([[../04-decisions/0021-render-servers|0021]]) Codex as a second agent ([[../04-decisions/0022-codex-as-second-agent|0022]]) and exercise sets ([[../04-decisions/0025-exercise-sets|0025]]).

## Next

- **Run quick and series mode on many real courses** and fix what they get wrong: the quality bar is a series at the level of 3Blue1Brown's *Essence of linear algebra*.
- **Quick and series mode in the background**, so a whole series doesn't keep the app on its progress screen: the agent's turns would need to work on a project that isn't the open one.
- **Mass production, ready to publish.** The exported thumbnail card ([[../04-decisions/0026-thumbnail-card|ADR 0026]]) is a first step. Next could be: thumbnail variants to choose from; the agent writing each video's YouTube title, description, chapters and tags; a series-wide thumbnail style; uploading a whole series straight to a channel on a schedule.
- **A Linux ARM build of the render server** (a Raspberry Pi or an ARM home server): the locked Python environment would need `linux-aarch64`.

## Also next

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
- **Faster renders: the rendering engine needs work.** A 10-minute video took about 30 minutes to export on a CPU. First profile a long export, then hardware video encoding, more parallel slices for long videos and a warm render worker for previews; drawing on the GPU (manim's OpenGL renderer) is a larger, separate project, worth it if profiling shows drawing dominates. Render servers already let a faster machine do the work. Today, cached 480p renders take 2–10 s ([[../02-architecture/render-performance|render performance]]).

## Ideas to revisit

- **A hosted web service** for quick mode and series mode, paid per video: [[web-service|web service idea]].

## In forks, not here

Integrations with one particular platform, such as publishing to a study app's CMS, belong in a fork ([[../04-decisions/0011-open-source-english|ADR 0011]]). Maturita's "publish to a lesson" flow is the first: upload the export (mp4 + vtt + thumbnail) and attach it to a lesson as a video tab. If a fork needs a hook in Studio to stay small, such as an export target, the hook can come upstream.
