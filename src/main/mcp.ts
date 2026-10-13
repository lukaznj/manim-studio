// Claude Desktop drives Studio through the extension in mcpb/ (ADR 0009). The extension is the
// MCP server Claude Desktop talks to; it forwards each tool call here, to a small HTTP endpoint
// on 127.0.0.1. The port and a per-run token are written to <userData>/mcp-endpoint.json
// (readable by this user only), which is how the extension finds the running app.
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { app } from 'electron'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { z } from 'zod'
import { desktopTools, type DesktopToolName } from '../shared/studio-tools'
import type { ClaudeDesktopStatus, ExportResult } from '../shared/types'
import { languageName, mediaNote } from './claude'
import { createProject, listProjects, readScene, requireProject, saveScene } from './projects'
import { getSettings } from './settings'
import { getTimeline, readSource, renderPreview, textResult, viewFrames, viewSourcePages } from './scene-tools'
import { slugify } from './slug'
import { sourcesNote } from './sources'

export interface DesktopHost {
  /** Shows the window and opens the project in it, the same way a click on Home does. */
  openInWindow(dir: string): Promise<void>
  /** Tells the window scene.py changed under it (the editor updates; no render, Claude asks for one). */
  sceneWritten(source: string): void
  exportVideo(): Promise<ExportResult>
}

// Claude Desktop gives up on a tool call after about a minute, so nothing here waits longer.
const MAX_WAIT_MS = 45_000

const endpointFile = () => join(app.getPath('userData'), 'mcp-endpoint.json')

export function startDesktopEndpoint(host: DesktopHost): void {
  const token = randomBytes(32).toString('hex')
  const server = createServer(async (req, res) => {
    const reply = (status: number, body?: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body ?? {}))
    if (req.headers.authorization !== `Bearer ${token}`) return reply(401)
    if (req.method === 'GET' && req.url === '/health') return reply(200, { app: 'Manim Studio', version: app.getVersion() })
    const name = req.url?.match(/^\/tools\/([a-z_]+)$/)?.[1]
    if (req.method !== 'POST' || !name || !(name in desktopTools)) return reply(404)
    try {
      const args = z.object(desktopTools[name as DesktopToolName].shape).parse(JSON.parse((await body(req)) || '{}'))
      reply(200, await run(host, name as DesktopToolName, args as Record<string, unknown>))
    } catch (e) {
      reply(200, textResult((e as Error).message, true))
    }
  })
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address() as AddressInfo
    writeFileSync(endpointFile(), JSON.stringify({ port, token, pid: process.pid }), { mode: 0o600 })
  })
  app.on('will-quit', () => rmSync(endpointFile(), { force: true }))
}

/** Whether Claude Desktop has our extension: it records installs in its own data folder. */
export function claudeDesktopStatus(): ClaudeDesktopStatus {
  const dir =
    process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support', 'Claude')
      : process.platform === 'win32'
        ? join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Claude')
        : join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'Claude')
  const status: ClaudeDesktopStatus = { installed: false, enabled: false, version: null, current: app.getVersion() }
  type Installed = { version?: string; manifest?: { name?: string; version?: string } }
  try {
    const { extensions } = JSON.parse(readFileSync(join(dir, 'extensions-installations.json'), 'utf8')) as { extensions: Record<string, Installed> }
    const [id, ext] = Object.entries(extensions).find(([, e]) => e.manifest?.name === 'manim-studio') ?? []
    if (!id || !ext) return status
    let enabled = true
    try {
      enabled = JSON.parse(readFileSync(join(dir, 'Claude Extensions Settings', `${id}.json`), 'utf8')).isEnabled !== false
    } catch {
      // no settings file yet: Claude Desktop's default is on
    }
    return { ...status, installed: true, enabled, version: ext.version ?? ext.manifest?.version ?? null }
  } catch {
    return status // no Claude Desktop, or it changed how it stores extensions
  }
}

function body(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

async function run(host: DesktopHost, name: DesktopToolName, args: Record<string, unknown>): Promise<CallToolResult> {
  switch (name) {
    case 'list_projects': {
      const list = listProjects().filter((p) => !p.missing)
      if (!list.length) return textResult('No projects yet. create_project makes one.')
      const lines = list.map(
        (p) =>
          `- "${p.name}": ${p.aspect}${p.duration ? `, ${Math.round(p.duration)} s` : ', not rendered yet'}, changed ${new Date(p.updatedAt).toLocaleString('en-GB')}, ${p.path}`,
      )
      return textResult(lines.join('\n'))
    }
    case 'create_project': {
      const a = args as { title: string; format: '16:9' | '9:16'; theme?: 'dark' | 'light'; language?: string }
      const dir = await createProject({ name: a.title, aspect: a.format, theme: a.theme ?? 'dark', language: a.language ?? getSettings().defaultVoice.language })
      await host.openInWindow(dir)
      return textResult(guide())
    }
    case 'open_project': {
      await host.openInWindow(findProject(String(args.project)))
      return textResult(`${guide()}\n\n--- scene.py ---\n${readScene()}`)
    }
    case 'get_scene':
      return textResult(readScene())
    case 'write_scene':
      return writeScene(host, String(args.source))
    case 'edit_scene': {
      const source = readScene()
      const oldText = String(args.old_text)
      const count = source.split(oldText).length - 1
      if (count !== 1) return textResult(count ? `That text occurs ${count} times in scene.py; include more of the surrounding lines.` : 'That text isn’t in scene.py. Call get_scene to see the current file.', true)
      return writeScene(host, source.replace(oldText, () => String(args.new_text)))
    }
    case 'render_preview':
      return renderPreview(MAX_WAIT_MS)
    case 'get_timeline':
      return getTimeline()
    case 'view_frames':
      return viewFrames(args.times as number[])
    case 'read_source':
      return readSource(String(args.source), args.from_page as number | undefined, args.to_page as number | undefined)
    case 'view_source_pages':
      return viewSourcePages(String(args.source), args.pages as number[])
    case 'export_video':
      return exportVideo(host)
  }
}

function writeScene(host: DesktopHost, source: string): CallToolResult {
  saveScene(source) // also tells the file watcher this isn't an outside edit
  host.sceneWritten(source)
  return textResult(`Saved scene.py (${source.split('\n').length} lines). Call render_preview.`)
}

/** What Claude needs before writing this project's scene: the facts, then the project's own CLAUDE.md. */
function guide(): string {
  const { path, meta } = requireProject()
  const conventions = existsSync(join(path, 'CLAUDE.md')) ? readFileSync(join(path, 'CLAUDE.md'), 'utf8') : ''
  const language = languageName(meta.voice.language)
  return [
    `"${meta.name}" is open in Manim Studio (${path}).`,
    `Format ${meta.aspect} (${meta.aspect === '9:16' ? 'portrait for phones, frame 8 × 14.2 units' : 'landscape, frame 14.2 × 8 units'}), video theme "${meta.theme}", voice provider "${meta.voice.provider}".`,
    `Write all narration and on-screen text in ${language}.`,
    mediaNote(path),
    sourcesNote(path),
    'Change scene.py only through write_scene or edit_scene. After each change call render_preview, then view_frames at the moments you changed.',
    'The guide below speaks of render_preview and view_frames; they are the same tools here.',
    '',
    '--- CLAUDE.md, the conventions for this project ---',
    conventions,
  ].join('\n')
}

function findProject(query: string): string {
  if (existsSync(join(query, 'project.json'))) return query
  const all = listProjects().filter((p) => !p.missing)
  const q = query.trim().toLowerCase()
  const exact = all.filter((p) => p.name.toLowerCase() === q)
  const hits = exact.length ? exact : all.filter((p) => p.name.toLowerCase().includes(q) || basename(p.path) === slugify(query))
  if (hits.length === 1) return hits[0].path
  throw new Error(
    hits.length
      ? `Several projects match "${query}": ${hits.map((p) => `"${p.name}"`).join(', ')}. Use the full title or the folder.`
      : `No project matches "${query}". list_projects shows them all.`,
  )
}

// One export at a time. A finished one is reported until scene.py changes; then a call starts a new one.
type ExportJob = { dir: string; source: string; result?: ExportResult; error?: string }
let job: ExportJob | null = null

async function exportVideo(host: DesktopHost): Promise<CallToolResult> {
  const dir = requireProject().path
  const source = readScene()
  const running = job && !job.result && !job.error
  if (!running && !(job?.result && job.dir === dir && job.source === source)) {
    const started: ExportJob = (job = { dir, source })
    host.exportVideo().then(
      (result) => (started.result = result),
      (e: Error) => (started.error = e.message),
    )
  }
  const current = job!
  for (let waited = 0; !current.result && !current.error && waited < MAX_WAIT_MS; waited += 500) await new Promise((r) => setTimeout(r, 500))
  if (current.error) {
    job = null
    return textResult(`The export failed: ${current.error}`, true)
  }
  if (!current.result) return textResult('Exporting the 1080p video; the app shows its progress. Call export_video again in a minute or two.')
  return textResult(`Exported into ${current.result.folder}:\n${current.result.files.map((f) => `- ${f}`).join('\n')}`)
}
