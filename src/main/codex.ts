// Codex (OpenAI) as the agent instead of Claude (ADR 0022). Its CLI is large (about 340 MB on
// macOS), so it isn't bundled: choosing Codex installs the official npm package for this platform,
// pinned and checked against npm's published hash, into the app's data folder. Sign-in runs the
// CLI's own `codex login` (browser, ChatGPT account) or uses the user's OpenAI API key; the app
// never sees a token. Studio's scene tools reach Codex through the same stdio bridge Claude
// Desktop's extension uses (mcpb/server.ts), limited to the scene tools; Codex edits the project's
// files itself, sandboxed to the project.
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { app } from 'electron'
import type { Thread, ThreadEvent, ThreadItem } from '@openai/codex-sdk'
import { sceneTools } from '../shared/studio-tools'
import type { ChatPart, ClaudeLoginEvent, ClaudeStatus, ModelOption, SetupEvent } from '../shared/types'
import { cleanEnv } from './env'
import { paths } from './paths'
import { getSecret, getSettings } from './settings'

export const CODEX_VERSION = '0.162.1'
const NPM_PLATFORM: Record<string, string> = {
  'darwin-arm64': 'darwin-arm64',
  'darwin-x64': 'darwin-x64',
  'win32-x64': 'win32-x64',
  'win32-arm64': 'win32-arm64',
  'linux-x64': 'linux-x64',
  'linux-arm64': 'linux-arm64',
}

const home = () => join(app.getPath('userData'), 'codex', CODEX_VERSION)

/** The installed CLI's binary, and the folder with its helpers (ripgrep), or null. */
function installed(): { bin: string; path: string } | null {
  const vendor = join(home(), 'package', 'vendor')
  if (!existsSync(vendor)) return null
  for (const triple of readdirSync(vendor)) {
    const bin = join(vendor, triple, 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex')
    if (existsSync(bin)) return { bin, path: join(vendor, triple, 'codex-path') }
  }
  return null
}

export const codexInstalled = (): boolean => installed() !== null

/** Downloads the CLI for this platform from npm, checks its sha512, unpacks it. */
export async function installCodex(onEvent: (e: SetupEvent) => void): Promise<void> {
  const platform = NPM_PLATFORM[`${process.platform}-${process.arch}`]
  if (!platform) throw new Error(`Codex has no build for this computer (${process.platform} ${process.arch}).`)
  const log = (line: string, progress?: number) => onEvent({ component: 'codex', state: 'installing', line, progress })
  log(`Downloading Codex ${CODEX_VERSION}…`)
  const meta = (await (await fetch(`https://registry.npmjs.org/@openai/codex/${CODEX_VERSION}-${platform}`)).json()) as { dist: { tarball: string; integrity: string } }
  const res = await fetch(meta.dist.tarball)
  if (!res.ok || !res.body) throw new Error(`Couldn’t download Codex (HTTP ${res.status}).`)
  const total = Number(res.headers.get('content-length')) || 0
  const dir = home()
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const archive = join(dir, 'codex.tgz')
  const hash = createHash('sha512')
  let got = 0
  const counted = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream).on('data', (chunk: Buffer) => {
    hash.update(chunk)
    got += chunk.length
    if (total) log('Downloading Codex…', got / total)
  })
  await pipeline(counted, createWriteStream(archive))
  if (`sha512-${hash.digest('base64')}` !== meta.dist.integrity) {
    rmSync(dir, { recursive: true, force: true })
    throw new Error('The Codex download didn’t match its published checksum. Try again.')
  }
  log('Unpacking…')
  await run('tar', ['-xzf', archive, '-C', dir])
  rmSync(archive)
  if (!installed()) throw new Error('Codex unpacked, but its program wasn’t where expected.')
  onEvent({ component: 'codex', state: 'ready', line: 'Codex is installed.' })
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true })
    let out = ''
    child.stdout.on('data', (b) => (out += b))
    child.stderr.on('data', (b) => (out += b))
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(out.trim() || `${cmd} exited with ${code}`))))
  })
}

/** An OpenAI API key saved in Settings → Agent is used instead of the account sign-in. */
const apiKey = () => getSecret('openai')

/** The CLI's environment: no inherited agent variables, its helpers on the PATH. */
function codexEnv(): Record<string, string> {
  const env = Object.fromEntries(Object.entries(cleanEnv()).filter(([k, v]) => v !== undefined && !/^(OPENAI_|CODEX_)/.test(k))) as Record<string, string>
  const helpers = installed()?.path
  if (helpers) env.PATH = [helpers, env.PATH].filter(Boolean).join(delimiter)
  return env
}

// --- sign-in ----------------------------------------------------------------------------

export async function codexStatus(): Promise<ClaudeStatus> {
  const bin = installed()?.bin
  if (!bin) return { loggedIn: false, method: 'not-installed' }
  if (apiKey()) return { loggedIn: true, method: 'api-key', subscription: 'API key' }
  try {
    const out = await new Promise<string>((resolve) => {
      const child = spawn(bin, ['login', 'status'], { env: codexEnv(), windowsHide: true })
      let text = ''
      child.stdout.on('data', (b) => (text += b))
      child.stderr.on('data', (b) => (text += b))
      child.on('close', () => resolve(text))
      child.on('error', () => resolve(''))
    })
    const loggedIn = /logged in/i.test(out) && !/not logged in/i.test(out)
    return { loggedIn, method: loggedIn ? (/api key/i.test(out) ? 'api-key' : 'chatgpt') : undefined, subscription: loggedIn ? out.trim().split('\n')[0] : undefined }
  } catch (e) {
    return { loggedIn: false, error: (e as Error).message }
  }
}

let loginChild: ChildProcess | null = null

/** `codex login` opens the browser for ChatGPT and waits for the callback. */
export function codexLogin(onEvent: (e: ClaudeLoginEvent) => void): Promise<ClaudeStatus> {
  const bin = installed()?.bin
  if (!bin) return Promise.reject(new Error('Install Codex first (Settings → Agent).'))
  loginChild?.kill()
  return new Promise((resolve) => {
    const child = spawn(bin, ['login'], { env: codexEnv(), windowsHide: true })
    loginChild = child
    const onData = (b: Buffer) => {
      for (const line of b.toString().split('\n').map((l) => l.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim())) {
        if (line) onEvent({ line, url: line.match(/https:\/\/\S+/)?.[0] })
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('close', async () => {
      loginChild = null
      onEvent({ done: true })
      resolve(await codexStatus())
    })
  })
}

export async function codexLogout(): Promise<ClaudeStatus> {
  const bin = installed()?.bin
  if (bin) await run(bin, ['logout']).catch(() => undefined)
  return codexStatus()
}

/** Codex picks its default model for the account; effort is the reasoning effort. */
export function codexModels(): ModelOption[] {
  return [{ value: '', label: 'Default (Codex chooses)', description: 'The model your OpenAI account defaults to', efforts: ['low', 'medium', 'high', 'xhigh'] }]
}

// --- turns ------------------------------------------------------------------------------

type Sdk = typeof import('@openai/codex-sdk')
let sdkPromise: Promise<Sdk> | null = null
const sdk = () => (sdkPromise ??= import('@openai/codex-sdk'))

async function client(dir: string, instructions: string) {
  const { Codex } = await sdk()
  const bin = installed()?.bin
  if (!bin) throw new Error('Install Codex first (Settings → Agent).')
  const bridgeEnv: Record<string, string> = { ELECTRON_RUN_AS_NODE: '1' }
  if (process.env.STUDIO_USER_DATA) bridgeEnv.STUDIO_USER_DATA = process.env.STUDIO_USER_DATA
  return new Codex({
    codexPathOverride: bin,
    apiKey: apiKey() || undefined,
    env: codexEnv(),
    config: {
      developer_instructions: instructions,
      mcp_servers: {
        studio: {
          command: process.execPath,
          args: [paths.mcpBridge()],
          env: bridgeEnv,
          enabled_tools: Object.keys(sceneTools),
          startup_timeout_sec: 30,
          tool_timeout_sec: 120,
        },
      },
    },
  })
}

let thread: { dir: string; thread: Thread } | null = null
let abort: AbortController | null = null

export function closeCodex(): void {
  abort?.abort()
  thread = null
}

export function interruptCodex(): void {
  abort?.abort()
}

/** What a turn reports back, in the chat's own terms (claude.ts turns these into chat events). */
export interface CodexTurnHandlers {
  part(part: ChatPart): void
  status(id: string, status: 'ok' | 'error'): void
  thread(id: string): void
}

/**
 * One turn in the project's Codex thread (resumed from `threadId` when the app restarted). Resolves
 * with the outcome; errors come back as { ok: false }.
 */
export async function codexTurn(
  dir: string,
  instructions: string,
  text: string,
  images: string[],
  threadId: string | undefined,
  on: CodexTurnHandlers,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!thread || thread.dir !== dir) {
      const codex = await client(dir, instructions)
      const { codexModel, codexEffort } = getSettings()
      const options = {
        workingDirectory: dir,
        skipGitRepoCheck: true,
        sandboxMode: 'workspace-write' as const,
        approvalPolicy: 'never' as const, // nobody to ask: the sandbox keeps writes inside the project
        model: codexModel || undefined,
        modelReasoningEffort: (codexEffort || 'high') as 'high',
      }
      thread = { dir, thread: threadId ? codex.resumeThread(threadId, options) : codex.startThread(options) }
    }
    abort = new AbortController()
    const input = images.length ? [{ type: 'text' as const, text }, ...images.map((path) => ({ type: 'local_image' as const, path }))] : text
    const { events } = await thread.thread.runStreamed(input, { signal: abort.signal })
    for await (const event of events) {
      const r = follow(event, on)
      if (r) return r
    }
    return { ok: true }
  } catch (e) {
    if (abort?.signal.aborted) return { ok: false, error: 'Stopped' }
    return { ok: false, error: friendly((e as Error).message) }
  } finally {
    abort = null
  }
}

function follow(event: ThreadEvent, on: CodexTurnHandlers): { ok: boolean; error?: string } | null {
  switch (event.type) {
    case 'thread.started':
      on.thread(event.thread_id)
      return null
    case 'item.started':
    case 'item.completed': {
      const part = toPart(event.item, event.type === 'item.completed')
      if (!part) return null
      if (event.type === 'item.started' || part.kind === 'text') on.part(part)
      else if (part.kind === 'tool') on.status(part.id, part.status === 'error' ? 'error' : 'ok')
      return null
    }
    case 'turn.completed':
      return { ok: true }
    case 'turn.failed':
      return { ok: false, error: friendly(event.error.message) }
    case 'error':
      return { ok: false, error: friendly(event.message) }
    default:
      return null
  }
}

/** A Codex item as a chat part: its messages as text, its commands, edits and Studio tool calls as steps. */
function toPart(item: ThreadItem, done: boolean): ChatPart | null {
  switch (item.type) {
    case 'agent_message':
      return done && item.text.trim() ? { kind: 'text', text: item.text } : null
    case 'command_execution':
      return { kind: 'tool', id: item.id, name: 'Shell', summary: `Running ${item.command.slice(0, 60)}`, status: done ? (item.exit_code ? 'error' : 'ok') : 'running' }
    case 'file_change':
      return {
        kind: 'tool',
        id: item.id,
        name: 'Edit',
        summary: `Editing ${item.changes.map((c) => c.path.split(/[\\/]/).pop()).join(', ')}`,
        status: done ? (item.status === 'failed' ? 'error' : 'ok') : 'running',
      }
    case 'mcp_tool_call':
      return { kind: 'tool', id: item.id, name: `mcp__studio__${item.tool}`, summary: TOOL_SUMMARY[item.tool] ?? item.tool, status: done ? (item.status === 'failed' ? 'error' : 'ok') : 'running' }
    case 'web_search':
      return { kind: 'tool', id: item.id, name: 'WebSearch', summary: `Searching the web for ${item.query.slice(0, 50)}`, status: done ? 'ok' : 'running' }
    default:
      return null
  }
}

const TOOL_SUMMARY: Record<string, string> = {
  render_preview: 'Rendering the preview',
  get_timeline: 'Reading the timeline',
  view_frames: 'Looking at frames',
  read_source: 'Reading a source',
  view_source_pages: 'Looking at source pages',
}

function friendly(message: string): string {
  if (/not logged in|unauthorized|401|login/i.test(message)) return 'Codex isn’t signed in. Sign in in Settings → Agent.'
  return message
}

/** A one-off request with no tools (translation, series planning), in an empty folder. */
export async function askCodex(system: string, prompt: string, what: string): Promise<string> {
  const dir = join(tmpdir(), 'manim-studio-codex', String(Date.now()))
  mkdirSync(dir, { recursive: true })
  try {
    const codex = await client(dir, system)
    const t = codex.startThread({ workingDirectory: dir, skipGitRepoCheck: true, sandboxMode: 'read-only', approvalPolicy: 'never', model: getSettings().codexModel || undefined })
    const turn = await t.run(prompt)
    return turn.finalResponse
  } catch (e) {
    throw new Error(`Codex couldn’t ${what}: ${friendly((e as Error).message)}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
