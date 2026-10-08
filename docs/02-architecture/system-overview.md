# System overview

```
┌──────────────────────── Electron app ────────────────────────┐
│ renderer (React, src/renderer)                               │
│   Monaco · <video> preview · timeline · chat · booth         │
│        │ window.studio (preload, contextBridge)              │
│ main process (src/main)                                      │
│   projects · render queue · git history · settings           │
│   env (pixi, TinyTeX) · voice · updater · claude             │
└──────┬───────────────────┬────────────────────┬──────────────┘
       │ spawn             │ Agent SDK          │ https
       ▼                   ▼                    ▼
 python -m studio_runner   bundled Claude Code  GitHub Releases
 (pixi env in userData)    binary (user's own   (electron-updater)
   render / frames /       sign-in or key,
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
- **OmniVoice worker.**
  - It is optional and long-lived. Model loading is slow, so one HTTP server on localhost serves every render ([[voice-pipeline]]).

## Data on disk

| Where | What | In git? |
|---|---|---|
| `<project>/scene.py`, `project.json`, `CLAUDE.md` | The video, its settings, Claude's conventions | yes |
| `<project>/voice/tts/`, `voice/recordings/` | Generated speech and human takes | yes; regenerating costs money or a re-take |
| `<project>/.studio/` | Renders, `timeline.json`, frames, chat log, thumbnail | no |
| `<project>/exports/` | Final mp4/vtt/srt/jpg | no |
| `userData/python-env/` | pixi manifest + lock + `.pixi/envs/{default,omnivoice,transcribe}` | – |
| `userData/tinytex/` | LaTeX | – |
| `userData/settings.json`, `elevenlabs.secret`, `anthropic.secret` | Settings; API keys encrypted with the OS keychain | – |

## IPC

- **Request/response.** The renderer only calls `ipcRenderer.invoke` methods, listed in `src/preload/index.ts` and typed by `StudioApi` in `src/shared/types.ts`.
- **Events.** Main pushes events on named channels: `render`, `setup`, `chat`, `file-changed`, `update`, `export`, `claude-login`.
- **Local media.** Files are served by the `studio-media://` protocol, with Range support so `<video>` can seek and CORS so waveforms can be fetched. It only serves paths inside open or recent projects and userData.

## Version history

- Every project is a git repository (isomorphic-git, so there is no git install to depend on).
- A commit is made after every successful preview render that changed something, and once per Claude turn.
- A restore first commits the current state, so restoring is itself undoable ([[../04-decisions/0007-history-is-git|ADR 0007]]).
