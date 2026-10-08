# Manim Studio

Desktop editor (Electron) in which Maturita admins make maths explainer videos. The video is manim code (`scene.py`); Claude writes it, the app renders it, and the timeline is produced by each render. Product and decisions: `docs/` (an Obsidian vault). Start at `docs/README.md`.

## Stack

- **App:** Electron 44 + electron-vite.
  - `src/main` is Node (projects, renders, Claude, env, updater).
  - `src/preload` holds the typed bridge.
  - `src/renderer` is React 19, zustand and Monaco, with plain CSS tokens.
- **Shared types:** `src/shared/types.ts`, the IPC surface (`StudioApi`) and the timeline contract.
- **Python** (`python/`):
  - `studio` is what scenes import: `StudioScene`, the palette, layout constants, the voice service.
  - `studio_runner` is the CLI the app spawns: render, frame, thumbnail, export, align, tts-worker.
  - It runs in a pixi env the app installs (`python/pixi.toml` + `pixi.lock`).
- **Claude:** `@anthropic-ai/claude-agent-sdk`, signed in through the bundled Claude Code binary's own login. Never handle tokens; see `docs/04-decisions/0004-claude-via-agent-sdk.md`.
- **Project template:** `templates/project/`, which includes the `CLAUDE.md` Claude follows *inside* video projects.

## Commands

```bash
npm install && npm run fetch-pixi   # first time
npm run dev                         # app with hot reload
npm run typecheck && npm test       # TS checks + node:test units
npm run test:python                 # end-to-end render of python/tests/fixture
npm run build && node scripts/drive.mjs   # drive the built app over HTTP (screenshots); see docs/06-operations/development.md
```

## Rules that apply everywhere

- **UI copy is Croatian; identifiers, docs and comments are English.**
- **The timeline contract has two halves.** `render.py` produces it and `src/shared/types.ts` types it. Change both, and keep `python/tests/test_runner.py` passing.
- **No new runtime dependency without a reason** a few lines of code can't cover. Animations use CSS and native APIs, with no motion library.
- **Verify UI changes in the real app** (`scripts/drive.mjs` + screenshots), not just by typechecking. Most bugs found so far were layout bugs that only showed on screen.
- **Area rules.** `.claude/rules/` holds path-scoped rules for `python/`, `src/main/` and `src/renderer/`; they load when you touch those files.

## Docs

- **Read when:**
  - changing an architectural boundary: `docs/02-architecture/system-overview.md`
  - touching the voice path: `docs/02-architecture/voice-pipeline.md`
  - releasing: `docs/06-operations/releasing.md`
- **Before changing something an ADR covers,** check its status in `docs/04-decisions/README.md`. If you contradict an accepted ADR, say so and update it.
- **A PR that makes or changes a decision adds or updates an ADR and its index row.** Refactors and bug fixes don't touch docs.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
