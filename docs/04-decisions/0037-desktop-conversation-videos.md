---
status: accepted
date: 2026-10-17
---

# 0037 — Videos from desktop conversations

## Context

The original [[0009-mcp-server-later|Claude Desktop extension]] asked the external assistant to write and render scenes directly. A learner discussing a concept wants a complete video returned to the conversation. A producer also needs the editor and multiple projects. Studio already has independent agents for courses and exercise videos.

## Decision

- Keep one authenticated loopback endpoint and shared stdio bridge for Claude Desktop, Codex and compatible ChatGPT desktop local plugins. Accounts exposes connection setup; app builds produce both the Claude `.mcpb` and a desktop plugin ZIP. No credentials are embedded in either package.
- Add `create_video(prompt, title?, intent?)` and `get_video(job)`. The prompt must contain the relevant conversation context and audience. Creation returns a job ID and instructs the host to end the turn. On request, one status call returns progress, failure, warnings or exported media resources.
- `wait_for_video(job, timeout_seconds?)` (added 2026-11-23) is for a user who wants the finished video in the same conversation. It waits on the job's own change events and returns what `get_video` would, or `state: working` when its time runs out, so the caller calls it again instead of sleeping or polling `get_video`. One call waits at most 45 s, because Claude Desktop, Codex and Antigravity give up on a tool call after about a minute. MCP progress notifications aren't sent: the bridge forwards one HTTP request per call, and none of these hosts documents that progress extends its timeout. Claude Code channels aren't used either, because they reach only Claude Code sessions started with channels enabled, not these hosts. Otherwise the turn still ends after `create_video`.
- `list_video_jobs` lists recent desktop requests by title, stage and job ID. `open_video` opens a selected job in Studio using its ID.
- Each video uses a project-bound background agent with the selected Studio account/model, writes its conversation and usage to that project, checks the render, then enters the existing export queue. It does not take over the editor's chat. Multiple requests can produce independent projects.
- Learn makes the video in the background and adds it to the library. Opening an unfinished project shows the standard quick-video progress and recovery controls. Create brings that screen forward automatically. In Both, default to Learn unless the request specifies `intent: create`. A mode restricted to Learn or Create wins over a conflicting intent.
- The bridge launches the app without focusing its window for background requests. A Create request explicitly brings it forward. Media is exposed as readable MCP resource links, limited to files from completed video jobs; arbitrary paths are never accepted.
- Preserve the lower-level authoring tools for assistants that need direct control. They open the editor as before; complete concept-to-video requests should use `create_video`.
- Desktop clients decide whether video resources render inline or are downloadable. Do not promise inline playback before testing the host. ChatGPT web is not connected to this loopback server; a future hosted service would need its own authentication and media delivery. Local plugin distribution must meet each host's eligibility and installation requirements.

## Consequences

The external conversation triggers production, while the configured Studio agent incurs the production usage. This differs from direct scene-authoring calls where the external assistant does that work. Explain this distinction in connection setup. Studio saves desktop jobs alongside its other quick-video checkpoints, and a host disconnect leaves production running.

Reference: [OpenAI desktop-only plugins](https://developers.openai.com/plugins/deploy/desktop-only), [Codex MCP](https://developers.openai.com/codex/mcp). No public plugin submission or release is performed by building these artifacts.
