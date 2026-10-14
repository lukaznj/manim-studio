# Roadmap

Nothing here is committed. Each item gets an ADR when it's picked up.

## Next, in this order

1. **Background export queue.** Each export belongs to its own project, the dialog can be closed, progress shows in the status bar, and several exports wait in line. You start the next video while the last one exports. Then release 0.4.0.
2. **Script first** ([[../04-decisions/0016-script-first|ADR 0016]], proposed). Claude writes `script.md` (the idea, the sections, the narration, the visuals) and the user approves it before any code. The basis for everything below.
3. **Quick mode.** Describe the video, attach PDFs, and that's it: no editor, no timeline. Studio scripts it, makes it, checks it, and exports it through the queue. The project stays a normal project, so it can be opened and fixed afterwards.
4. **Series mode.** Upload a batch of PDFs, such as a course's lectures. Claude proposes the episodes (one per PDF, or merged, or split further) and you accept or change the plan. A series bible (`series.md`) keeps the notation and visual language consistent, and lets an episode refer back to earlier ones. With quick mode, a whole mini-series is made unattended. The end goal is series at the level of 3Blue1Brown's *Essence of linear algebra*.
5. **Parallel exports.** Split an export into chunks by animation and render them on all cores ([[../02-architecture/render-performance|render performance]], option 3).
6. **Remote render worker.** A Docker image, published as its own repo, that takes export jobs from the queue so a home server does the work and your own computer stays free. The app pairs with it through a code that holds its address and a token. You and friends reach it over Tailscale; anyone else on their own network or through a tunnel. Narration is made on your computer and uploaded with the project, since the worker has no voice of its own.
7. **Other agents.** Codex and Antigravity next to Claude, behind one agent-provider interface (sign-in, chat with the scene tools, models, usage, translation). Codex can reuse the scene tools over MCP. Needs its own ADR.

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
- Faster renders: profile first, then a warm render worker (parallel exports are in the list above). The OpenGL renderer comes last, only if render latency stays the bottleneck. Today, cached 480p renders take 2–10 s ([[../02-architecture/render-performance|render performance]]).

## Ideas to revisit

- **A hosted web service** for quick mode and series mode, paid per video: [[web-service|web service idea]].

## In forks, not here

Integrations with one particular platform, such as publishing to a study app's CMS, belong in a fork ([[../04-decisions/0011-open-source-english|ADR 0011]]). Maturita's "publish to a lesson" flow is the first: upload the export (mp4 + vtt + thumbnail) and attach it to a lesson as a video tab. If a fork needs a hook in Studio to stay small, such as an export target, the hook can come upstream.
