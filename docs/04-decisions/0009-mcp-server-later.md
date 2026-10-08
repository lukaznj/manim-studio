---
status: proposed
date: 2026-10-08
---

# 0009 — An MCP server for Manim Studio, later

## Context

Today Claude works with Studio from inside the app, through three in-process MCP tools (`render_preview`, `get_timeline`, `view_frames`). Maturita already runs an MCP server for its content (`/mcp` on its backend, maturita ADR 0031). Some admins write lessons in Claude Desktop, and could want the same assistant to drive video work.

## Proposal

Expose Studio's capabilities as an MCP server:

- **Shape.** A local stdio server, or streamable HTTP on localhost while the app runs.
- **Tools:**
  - list and open projects
  - read and patch `scene.py`
  - render a preview and return the timeline
  - return frames as images
  - read voice blocks, export
- **Connection.** Claude Desktop and Claude Code connect to it like any MCP server, using the user's own Claude plan with no app sign-in involved.
- **Joined up with maturita.** One Claude conversation could then write a lesson through maturita's MCP and its explainer video through Studio's, and later attach the export to the lesson (see [[../01-product/roadmap|roadmap]]: "Publish to Maturita").

## Open questions

- Should the server live in the Electron main process (needs the app running) or in a headless runner (Python plus pixi env only)?
- Writes from an external client need the same project-path guard as `canUseTool` in [[0004-claude-via-agent-sdk]].
- Should the in-app chat move onto the same MCP server, giving one tool surface for both?
