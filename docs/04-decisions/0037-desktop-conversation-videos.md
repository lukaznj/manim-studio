---
status: accepted
date: 2026-10-17
---

# 0037 — Videos from desktop conversations

## Context

The original [[0009-mcp-server-later|Claude Desktop extension]] asked the external assistant to write and render scenes directly. A learner discussing a concept wants a complete video returned to the conversation. A producer also needs the editor and multiple projects. Studio already has independent agents for courses and exercise videos.

## Decision

- Keep one authenticated loopback endpoint and shared stdio bridge for Claude Desktop, Codex and compatible ChatGPT desktop local plugins. Accounts exposes connection setup; app builds produce both the Claude `.mcpb` and a desktop plugin ZIP. No credentials are embedded in either package.
- Add `create_video(prompt, title?, intent?)` and `get_video(job)`. The prompt must contain the relevant conversation context and audience. Creation returns a job ID; subsequent calls report progress, failure, warnings and exported media resources. Long production never holds a tool call open.
- Each video uses a project-bound background agent with the selected Studio account/model, writes its conversation and usage to that project, checks the render, then enters the existing export queue. It does not take over the editor's chat. Multiple requests can produce independent projects.
- Learn makes the video in the background and adds it to the library. Create also opens the project in the editor. In Both, default to Learn; an explicit `intent: create` opens production. A mode restricted to Learn or Create wins over a conflicting intent.
- The bridge launches the app without focusing its window for background requests. A Create request explicitly brings it forward. Media is exposed as readable MCP resource links, limited to files from completed video jobs; arbitrary paths are never accepted.
- Preserve the lower-level authoring tools for assistants that need direct control. They open the editor as before; complete concept-to-video requests should use `create_video`.
- Desktop clients decide whether video resources render inline or are downloadable. Do not promise inline playback before testing the host. ChatGPT web is not connected to this loopback server; a future hosted service would need its own authentication and media delivery. Local plugin distribution must meet each host's eligibility and installation requirements.

## Consequences

The external conversation triggers production, while the configured Studio agent incurs the production usage. This differs from direct scene-authoring calls where the external assistant does that work. Explain this distinction in connection setup. Jobs and resource handles last until Studio exits; completed files and project history remain on disk and in the library. A host disconnect does not cancel production.

Reference: [OpenAI desktop-only plugins](https://developers.openai.com/plugins/deploy/desktop-only), [Codex MCP](https://developers.openai.com/codex/mcp). No public plugin submission or release is performed by building these artifacts.
