// Google's Antigravity CLI (agy) as a third agent, next to Claude and Codex (ADR 0031). Its CLI
// isn't bundled: choosing it downloads the pinned release from GitHub, checked against the
// published sha256, into the app's data folder. It runs with a home folder of its own there, so
// its settings, permission rules, Studio's tools and its Google sign-in never touch the user's
// own ~/.gemini. Sign-in is the CLI's own (Google, in the browser, through a pseudo-terminal:
// studio_runner/agy_login.py) or the user's Gemini API key; the app never reads a token.
//
// Containment, measured on 1.3.6 (ADR 0031): no --dangerously-skip-permissions (it also approves
// leaving the sandbox), so headless runs refuse everything the rules don't allow. The rules allow
// writing in the project only, reading the project and the studio and manim sources, and the six
// scene tools; shell commands, other paths and symlinks out of the project are refused.
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { app } from 'electron'
import { desktopTools, sceneTools } from '../shared/studio-tools'
import type { ChatPart, ClaudeLoginEvent, ClaudeStatus, ModelOption, SetupEvent } from '../shared/types'
import { agyFollower, type AgyEvent, type AgyResult } from './antigravity-events'
import { cleanEnv } from './env'
import { paths } from './paths'
import { runRunner } from './runner'
import { getSecret, getSettings } from './settings'

export const AGY_VERSION = '1.3.6'
// The release's assets and their published sha256 (github.com/google-antigravity/antigravity-cli).
const ASSETS: Record<string, [string, string]> = {
  'darwin-arm64': ['agy_cli_mac_arm64.tar.gz', '44e2c5a5982f67994599c533625d81b7ed56f568452ec132388bd30c42ed7465'],
  'darwin-x64': ['agy_cli_mac_x64.tar.gz', '488297e19a45cdcdefbe1f7af9a369431c11cbfc6a19455b61d610ee308b6fd7'],
  'linux-x64': ['agy_cli_linux_x64.tar.gz', 'e88ed835cbc4af504f64dfe20175f5572dc2a425dbfa2fcf55c0358bb444d80c'],
  'linux-arm64': ['agy_cli_linux_arm64.tar.gz', '0e11472f376e2943c6f812280dea49b204acc3be15794c6604a46972c5995b12'],
  'win32-x64': ['agy_cli_windows_x64.zip', 'c9383bae8c377a9a12e9543d45904ac46cc234ec85caa4c61c57ed9405ff7634'],
  'win32-arm64': ['agy_cli_windows_arm64.zip', '266d130637a37d046547af27bac99a42cf3ad50cb3047e82ec926bd3983d98bc'],
}
const DEFAULT_MODEL = 'gemini-4-argon' // confirmed with `agy models`: gemini-4-argon-{low,medium,high}

const root = () => join(app.getPath('userData'), 'antigravity')
const binDir = () => join(root(), AGY_VERSION)
/** The CLI's own home: its settings, rules, MCP config and sign-in. Kept across versions. */
export const agyHome = (): string => join(root(), 'home')
const cliDir = () => join(agyHome(), '.gemini', 'antigravity-cli')
const tokenFile = () => join(cliDir(), 'antigravity-oauth-token')
const KEYCHAIN_ITEM = 'antigravity' // the service the CLI stores its sign-in under

/**
 * macOS: the CLI keeps its Google sign-in in the keychain through /usr/bin/security, which looks
 * for the keychains under HOME. With HOME moved to the CLI's own folder it found none and asked
 * the user to reset their keychain. The folder's Library/Keychains therefore links to the user's
 * own: the sign-in is one item, "antigravity", in their login keychain, as when they use the CLI
 * themselves; its settings and rules stay in its own folder. (A separate keychain in the folder
 * can't be unlocked on macOS 27.)
 */
async function ensureKeychain(): Promise<void> {
  if (process.platform !== 'darwin') return
  const link = join(agyHome(), 'Library', 'Keychains')
  if (existsSync(link) || lstatExists(link)) return
  mkdirSync(join(agyHome(), 'Library'), { recursive: true })
  symlinkSync(join(homedir(), 'Library', 'Keychains'), link)
}

const lstatExists = (path: string) => {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

/** Whether the CLI's keychain item exists. `security` without -w prints the item's attributes, never the secret. */
async function inKeychain(): Promise<boolean> {
  if (process.platform !== 'darwin') return false
  await ensureKeychain()
  return run('/usr/bin/security', ['find-generic-password', '-s', KEYCHAIN_ITEM], agyEnvBase()).then(
    () => true,
    () => false,
  )
}

function installed(): string | null {
  if (!existsSync(binDir())) return null
  const name = readdirSync(binDir()).find((f) => /^(antigravity|agy)(\.exe)?$/i.test(f))
  return name ? join(binDir(), name) : null
}

export const antigravityInstalled = (): boolean => installed() !== null

/** Downloads the pinned release for this platform from GitHub, checks its sha256, unpacks it. */
export async function installAntigravity(onEvent: (e: SetupEvent) => void): Promise<void> {
  const asset = ASSETS[`${process.platform}-${process.arch}`]
  if (!asset) throw new Error(`Antigravity has no build for this computer (${process.platform} ${process.arch}).`)
  const [file, sha256] = asset
  const log = (line: string, progress?: number) => onEvent({ component: 'antigravity', state: 'installing', line, progress })
  log(`Downloading Antigravity ${AGY_VERSION}…`)
  const res = await fetch(`https://github.com/google-antigravity/antigravity-cli/releases/download/${AGY_VERSION}/${file}`)
  if (!res.ok || !res.body) throw new Error(`Couldn’t download Antigravity (HTTP ${res.status}).`)
  const total = Number(res.headers.get('content-length')) || 0
  const dir = binDir()
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const archive = join(dir, file)
  const hash = createHash('sha256')
  let got = 0
  const counted = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream).on('data', (chunk: Buffer) => {
    hash.update(chunk)
    got += chunk.length
    if (total) log('Downloading Antigravity…', got / total)
  })
  await pipeline(counted, createWriteStream(archive))
  if (hash.digest('hex') !== sha256) {
    rmSync(dir, { recursive: true, force: true })
    throw new Error('The Antigravity download didn’t match its published checksum. Try again.')
  }
  log('Unpacking…')
  await run('tar', [file.endsWith('.zip') ? '-xf' : '-xzf', archive, '-C', dir]) // Windows' tar reads zips
  rmSync(archive)
  const bin = installed()
  if (!bin) throw new Error('Antigravity unpacked, but its program wasn’t where expected.')
  if (process.platform !== 'win32') chmodSync(bin, 0o755)
  onEvent({ component: 'antigravity', state: 'ready', line: 'Antigravity is installed.' })
}

function run(cmd: string, args: string[], env?: Record<string, string>, cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, env, cwd })
    let out = ''
    child.stdout.on('data', (b) => (out += b))
    child.stderr.on('data', (b) => (out += b))
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(out.trim() || `${cmd} exited with ${code}`))))
  })
}

/** A Gemini API key saved in Settings → Agent is used instead of the Google sign-in. */
const apiKey = () => getSecret('gemini')

/** The CLI's environment: no inherited agent or Google variables, its own home, no self-updates. */
function agyEnv(): Record<string, string> {
  const env = agyEnvBase()
  const key = apiKey()
  if (key) env.GEMINI_API_KEY = key
  return env
}

function agyEnvBase(): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries(cleanEnv()).filter(([k, v]) => v !== undefined && !/^(GEMINI|GOOGLE|AGY|ANTIGRAVITY|JETSKI|CLOUDSDK)_/.test(k)),
  ) as Record<string, string>
  env.HOME = agyHome()
  if (process.platform === 'win32') env.USERPROFILE = agyHome()
  env.AGY_CLI_DISABLE_AUTO_UPDATE = '1' // the pinned, checked version stays the one that runs
  return env
}

/**
 * The CLI's settings, Studio's tools and Studio's brief for a run in `dir`. Written before every
 * run: the project, the key and the instructions change.
 */
function prepare(project: string, instructions: string): void {
  // The CLI checks real paths (it follows symlinks, and /var is /private/var on macOS), so the rules name them.
  const real = (p: string) => (existsSync(p) ? realpathSync(p) : p)
  const dir = real(project)
  const site = join(paths.env(), '.pixi', 'envs', 'default')
  const allow = [
    `write_file(${dir})`,
    `read_file(${dir})`,
    `read_file(${real(paths.python())})`,
    `read_file(${real(site)})`,
    // Its own working files: the pictures Studio's tools return (brain/…) and the tools' descriptions (mcp/…).
    // Not its whole folder, which holds its sign-in.
    `read_file(${real(join(cliDir(), 'brain'))})`,
    `read_file(${real(join(cliDir(), 'mcp'))})`,
    ...Object.keys(sceneTools).map((t) => `mcp(studio/${t})`),
  ]
  mkdirSync(join(cliDir(), 'rules'), { recursive: true })
  mkdirSync(join(agyHome(), '.gemini', 'config', 'rules'), { recursive: true })
  const settings = { trustedWorkspaces: [dir], permissions: { allow }, ...(apiKey() ? { modelProvider: 'gemini' } : {}) }
  writeFileSync(join(cliDir(), 'settings.json'), JSON.stringify(settings, null, 2))
  const bridgeEnv: Record<string, string> = { ELECTRON_RUN_AS_NODE: '1' }
  if (process.env.STUDIO_USER_DATA) bridgeEnv.STUDIO_USER_DATA = process.env.STUDIO_USER_DATA
  const studio = {
    command: process.execPath,
    args: [paths.mcpBridge()],
    env: bridgeEnv,
    disabledTools: Object.keys(desktopTools).filter((t) => !(t in sceneTools)),
  }
  writeFileSync(join(agyHome(), '.gemini', 'config', 'mcp_config.json'), JSON.stringify({ mcpServers: { studio } }, null, 2))
  // An always-on global rule is how the brief reaches a headless run (checked on 1.3.6).
  writeFileSync(join(agyHome(), '.gemini', 'config', 'rules', 'studio.md'), `---\ntrigger: always_on\ndescription: Manim Studio\n---\n${instructions}\n`)
}

// --- sign-in ----------------------------------------------------------------------------

export async function antigravityStatus(): Promise<ClaudeStatus> {
  if (!installed()) return { loggedIn: false, method: 'not-installed' }
  if (apiKey()) return { loggedIn: true, method: 'api-key', subscription: 'Gemini API key' }
  // Where the CLI keeps it: its keychain item, or the file it falls back to. Existence only: the app never reads it.
  const loggedIn = (existsSync(tokenFile()) && statSync(tokenFile()).size > 0) || (await inKeychain())
  return { loggedIn, method: loggedIn ? 'google' : undefined, subscription: loggedIn ? 'Google account' : undefined }
}

let loginChild: ChildProcess | null = null

/** The CLI's own Google sign-in, driven in a pseudo-terminal: the link to open, then the code to paste. */
export async function antigravityLogin(onEvent: (e: ClaudeLoginEvent) => void): Promise<ClaudeStatus> {
  const bin = installed()
  if (!bin) throw new Error('Install Antigravity first (Settings → Agent).')
  if (process.platform === 'win32') throw new Error('On Windows, Antigravity signs in with a Gemini API key here (Settings → Agent).')
  loginChild?.kill()
  mkdirSync(agyHome(), { recursive: true })
  await ensureKeychain()
  const job = await runRunner('default', ['agy-login', bin, agyHome()], {
    onEvent: (e) => e.type === 'url' && onEvent({ line: String(e.line), url: String(e.url), needsCode: true }),
  })
  loginChild = job.child
  await job.done.catch(() => undefined)
  loginChild = null
  onEvent({ done: true })
  return antigravityStatus()
}

/** The code the browser showed, typed into the CLI's sign-in. */
export function antigravityLoginCode(code: string): void {
  loginChild?.stdin?.write(code.trim() + '\n')
}

/** Forgets the Google sign-in (the CLI's /logout does the same to its own token file). */
export async function antigravityLogout(): Promise<ClaudeStatus> {
  rmSync(tokenFile(), { force: true })
  await ensureKeychain()
  if (process.platform === 'darwin')
    while (
      await run('/usr/bin/security', ['delete-generic-password', '-s', KEYCHAIN_ITEM], agyEnvBase()).then(
        () => true,
        () => false,
      )
    );
  return antigravityStatus()
}

/** The account's models (`agy models`), one per family with its efforts: gemini-4-argon-high → Gemini 4 Argon, high. */
export async function antigravityModels(): Promise<ModelOption[]> {
  const fallback: ModelOption[] = [
    { value: '', label: 'Gemini 4 Argon', description: 'Google’s frontier model; Antigravity’s default', efforts: ['low', 'medium', 'high'] },
  ]
  const bin = installed()
  if (!bin) return fallback
  await ensureKeychain()
  const out = await run(bin, ['models'], agyEnv(), tmpdir()).catch(() => '')
  const families = new Map<string, ModelOption>()
  for (const line of out.split('\n')) {
    const m = /^(\S+)-(low|medium|high|xhigh|max)\t(.+?)(?: \(\w+\))?$/.exec(line.trim())
    if (!m) continue
    const [, value, effort, label] = m
    const family = families.get(value) ?? {
      value: value === DEFAULT_MODEL ? '' : value,
      label: value === DEFAULT_MODEL ? `Default (${label})` : label,
      description: '',
      efforts: [],
    }
    family.efforts.push(effort as ModelOption['efforts'][number])
    families.set(value, family)
  }
  const order = ['low', 'medium', 'high', 'xhigh', 'max']
  for (const f of families.values()) f.efforts.sort((a, b) => order.indexOf(a) - order.indexOf(b))
  return families.size ? [...families.values()] : fallback
}

/** The CLI's model slug for the chosen model and effort: gemini-4-argon-medium. */
function slug(): string {
  const { antigravityModel, antigravityEffort } = getSettings()
  return `${antigravityModel || DEFAULT_MODEL}-${antigravityEffort || 'medium'}`
}

// --- turns ------------------------------------------------------------------------------

let current: ChildProcess | null = null

export function interruptAntigravity(): void {
  current?.kill()
}

export const closeAntigravity = interruptAntigravity

export interface AntigravityTurnHandlers {
  part(part: ChatPart): void
  status(id: string, status: 'ok' | 'error'): void
  conversation(id: string): void
}

/** Runs one headless CLI call in `cwd` and follows its stream-json events. */
function runTurn(
  cwd: string,
  prompt: string,
  conversation: string | undefined,
  on: AntigravityTurnHandlers,
): Promise<{ ok: boolean; error?: string; result?: AgyResult }> {
  const bin = installed()
  if (!bin) return Promise.resolve({ ok: false, error: 'Install Antigravity first (Settings → Agent).' })
  const args = ['-p', prompt, '--output-format', 'stream-json', '--model', slug(), ...(conversation ? ['--conversation', conversation] : [])]
  return new Promise((resolve) => {
    const child = spawn(bin, args, { cwd, env: agyEnv(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    current = child
    const feed = agyFollower(on)
    let outcome: { ok: boolean; error?: string; result?: AgyResult } | null = null
    let pending = ''
    let stderr = ''
    child.stdout.on('data', (b: Buffer) => {
      const lines = (pending + b.toString('utf8')).split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          outcome = feed(JSON.parse(line) as AgyEvent) ?? outcome
        } catch {
          // a line that isn't an event: ignore it
        }
      }
    })
    child.stderr.on('data', (b: Buffer) => (stderr = (stderr + b.toString('utf8')).slice(-4000)))
    child.on('error', (e) => resolve({ ok: false, error: e.message }))
    child.on('close', (code, signal) => {
      if (current === child) current = null
      if (signal) return resolve({ ok: false, error: 'Stopped' })
      resolve(outcome ?? { ok: false, error: friendly(stderr.trim().split('\n').pop() || `Antigravity exited with ${code}`) })
    })
  })
}

function friendly(message: string): string {
  if (/authentication|sign in|log in|expired/i.test(message)) return 'Antigravity isn’t signed in. Sign in in Settings → Agent.'
  return message
}

/**
 * One turn in the project's Antigravity conversation (resumed from `conversation` after a
 * restart). Pictures go in as files in the project for it to look at: headless input takes text only.
 */
export async function antigravityTurn(
  dir: string,
  instructions: string,
  text: string,
  images: string[],
  conversation: string | undefined,
  on: AntigravityTurnHandlers,
): Promise<{ ok: boolean; error?: string }> {
  prepare(dir, instructions)
  await ensureKeychain()
  const prompt = images.length ? `${text}\n\n${images.map((p) => `[Attached image: ${p}. Look at it with view_file.]`).join('\n')}` : text
  const { ok, error } = await runTurn(dir, prompt, conversation, on)
  return { ok, error: error && friendly(error) }
}

/** A one-off request with no project (translation, series planning), in an empty folder. */
export async function askAntigravity(system: string, prompt: string, what: string): Promise<string> {
  const dir = join(tmpdir(), 'manim-studio-antigravity', String(Date.now()))
  mkdirSync(dir, { recursive: true })
  try {
    prepare(dir, system)
    await ensureKeychain()
    const out = await runTurn(dir, prompt, undefined, { part: () => {}, status: () => {}, conversation: () => {} })
    if (!out.ok || !out.result) throw new Error(out.error ?? 'no answer')
    return out.result.response
  } catch (e) {
    throw new Error(`Antigravity couldn’t ${what}: ${friendly((e as Error).message)}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
