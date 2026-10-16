---
status: accepted
date: 2026-10-16
---

# 0033 — Every agent runs the background work, and the accounts are in one place

## Context

Series episodes, exercise sets and follow-up videos are made by background agents (ADR 0023, 0025, 0028), several projects at once. Codex (ADR 0022) and Antigravity (ADR 0031) reach Studio's tools through the MCP bridge, which worked on the open project only, so those features asked users of the other agents to switch to Claude. Antigravity also kept one settings folder for every run. And someone with a Claude plan, a ChatGPT plan and a Google account could only see the chosen agent's sign-in.

## Decision

- **The bridge names its project.** Codex's and Antigravity's runs start `mcpb/server.ts` with `STUDIO_PROJECT`; it sends it as `x-studio-project`, and `mcp.ts` runs the scene tools on that project if it's open or a background agent is working in it (`agent-projects.ts`), and refuses any other. Claude Desktop sends none and keeps the open project.
- **Background agents on any agent.** `agent.ts` runs the same `EpisodeAgent` on Codex (`codexSession`, a thread of its own per project, sandboxed to it) and on Antigravity (`antigravitySession`). Their turns go into the project's chat.json and its thread or conversation id into project.json, so the chat carries on from what the agent did. The "choose Claude" checks in series, exercise sets and follow-ups are gone; "Agents at once" applies to every agent.
- **Antigravity has a home per project** (ADR 0031), so its runs in different projects never share settings, permission rules, the brief or the bridge.
- **Reading exercises from pictures** works with every agent: Codex gets them as local images, Antigravity as files to look at.
- **Settings → Accounts** shows every agent's sign-in and key, chosen or not (Claude account or Anthropic key; Codex install, ChatGPT sign-in or OpenAI key; Antigravity install, Google sign-in or Gemini key) and the ElevenLabs key, with "Use this agent". Settings → Agent keeps the choice, the model and effort, and how many agents run at once. The IPC sign-in calls take an optional agent.

## Consequences

- Codex and Antigravity turns have no usage entries and no plan-limit waits (their streams report no price or reset time).
- Not run here: real Codex and Antigravity turns in the background (no sign-in available). The bridge's project check and Antigravity's per-project home were tested with the real CLI up to its sign-in check.
