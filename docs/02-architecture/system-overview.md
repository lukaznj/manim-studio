# System overview

```
 Claude Desktop ── stdio ──▶ Manim Studio extension (.mcpb, mcpb/server.ts)
                                    │ HTTP on 127.0.0.1 + token (mcp-endpoint.json)
                                    ▼
┌──────────────────────── Electron app ────────────────────────┐
│ renderer (React, src/renderer)                               │
│   Monaco · <video> preview · timeline · chat · booth         │
│        │ window.studio (preload, contextBridge)              │
│ main process (src/main)                                      │
│   projects · render queue · git history · settings           │
│   env (pixi, TinyTeX) · voice · updater · claude · mcp       │
└──────┬───────────────────┬────────────────────┬──────────────┘
       │ spawn             │ Agent SDK          │ https
       ▼                   ▼                    ▼
 python -m studio_runner   bundled Claude Code  GitHub Releases
 (pixi env in userData)    binary (user's own   (electron-updater)
   render / frames / dub / sign-in or key,
   thumbnail / export /    in-process MCP
   align / tts-worker      tools "studio")
```

## Processes

- **Renderer.**
  - Plain React with a zustand store (`src/renderer/src/store.ts`).
  - The playhead runs outside React: `lib/playback.ts` drives the timeline playhead, timecode and code-follow from one `requestAnimationFrame` loop.
  - The only way into the main process is `window.studio` ([[#IPC]]).
- **Main.** It owns the filesystem, processes and secrets.
  - **One project is open at a time.** `projects.ts` tracks it and watches `scene.py`, so edits Claude makes on disk show up in the editor.
  - **Renders go through `render.ts`.** A new preview render cancels the one in flight.
- **Python runner** (`python/studio_runner`).
  - It's a short-lived process per command, running in the pixi environment.
  - It prints JSON events on stdout behind the `@@studio ` prefix. Everything else on stdout is manim's log.
  - It is the only code that imports manim.
- **Claude Code binary.**
  - It ships inside the Agent SDK's platform package, unpacked from the asar archive.
  - It runs with the signed-in user's credentials.
  - The app gives it three in-process MCP tools (`render_preview`, `get_timeline`, `view_frames`) and the built-in file tools. Bash is not given, and edits are allowed only inside the project folder ([[../04-decisions/0004-claude-via-agent-sdk|ADR 0004]]).
- **Codex and Antigravity CLIs.** Optional agents chosen in Settings → Agent, installed on demand into `userData/codex/` and `userData/antigravity/` (pinned, hash-checked). Both get Studio's scene tools through the same stdio MCP bridge as Claude Desktop. The bridge names its project (`STUDIO_PROJECT`), so they also run the background agents (series, exercise sets, follow-ups), several projects at once ([[../04-decisions/0022-codex-as-second-agent|ADR 0022]], [[../04-decisions/0031-antigravity-as-third-agent|ADR 0031]], [[../04-decisions/0033-every-agent-in-the-background|ADR 0033]]).
  - Antigravity runs with a home folder of its own per project (`userData/antigravity/projects/<hash>`): its settings, permission rules, MCP config and Studio's brief (an always-on rule) are written there before every run, so the user's own `~/.gemini` is never touched. The sign-in is shared through the system keyring, or a token file in `userData/antigravity/home` that each project home links to.
- **Claude Desktop extension.** A stdio MCP server that Claude Desktop runs. It forwards tool calls to the app's local endpoint (`src/main/mcp.ts`) and starts Studio if needed ([[../04-decisions/0009-mcp-server-later|ADR 0009]]).
- **OmniVoice worker.**
  - It is optional and long-lived. Model loading is slow, so one HTTP server on localhost serves every render ([[voice-pipeline]]).

## Data on disk

| Where | What | In git? |
|---|---|---|
| `<project>/scene.py`, `project.json`, `CLAUDE.md` | The video, its settings, Claude's conventions | yes |
| `<project>/voice/tts/`, `voice/recordings/` | Generated speech and human takes | yes; regenerating costs money or a re-take |
| `<project>/voice/translations/<lang>.json` | Claude's translations of the narration, for dubbed exports | yes; edit to correct a sentence |
| `<project>/media/` | Your pictures and videos ([[../04-decisions/0012-own-media-in-scenes\|ADR 0012]]) | pictures yes, videos no |
| `<project>/sources/` | PDFs the video is made from, indexed into `.studio/sources/` ([[../04-decisions/0014-pdf-sources\|ADR 0014]]) | no |
| `<project>/.studio/` | Renders, `timeline.json`, frames, chat log, thumbnail | no |
| render cache (`~/Library/Caches/Manim Studio`, `%LOCALAPPDATA%\Manim Studio\Render cache`, `~/.cache/manim-studio`) | manim's partial movies and typeset text per project, rebuilt when missing, 20 GB at most ([[../04-decisions/0043-projects-folder-and-render-cache\|ADR 0043]]) | no |
| `<project>/exports/<name>/` | Videos per theme, audio tracks and subtitles per language, thumbnails ([[../04-decisions/0013-export-versions-and-languages\|ADR 0013]]) | no |
| `<set>/exercises.json`, `<set>/NN-<slug>/problem.md`, `solution.md` | An exercise set: its exercises in order, each a project with its statement and worked solution ([[../04-decisions/0025-exercise-sets\|ADR 0025]]) | the projects are their own repos |
| `<series>/exercises/` | A course's own exercise set, each exercise with the series bible as `course.md` ([[../04-decisions/0030-courses\|ADR 0030]]) | the projects are their own repos |
| `<set>/lecture/` | The lecture video joined from the exercises' exports, its subtitles and chapter list | no |
| `userData/python-env/` | pixi manifest + lock + `.pixi/envs/{default,omnivoice,transcribe}` | – |
| `userData/tinytex/` | LaTeX | – |
| `userData/runtime-cache/`, `userData/models/` | Private Pixi packages and speech model caches; removable with runtimes ([[../04-decisions/0056-private-runtime-cleanup\|ADR 0056]]) | – |
| `userData/settings.json`, `elevenlabs.secret`, `anthropic.secret`, `openai.secret`, `gemini.secret` | Settings; API keys encrypted with the OS keychain | – |
| `userData/antigravity/` | The Antigravity CLI (`<version>/`) and its own home (`home/`: settings, rules, MCP config, conversations) | – |
| `userData/mcp-endpoint.json` | Port and per-run token for the Claude Desktop extension; owner-only, removed on quit | – |

## IPC

- **Request/response.** The renderer only calls `ipcRenderer.invoke` methods, listed in `src/preload/index.ts` and typed by `StudioApi` in `src/shared/types.ts`.
- **Events.** Main pushes events on named channels: `render`, `setup`, `chat`, `file-changed`, `update`, `export`, `claude-login`.
- **Local media.** Files are served by the `studio-media://` protocol, with Range support so `<video>` can seek and CORS so waveforms can be fetched. It only serves paths inside open or recent projects and userData.

## Version history

- Every project is a git repository (isomorphic-git, so there is no git install to depend on).
- A commit is made after every successful preview render that changed something, and once per Claude turn.
- A restore first commits the current state, so restoring is itself undoable ([[../04-decisions/0007-history-is-git|ADR 0007]]).

## Video jobs from desktop conversations

The Claude extension and Codex/compatible ChatGPT desktop plugin share the stdio bridge. `create_video` starts a project-bound background agent using Studio’s configured account, then checks and exports its video. `get_video` reports progress and returns readable media resources. Learn stays in the background, Create opens the editor, and Both defaults to Learn unless the caller explicitly requests production. These agents do not replace the editor’s open chat; the library receives project-change events. The endpoint only serves media belonging to completed jobs. See [[../04-decisions/0037-desktop-conversation-videos|ADR 0037]].

## Course evidence in study chat

`study-context.ts` builds a read-only catalog and evidence index from the course plan, scripts, rendered transcripts and complete PDF indices. A provider-independent bounded retrieval loop selects local chunks or page images through opaque ids, then the tutor answers with validated citations. The typed `studyReference` IPC resolves a reference saved in the current episode’s chat, revalidates its course membership and freshness, and returns a video target or PDF page image. The renderer keeps fullscreen and offers returning to the original lesson. See [[../04-decisions/0055-course-aware-study-evidence|ADR 0055]].

## Background quick videos and creation progress

Quick videos now run the same project-bound agent factory as series episodes, with separate scripting, implementation, check and export checkpoints. The foreground project can change freely. `production-progress.ts` persists authoring estimates from the shared `report_progress` scene tool and derives fallback section coverage from saved files. A read-only IPC method supplies the shared production stages; preview/export counters keep their own measured phases. Native provider web tools are enabled for research without expanding file-write permissions. See [[../04-decisions/0057-creation-progress-and-research|ADR 0057]].

## Independent production

`series.ts` owns one controller per course; `quick.ts` owns one controller per quick video. Atomic local registries/checkpoints preserve every job, and saved plans survive rejected starts. Renderer state tracks all jobs and targets controls by folder. `agent-slots.ts` applies the optional global background-turn budget; `runner.ts` queues local drawing independently. Shutdown settles every controller. See [[../04-decisions/0058-independent-production-jobs|ADR 0058]].
