// Projects Codex's and Antigravity's background agents are working in (agent.ts). Their bridge to
// Studio's tools names its project on every call, and mcp.ts takes only these, or the open one.
export const agentProjects = new Set<string>()
