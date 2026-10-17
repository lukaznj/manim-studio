# Manim Studio

Open-source (MIT) desktop editor (Electron) for maths explainer videos. The video is manim code (`scene.py`); an agent writes it, the app renders it, and the timeline is produced by each render. Product and decisions: `docs/` (an Obsidian vault). Start at `docs/README.md`.

## Stack

- **App:** Electron 44 + electron-vite.
  - `src/main` is Node (projects, renders, agents, env, updater).
  - `src/preload` holds the typed bridge.
  - `src/renderer` is React 19, zustand and Monaco, with plain CSS tokens.
- **Shared types:** `src/shared/types.ts`, the IPC surface (`StudioApi`) and the timeline contract.
- **Python** (`python/`):
  - `studio` is what scenes import: `StudioScene`, the palette, layout constants, the voice service.
  - `studio_runner` is the CLI the app spawns: render, frame, thumbnail, export, align, tts-worker.
  - It runs in a pixi env the app installs (`python/pixi.toml` + `pixi.lock`).
- **Agents:** Claude uses `@anthropic-ai/claude-agent-sdk`; Codex and Antigravity use their managed CLIs. Sign-in belongs to each agent. Never handle login tokens; see ADRs 0004, 0022 and 0031.
- **Desktop integrations:** the extension in `mcpb/` (built into `out/manim-studio.mcpb`) forwards to `src/main/mcp.ts`. Tool names, descriptions and inputs live in `src/shared/studio-tools.ts` for internal agents and external assistants. See ADRs 0009 and 0037.
- **Project template:** `templates/project/`, which includes the `CLAUDE.md` agents follow *inside* video projects.

## Commands

```bash
npm install && npm run fetch-pixi   # first time
npm run dev                         # app with hot reload
npm run typecheck && npm test       # TS checks + node:test units
npm run test:python                 # end-to-end render of python/tests/fixture
npm run build && node scripts/drive.mjs   # drive the built app over HTTP (screenshots); see docs/06-operations/development.md
```

## Rules that apply everywhere

- **English source, localized UI:** identifiers, docs, comments and UI catalog keys are English; the interface supports English and Croatian (ADR 0036). The narration language is per project (`project.json` `voice.language`), so never assume English in the voice, subtitle or text-layout paths either ([ADR 0011](docs/04-decisions/0011-open-source-english.md)).
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
