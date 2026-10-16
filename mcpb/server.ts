// The Manim Studio extension for Claude Desktop (ADR 0009). Claude Desktop runs this as a stdio
// MCP server when it starts, so listing the tools must not touch Studio. On a tool call it finds
// the running app through <userData>/mcp-endpoint.json, starting Studio if needed, and forwards
// the call to it on 127.0.0.1 (src/main/mcp.ts). Bundled into an .mcpb by scripts/build-mcpb.mjs.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { desktopInstructions, desktopTools, type DesktopToolName } from '../src/shared/studio-tools'

declare const VERSION: string // set by the build

type Endpoint = { port: number; token: string; pid: number }

/** Electron's userData for "Manim Studio" on each platform (STUDIO_USER_DATA: the test driver's). */
function userData(): string {
  if (process.env.STUDIO_USER_DATA) return process.env.STUDIO_USER_DATA
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Manim Studio')
  if (process.platform === 'win32') return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Manim Studio')
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'Manim Studio')
}

function readEndpoint(): Endpoint | null {
  try {
    const e = JSON.parse(readFileSync(join(userData(), 'mcp-endpoint.json'), 'utf8')) as Endpoint
    process.kill(e.pid, 0) // throws if a crashed app left the file behind
    return e
  } catch {
    return null
  }
}

// Codex and Antigravity run this bridge with STUDIO_PROJECT: their tool calls are for that project,
// which may be one a background agent is making rather than the open one.
const auth = (e: Endpoint) => ({
  authorization: `Bearer ${e.token}`,
  ...(process.env.STUDIO_PROJECT ? { 'x-studio-project': encodeURIComponent(process.env.STUDIO_PROJECT) } : {}),
})

async function healthy(e: Endpoint): Promise<boolean> {
  try {
    return (await fetch(`http://127.0.0.1:${e.port}/health`, { headers: auth(e), signal: AbortSignal.timeout(2000) })).ok
  } catch {
    return false
  }
}

function launch(): void {
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', ['-b', 'cc.razem.manimstudio']]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', 'manim-studio://open']]
        : ['xdg-open', ['manim-studio://open']]
  spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true })
    .on('error', () => undefined)
    .unref()
}

async function endpoint(): Promise<Endpoint> {
  let launched = false
  for (let i = 0; i < 120; i++) {
    const e = readEndpoint()
    if (e && (await healthy(e))) return e
    if (!launched) {
      launch()
      launched = true
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('Manim Studio didn’t start within a minute. Open it once by hand (install it first, if needed), then try again.')
}

async function call(name: DesktopToolName, args: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const e = await endpoint()
    const res = await fetch(`http://127.0.0.1:${e.port}/tools/${name}`, {
      method: 'POST',
      headers: { ...auth(e), 'content-type': 'application/json' },
      body: JSON.stringify(args),
    })
    if (res.status === 404) throw new Error(`This version of Manim Studio has no ${name} tool. Update the app and the extension to the same version.`)
    if (!res.ok) throw new Error(`Manim Studio answered ${res.status}.`)
    return (await res.json()) as CallToolResult
  } catch (err) {
    return { content: [{ type: 'text', text: (err as Error).message }], isError: true }
  }
}

const server = new McpServer({ name: 'manim-studio', version: VERSION }, { instructions: desktopInstructions })
for (const name of Object.keys(desktopTools) as DesktopToolName[]) {
  const { description, shape } = desktopTools[name]
  server.registerTool(name, { description, inputSchema: shape }, (args: Record<string, unknown>) => call(name, args))
}
void server.connect(new StdioServerTransport())
