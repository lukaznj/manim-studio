// Codex (OpenAI) as the agent instead of Claude (ADR 0022). Its CLI is large (about 340 MB on
// macOS), so it isn't bundled: choosing Codex installs the official npm package for this platform,
// pinned and checked against npm's published hash, into the app's data folder. Sign-in runs the
// CLI's own `codex login` (browser, ChatGPT account) or uses the user's OpenAI API key; the app
// never sees a token. Studio's scene tools reach Codex through the same stdio bridge Claude
// Desktop's extension uses (mcpb/server.ts), limited to the scene tools; Codex edits the project's
// files itself, sandboxed to the project.
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { app } from 'electron'
import type { Thread, ThreadEvent, ThreadItem } from '@openai/codex-sdk'
import { cliUsageEntry, type UsageEntry } from '../shared/usage'
import { sceneTools } from '../shared/studio-tools'
import type { ChatPart, ClaudeLoginEvent, ClaudeStatus, Effort, ModelOption, SetupEvent, ClaudeAuth } from '../shared/types'
import { recoverModelCapacity, type CapacityResult } from '../shared/codex-recovery'
import { studioCodexModels } from '../shared/codex-selection'
import { listCodexModels, readCodexRateLimits } from './codex-models'
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

export const codexPlanUsage = async () => {
  const bin = installed()?.bin
  return bin && !codexUsesKey() ? readCodexRateLimits(bin, codexEnv()).catch(() => null) : null
}

/** Downloads the CLI for this platform from npm, checks its sha512, unpacks it. */
export async function installCodex(onEvent: (e: SetupEvent) => void): Promise<void> {
  const platform = NPM_PLATFORM[`${process.platform}-${process.arch}`]
  if (!platform) throw new Error(`Codex has no build for this computer (${process.platform} ${process.arch}).`)
  const log = (line: string, progress?: number) => onEvent({ component: 'codex', state: 'installing', line, progress })
  log(`Downloading Codex ${CODEX_VERSION}…`)
  const meta = (await (await fetch(`https://registry.npmjs.org/@openai/codex/${CODEX_VERSION}-${platform}`)).json()) as {
    dist: { tarball: string; integrity: string }
  }
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

/** Settings → Accounts: the ChatGPT sign-in or an OpenAI API key (before the switch existed, a saved key meant the key). */
export const codexUsesKey = (): boolean => (getSettings().codexAuth ?? (getSecret('openai') ? 'api-key' : 'account')) === 'api-key'

/** The OpenAI key, only while the switch says API key. */
const apiKey = (auth?: ClaudeAuth) => ((auth ? auth === 'api-key' : codexUsesKey()) ? getSecret('openai') : '')

/** The CLI's environment: no inherited agent variables, its helpers on the PATH. */
function codexEnv(): Record<string, string> {
  const env = Object.fromEntries(Object.entries(cleanEnv()).filter(([k, v]) => v !== undefined && !/^(OPENAI_|CODEX_)/.test(k))) as Record<string, string>
  // Windows has "Path"; keep a single "PATH" key so Node's spawn doesn't drop System32 when prepending helpers.
  const path = Object.entries(env).find(([k]) => k.toUpperCase() === 'PATH')?.[1]
  for (const k of Object.keys(env)) if (k.toUpperCase() === 'PATH') delete env[k]
  env.PATH = [installed()?.path, path].filter(Boolean).join(delimiter)
  return env
}

// --- sign-in ----------------------------------------------------------------------------

export async function codexStatus(): Promise<ClaudeStatus> {
  const bin = installed()?.bin
  if (!bin) return { loggedIn: false, method: 'not-installed' }
  if (codexUsesKey()) return { loggedIn: !!apiKey(), method: 'api-key', subscription: apiKey() ? 'API key' : undefined }
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
    return {
      loggedIn,
      method: loggedIn ? (/api key/i.test(out) ? 'api-key' : 'chatgpt') : undefined,
      subscription: loggedIn ? out.trim().split('\n')[0] : undefined,
    }
  } catch (e) {
    return { loggedIn: false, error: (e as Error).message }
  }
}

let loginChild: ChildProcess | null = null
export const codexLoginBusy = () => !!loginChild && loginChild.exitCode === null && loginChild.signalCode === null

/** `codex login` opens the browser for ChatGPT and waits for the callback. */
export function codexLogin(onEvent: (e: ClaudeLoginEvent) => void): Promise<ClaudeStatus> {
  const bin = installed()?.bin
  if (!bin) return Promise.reject(new Error('Install Codex first (Settings → Accounts).'))
  loginChild?.kill()
  return new Promise((resolve) => {
    const child = spawn(bin, ['login'], { env: codexEnv(), windowsHide: true })
    loginChild = child
    const onData = (b: Buffer) => {
      for (const line of b
        .toString()
        .split('\n')
        .map((l) => l.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim())) {
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

/** Discover availability and efforts for Studio's two supported Codex models. */
let knownModels: ModelOption[] = []
export async function codexModels(auth?: ClaudeAuth): Promise<ModelOption[]> {
  const bin = installed()?.bin
  if (!bin) throw new Error('Install Codex first (Settings → Accounts).')
  const env = codexEnv()
  if (apiKey(auth)) env.OPENAI_API_KEY = apiKey(auth)
  knownModels = studioCodexModels(await listCodexModels(bin, env))
  if (!knownModels.length) throw new Error('Codex did not offer GPT-6 Astra or GPT-6.1 Sol. Check your account in Settings → Accounts.')
  return knownModels
}

export interface CodexOptions {
  auth?: ClaudeAuth // a series carrying on with the key past the account's limit (ADR 0048); otherwise Settings
  model?: string
  effort?: Effort
  allowFallback?: boolean
  strictModel?: boolean
}

const pauseForCapacity = (signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const stop = () => {
      clearTimeout(timer)
      reject(new Error('Stopped'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', stop)
      resolve()
    }, 1500)
    if (signal?.aborted) stop()
    else signal?.addEventListener('abort', stop, { once: true })
  })

// --- turns ------------------------------------------------------------------------------

type Sdk = typeof import('@openai/codex-sdk')
let sdkPromise: Promise<Sdk> | null = null
const sdk = () => (sdkPromise ??= import('@openai/codex-sdk'))

async function client(dir: string, instructions: string, withTools = true, auth?: ClaudeAuth) {
  const { Codex } = await sdk()
  const bin = installed()?.bin
  if (!bin) throw new Error('Install Codex first (Settings → Accounts).')
  // The bridge's calls name this project: it may be one a background agent is making, not the open one.
  const bridgeEnv: Record<string, string> = { ELECTRON_RUN_AS_NODE: '1', STUDIO_PROJECT: dir }
  if (process.env.STUDIO_USER_DATA) bridgeEnv.STUDIO_USER_DATA = process.env.STUDIO_USER_DATA
  return new Codex({
    codexPathOverride: bin,
    apiKey: apiKey(auth) || undefined,
    env: codexEnv(),
    config: {
      developer_instructions: instructions,
      // Windows needs its restricted-token sandbox enabled, or Codex silently falls back from workspace-write to read-only.
      ...(process.platform === 'win32' ? { windows: { sandbox: 'unelevated' } } : {}),
      // Keep Codex Desktop's own computer-use / browser plugins out of Studio turns.
      features: { apps: false, plugins: false, computer_use: false, browser_use: false },
      mcp_servers: {
        node_repl: { enabled: false },
        ...(withTools
          ? {
              studio: {
                command: process.execPath,
                args: [paths.mcpBridge()],
                env: bridgeEnv,
                enabled_tools: Object.keys(sceneTools),
                default_tools_approval_mode: 'approve',
                startup_timeout_sec: 30,
                tool_timeout_sec: 120,
              },
            }
          : {}),
      },
    },
  })
}

let thread: { dir: string; thread: Thread } | null = null
const threadModels = new WeakMap<Thread, string>()
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
  usage?(usage: Record<string, number>, model: string): void
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
    if (!thread || thread.dir !== dir) thread = { dir, thread: await openThread(dir, instructions, threadId) }
    abort = new AbortController()
    return await runRecovering(thread.thread, dir, instructions, text, images, on, abort.signal, {}, (next) => {
      thread = { dir, thread: next }
    })
  } catch (e) {
    if (abort?.signal.aborted) return { ok: false, error: 'Stopped' }
    return { ok: false, error: friendly((e as Error).message) }
  } finally {
    abort = null
  }
}

/** The project's thread, resumed from `threadId` when there is one, sandboxed to the project. */
async function openThread(dir: string, instructions: string, threadId: string | undefined, selection: CodexOptions = {}, withTools = true): Promise<Thread> {
  const codex = await client(dir, instructions, withTools, selection.auth)
  const { codexModel, codexEffort } = getSettings()
  const model = selection.model ?? codexModel
  const offered = knownModels.find((m) => m.value === model)?.efforts
  const effort = selection.effort || codexEffort || 'high'
  const options = {
    workingDirectory: dir,
    skipGitRepoCheck: true,
    sandboxMode: withTools ? ('workspace-write' as const) : ('read-only' as const),
    approvalPolicy: 'never' as const, // nobody to ask: the sandbox keeps writes inside the project
    webSearchMode: withTools ? ('live' as const) : ('disabled' as const),
    networkAccessEnabled: false, // hosted web search can read public pages without opening command networking
    model: model || undefined,
    modelReasoningEffort:
      selection.strictModel && !selection.effort
        ? undefined
        : offered
          ? offered.includes(effort)
            ? effort
            : offered.includes('medium')
              ? 'medium'
              : offered[0]
          : effort,
  }
  const thread = threadId ? codex.resumeThread(threadId, options) : codex.startThread(options)
  threadModels.set(thread, model)
  return thread
}

async function runOn(t: Thread, text: string, images: string[], on: CodexTurnHandlers, signal: AbortSignal): Promise<CapacityResult> {
  const input = images.length ? [{ type: 'text' as const, text }, ...images.map((path) => ({ type: 'local_image' as const, path }))] : text
  let started = false
  try {
    const { events } = await t.runStreamed(input, { signal })
    for await (const event of events) {
      if ((event.type === 'item.started' || event.type === 'item.completed') && !['reasoning', 'error'].includes(event.item.type)) started = true
      if (event.type === 'turn.completed') on.usage?.({ ...event.usage }, threadModels.get(t) || 'Codex account default (exact model unreported)')
      const r = follow(event, on)
      if (r) return { ...r, started }
    }
  } catch (e) {
    return { ok: false, error: signal.aborted ? 'Stopped' : friendly((e as Error).message), started }
  }
  return { ok: false, error: signal.aborted ? 'Stopped' : 'The connection to Codex ended before the turn completed.', started }
}

async function runRecovering(
  t: Thread,
  dir: string,
  instructions: string,
  text: string,
  images: string[],
  on: CodexTurnHandlers,
  signal: AbortSignal,
  options: CodexOptions,
  replace: (thread: Thread) => void,
): Promise<CapacityResult> {
  let active = t
  let model = threadModels.get(t) ?? options.model ?? getSettings().codexModel
  return recoverModelCapacity({
    model,
    fallback: options.allowFallback === false ? undefined : getSettings().codexFallbackModel,
    wait: () => pauseForCapacity(signal),
    notice: (text) => on.part({ kind: 'text', text }),
    attempt: async (next) => {
      if (signal.aborted) return { ok: false, error: 'Stopped' }
      if (next !== model) {
        // Preserve the existing conversation; only a rejected turn before output may switch models.
        if (!knownModels.length) await codexModels()
        active = await openThread(dir, instructions, active.id ?? undefined, { ...options, model: next })
        model = next
        replace(active)
      }
      return runOn(active, text, images, on, signal)
    },
  })
}

/** A background agent's thread in one project (agent.ts): its own client and bridge, turns one after another. */
export function codexSession(dir: string, instructions: string, threadId: string | undefined, on: CodexTurnHandlers, options: CodexOptions = {}, images: string[] = []) {
  let t: Thread | null = null
  let stop: AbortController | null = null
  let closed = false
  return {
    async turn(text: string): Promise<{ ok: boolean; error?: string }> {
      if (closed) return { ok: false, error: 'Stopped' }
      stop = new AbortController()
      try {
        t ??= await openThread(dir, instructions, threadId, options)
        return await runRecovering(t, dir, instructions, text, images, on, stop.signal, options, (next) => {
          t = next
        })
      } catch (e) {
        if (stop.signal.aborted) return { ok: false, error: 'Stopped' }
        return { ok: false, error: friendly((e as Error).message) }
      } finally {
        stop = null
      }
    },
    close(): void {
      closed = true
      stop?.abort()
    },
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
    case 'command_execution': {
      const cmd = item.command
        .replace(/^"?[^"]*powershell(?:\.exe)?"?\s+(?:-\w+\s+)*-Command\s+['"]?(.*?)['"]?$/is, '$1')
        .replace(/^\/bin\/(?:z|ba)?sh\s+-\w+\s+['"]?(.*?)['"]?$/s, '$1')
        .trim()
      return { kind: 'tool', id: item.id, name: 'Shell', summary: `Running ${cmd.slice(0, 60)}`, status: done ? (item.exit_code ? 'error' : 'ok') : 'running' }
    }
    case 'file_change':
      return {
        kind: 'tool',
        id: item.id,
        name: 'Edit',
        summary: `Editing ${item.changes.map((c) => c.path.split(/[\\/]/).pop()).join(', ')}`,
        status: done ? (item.status === 'failed' ? 'error' : 'ok') : 'running',
      }
    case 'mcp_tool_call':
      return {
        kind: 'tool',
        id: item.id,
        name: `mcp__studio__${item.tool}`,
        summary: TOOL_SUMMARY[item.tool] ?? item.tool,
        status: done ? (item.status === 'failed' ? 'error' : 'ok') : 'running',
      }
    case 'web_search':
      return { kind: 'tool', id: item.id, name: 'WebSearch', summary: `Searching the web for ${item.query.slice(0, 50)}`, status: done ? 'ok' : 'running' }
    default:
      return null
  }
}

const TOOL_SUMMARY: Record<string, string> = {
  report_progress: 'Production',
  render_preview: 'Rendering the preview',
  get_timeline: 'Reading the timeline',
  view_frames: 'Looking at frames',
  read_source: 'Reading a source',
  view_source_pages: 'Looking at source pages',
  calculate: 'Checking a calculation',
}

function friendly(message: string): string {
  if (/not logged in|unauthorized|401|login/i.test(message)) return 'Codex isn’t signed in. Sign in in Settings → Accounts.'
  return message
}

/** A one-off request with no tools (translation, series planning, reading exercises from pictures), in an empty folder. */
export async function askCodex(
  system: string,
  prompt: string,
  what: string,
  images: { name: string; mediaType: string; data: string }[] = [],
  options: CodexOptions & { signal?: AbortSignal; onUsage?: (entry: UsageEntry) => void } = {},
): Promise<string> {
  const started = Date.now()
  const dir = join(tmpdir(), 'manim-studio-codex', randomUUID())
  mkdirSync(dir, { recursive: true })
  try {
    const t = await openThread(dir, system, undefined, options, false)
    const files = images.map((img, i) => {
      const file = join(dir, `picture-${i + 1}.${img.mediaType.endsWith('jpeg') ? 'jpg' : (img.mediaType.split('/')[1] ?? 'png')}`)
      writeFileSync(file, Buffer.from(img.data, 'base64'))
      return file
    })
    const named = images.length ? `${prompt}\n\nThe pictures, in order: ${images.map((img) => `"${img.name}"`).join('; ')}.` : prompt
    const turn = await t.run(
      images.length ? [{ type: 'text' as const, text: named }, ...files.map((path) => ({ type: 'local_image' as const, path }))] : named,
      { signal: options.signal },
    )
    options.onUsage?.(cliUsageEntry('codex', options.auth ?? (codexUsesKey() ? 'api-key' : 'account'), options.model || getSettings().codexModel, { ...turn.usage }, what, Date.now() - started))
    return turn.finalResponse
  } catch (e) {
    throw new Error(`Codex couldn’t ${what}: ${friendly((e as Error).message)}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
