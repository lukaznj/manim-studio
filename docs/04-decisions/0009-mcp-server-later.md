---
status: accepted
date: 2026-10-08
---

# 0009 — Claude Desktop drives Studio through an extension

## Context

Inside the app, Claude works through three in-process tools (`render_preview`, `get_timeline`, `view_frames`). Many people already talk to Claude in Claude Desktop, sometimes alongside their content platform's own MCP server. Telling that Claude "make me a video about the vertex of a parabola" should open Manim Studio and make it there.

Constraints:

- Claude Desktop starts every installed extension when it launches, so the tool list can't depend on Studio running. Starting Studio with Claude Desktop would be wrong.
- Reports put Claude Desktop's limit on a single tool call somewhere between one and four minutes, and it ignores progress notifications. A final 1080p render can take longer.
- Colleagues aren't developers. Editing `claude_desktop_config.json` by hand is out.

## Decision

- **A Claude Desktop extension** (`.mcpb`, an MCP Bundle), built from `mcpb/server.ts` by `scripts/build-mcpb.mjs` and shipped inside the app.
  - Settings → Claude → "Add to Claude Desktop" opens it, and Claude Desktop shows its own install dialog.
  - It's a `node` extension: Claude Desktop supplies Node, so nothing else gets installed.
- **The extension is a thin proxy.** It is a stdio MCP server whose tool list comes from `src/shared/studio-tools.ts`, so listing works without the app.
  - On a tool call, it reads `<userData>/mcp-endpoint.json` (port, token, pid) and checks the app answers.
  - If the app isn't running, it starts it: `open -b cc.razem.manimstudio` on macOS, `manim-studio://` on Windows and Linux. It then waits up to a minute and forwards the call.
- **The app owns the work.** `src/main/mcp.ts` serves `POST /tools/<name>` on 127.0.0.1 with a random per-run bearer token, in a file only this user can read.
  - The handlers reuse the in-app ones (`scene-tools.ts`), so both Claudes see the same render reports and frames.
- **Tools:**
  - `list_projects`, `create_project`, `open_project`
  - `get_scene`, `write_scene`, `edit_scene`
  - `render_preview`, `get_timeline`, `view_frames`
  - `export_video`
- **Claude Desktop does the writing, and the app shows it.**
  - `create_project` and `open_project` bring the window forward with the project open, and return the guide: format, theme, language and the project's `CLAUDE.md`.
  - Writes go through `saveScene`, and the editor updates at once.
  - Studio doesn't render on its own for these writes; Claude asks with `render_preview`, as the in-app chat does.
- **Within the time limit.**
  - `render_preview` waits at most 45 s, then says to call again. The render keeps going.
  - `export_video` starts the export in the background. Later calls report progress, then the files. A finished export is reported until `scene.py` changes.
- **One app per data folder.** A single-instance lock makes a second launch, such as a link, bring the running copy forward.

## Consequences

- Each person's usage stays on their own Claude Desktop plan. Studio's in-app chat isn't involved, so there's no double usage.
- Only `scene.py` of the open project can be written. There is no general file access and no shell.
- Tools change in one place, `src/shared/studio-tools.ts`. The extension is rebuilt with every app build, so app and extension versions match. An older extension asking for a tool the app lacks gets a clear "update both" error.
- `scripts/desktop-smoke.mjs` plays Claude Desktop: it starts the built extension over stdio and makes a short video through it.
- Linux AppImages may not register `manim-studio://`. Then the extension asks the user to open Studio themselves.
- Not done: Studio's in-app chat still uses its own in-process server rather than this endpoint. Merging them only pays off if the tool sets diverge.
