---
paths:
  - "src/main/**"
  - "src/preload/**"
  - "src/shared/**"
---

# Main process, preload and IPC

- **IPC.** Every renderer capability is a method on `StudioApi` (`src/shared/types.ts`), registered in `src/main/index.ts` (`handle(...)`) and listed in `src/preload/index.ts`. Keep the three in sync. Push events go on the channels named in `EventChannel`.
- **Claude auth** (ADR 0004):
  - Sign-in only through the bundled binary's `auth login`; never read, store or forward Claude credentials.
  - Every child process gets `cleanEnv()`, which strips `ANTHROPIC_*`, `CLAUDE_CODE_*`, `PIXI_*`, `CONDA_*`, `PYTHON*`.
  - The only key that goes back in is the user's own Anthropic API key, if they saved one (`claude.ts:claudeEnv`).
- **Paths** come from `paths.ts`, which differs between dev and packaged builds (`resources/` vs `process.resourcesPath`). Never fall back to binaries on PATH (an old pixi broke installs once).
- **Secrets** (the ElevenLabs and Anthropic API keys) use `safeStorage` via `settings.ts:setSecret`. They reach child processes (Python, Claude Code) as env vars, never as arguments, and never go to the renderer.
- **Renders.** `render.ts` serializes renders per quality and tags events with an `id`; the renderer ignores superseded ids.
- **Tools for Claude** are defined once in `src/shared/studio-tools.ts`. Handlers live in `scene-tools.ts` (shared) and `mcp.ts` (Claude Desktop only). Claude Desktop's calls must return within 45 s; anything longer runs in the background and reports on the next call.
- **The local endpoint** (`mcp.ts`) binds 127.0.0.1 only, checks the bearer token on every request, and writes only the open project's `scene.py`.
- **Claude's tool permissions:** writes only inside the project, reads inside the project, the studio package and the manim sources. Keep `canUseTool` that strict.
