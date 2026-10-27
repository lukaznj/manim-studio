// Google's Antigravity CLI (agy) as a third agent, next to Claude and Codex (ADR 0031). Its CLI
// isn't bundled: choosing it downloads the pinned release from GitHub, checked against the
// published sha256, into the app's data folder. It runs with a home folder of its own there, so
// its settings, permission rules, Studio's tools and its Google sign-in never touch the user's
// own ~/.gemini. Sign-in is the CLI's own (Google, in the browser): through a pseudo-terminal on macOS
// and Linux (studio_runner/agy_login.py), in a console window on Windows; or the user's Gemini API
// key. The app never reads a token.
//
// Each project has a home of its own for the CLI (homeFor): its settings, permission rules, brief
// and Studio's tools name that project, so the chat and background agents in different projects
// run at once. The sign-in is shared: it lives in the system's keyring (the macOS keychain, linked
// into every home; Windows' Credential Manager; Linux's Secret Service), or, without one, in a token
// file in the main home that each project home links to.
//
// Containment, measured on 1.3.6 (ADR 0031): no --dangerously-skip-permissions (it also approves
// leaving the sandbox), so headless runs refuse everything the rules don't allow. The rules allow
// writing in the project only, reading the project and the studio and manim sources, and the six
// scene tools; shell commands, other paths and symlinks out of the project are refused.
import { cliUsageEntry, type UsageEntry } from '../shared/usage'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  linkSync,
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
import { join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { app, shell } from 'electron'
import { desktopTools, sceneTools } from '../shared/studio-tools'
import type { ChatPart, ClaudeLoginEvent, ClaudeStatus, Effort, ModelOption, SetupEvent } from '../shared/types'
import { agyFollower, type AgyEvent, type AgyResult } from './antigravity-events'
import { cleanEnv } from './env'
import { paths } from './paths'
import { runRunner } from './runner'
import { getSecret, getSettings } from './settings'
import { googleLoginUrl, loginFailureDetails, redactLoginLog } from './login-diagnostics'

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
/** The CLI's main home: its sign-in (or the link to it), and the home of status checks and sign-in. Kept across versions. */
export const agyHome = (): string => join(root(), 'home')
const cliDir = (home = agyHome()) => join(home, '.gemini', 'antigravity-cli')
const TOKEN = 'antigravity-oauth-token' // the CLI's sign-in when there's no keyring
const tokenFile = (home = agyHome()) => join(cliDir(home), TOKEN)

/** A project's own home for the CLI: its settings, rules, Studio's tools and conversations. */
export function homeFor(project: string): string {
  const real = existsSync(project) ? realpathSync(project) : resolve(project)
  return join(root(), 'projects', createHash('sha256').update(real).digest('hex').slice(0, 16))
}

/** A project home signs in as the main one: the keychain linked (macOS), the token file linked when there is one. */
async function shareSignIn(home: string): Promise<void> {
  await ensureKeychain(home)
  if (home === agyHome()) return
  const own = tokenFile(home)
  rmSync(own, { force: true }) // a stale copy, or the user signed out
  if (!existsSync(tokenFile())) return
  mkdirSync(cliDir(home), { recursive: true })
  try {
    linkSync(tokenFile(), own) // one file: the CLI refreshing it in place serves every home
  } catch {
    copyFileSync(tokenFile(), own)
  }
}
const KEYCHAIN_ITEM = 'antigravity' // the service the CLI stores its sign-in under (macOS: seen in its keychain prompt)
const WIN_CREDENTIAL = 'gemini:antigravity' // go-keyring's "<service>:<user>" in Windows Credential Manager

/**
 * macOS: the CLI keeps its Google sign-in in the keychain through /usr/bin/security, which looks
 * for the keychains under HOME. With HOME moved to the CLI's own folder it found none and asked
 * the user to reset their keychain. The folder's Library/Keychains therefore links to the user's
 * own: the sign-in is one item, "antigravity", in their login keychain, as when they use the CLI
 * themselves; its settings and rules stay in its own folder. (A separate keychain in the folder
 * can't be unlocked on macOS 27.)
 */
async function ensureKeychain(home = agyHome()): Promise<void> {
  if (process.platform !== 'darwin') return
  const link = join(home, 'Library', 'Keychains')
  if (existsSync(link) || lstatExists(link)) return
  mkdirSync(join(home, 'Library'), { recursive: true })
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

/** Whether the CLI's keychain or Credential Manager item exists. Prints attributes only, never the secret. */
async function inKeychain(): Promise<boolean> {
  if (process.platform === 'win32')
    return run('cmdkey', [`/list:${WIN_CREDENTIAL}`]).then(
      (out) => /Target:/i.test(out),
      () => false,
    )
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

/** Settings → Accounts: the Google sign-in or a Gemini API key (before the switch existed, a saved key meant the key). */
export const antigravityUsesKey = (): boolean => (getSettings().antigravityAuth ?? (getSecret('gemini') ? 'api-key' : 'account')) === 'api-key'

/** The Gemini key, only while the switch says API key. */
const apiKey = () => (antigravityUsesKey() ? getSecret('gemini') : '')

/** The CLI's environment: no inherited agent or Google variables, its own home, no self-updates. */
function agyEnv(home = agyHome()): Record<string, string> {
  const env = agyEnvBase(home)
  const key = apiKey()
  if (key) env.GEMINI_API_KEY = key
  return env
}

function agyEnvBase(home = agyHome()): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries(cleanEnv()).filter(([k, v]) => v !== undefined && !/^(GEMINI|GOOGLE|AGY|ANTIGRAVITY|JETSKI|CLOUDSDK)_/.test(k)),
  ) as Record<string, string>
  env.HOME = home
  if (process.platform === 'win32') env.USERPROFILE = home
  env.AGY_CLI_DISABLE_AUTO_UPDATE = '1' // the pinned, checked version stays the one that runs
  return env
}

/**
 * The CLI's settings, Studio's tools and Studio's brief for a run in `project`, in the project's
 * own home. Written before every run: the key and the instructions change. Returns the home.
 */
async function prepare(project: string, instructions: string): Promise<string> {
  const home = homeFor(project)
  await shareSignIn(home)
  mkdirSync(join(cliDir(home), 'brain'), { recursive: true })
  mkdirSync(join(cliDir(home), 'mcp'), { recursive: true })
  mkdirSync(join(home, '.gemini', 'config', 'rules'), { recursive: true })
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
    `read_file(${real(join(cliDir(home), 'brain'))})`,
    `read_file(${real(join(cliDir(home), 'mcp'))})`,
    ...Object.keys(sceneTools).map((t) => `mcp(studio/${t})`),
  ]
  const settings = { trustedWorkspaces: [dir], permissions: { allow }, ...(apiKey() ? { modelProvider: 'gemini' } : {}) }
  writeFileSync(join(cliDir(home), 'settings.json'), JSON.stringify(settings, null, 2))
  // The bridge's calls name this project: it may be one a background agent is making, not the open one.
  const bridgeEnv: Record<string, string> = { ELECTRON_RUN_AS_NODE: '1', STUDIO_PROJECT: project }
  if (process.env.STUDIO_USER_DATA) bridgeEnv.STUDIO_USER_DATA = process.env.STUDIO_USER_DATA
  const studio = {
    command: process.execPath,
    args: [paths.mcpBridge()],
    env: bridgeEnv,
    disabledTools: Object.keys(desktopTools).filter((t) => !(t in sceneTools)),
  }
  writeFileSync(join(home, '.gemini', 'config', 'mcp_config.json'), JSON.stringify({ mcpServers: { studio } }, null, 2))
  // An always-on global rule is how the brief reaches a headless run (checked on 1.3.6).
  writeFileSync(join(home, '.gemini', 'config', 'rules', 'studio.md'), `---\ntrigger: always_on\ndescription: Manim Studio\n---\n${instructions}\n`)
  return home
}

// --- sign-in ----------------------------------------------------------------------------

export async function antigravityStatus(): Promise<ClaudeStatus> {
  if (!installed()) return { loggedIn: false, method: 'not-installed' }
  if (antigravityUsesKey()) return { loggedIn: !!apiKey(), method: 'api-key', subscription: apiKey() ? 'Gemini API key' : undefined }
  // Where the CLI keeps it: its keychain / Credential Manager item, or the file it falls back to. Existence only: the app never reads it.
  const loggedIn = (existsSync(tokenFile()) && statSync(tokenFile()).size > 0) || (await inKeychain())
  return { loggedIn, method: loggedIn ? 'google' : undefined, subscription: loggedIn ? 'Google account' : undefined }
}

let loginChild: ChildProcess | null = null
export const antigravityLoginBusy = () => !!loginChild && loginChild.exitCode === null && loginChild.signalCode === null

function killLogin(): void {
  if (!loginChild) return
  if (process.platform === 'win32' && loginChild.pid) void run('taskkill', ['/F', '/T', '/PID', String(loginChild.pid)]).catch(() => undefined)
  else loginChild.kill()
  loginChild = null
}

/** The CLI's own Google sign-in, driven in a pseudo-terminal: the link to open, then the code to paste. */
export async function antigravityLogin(onEvent: (e: ClaudeLoginEvent) => void): Promise<ClaudeStatus> {
  const record = (text: string) => {
    const line = redactLoginLog(text)
    if (getSettings().developerMode) onEvent({ diagnostic: line })
    console.info(`[Antigravity sign-in] ${line}`)
    try {
      mkdirSync(app.getPath('logs'), { recursive: true })
      appendFileSync(join(app.getPath('logs'), 'antigravity-login.log'), `${new Date().toISOString()} ${line}\n`)
    } catch { /* The inline log still works if the log folder is unavailable. */ }
  }
  const failed = (error: unknown, log = '') => {
    record(loginFailureDetails(error, log))
    return new Error(getSettings().developerMode ? 'Antigravity sign-in failed. See the sign-in log for details.' : 'The Antigravity sign-in didn’t finish. Try again.')
  }
  record(`Starting Google sign-in (${process.platform} ${process.arch}).`)
  const bin = installed()
  if (!bin) throw new Error('Install Antigravity first (Settings → Accounts).')
  if (process.platform === 'win32') return windowsLogin(bin, onEvent)
  killLogin()
  mkdirSync(agyHome(), { recursive: true })
  await ensureKeychain()
  record(`Launching the Python login helper with ${bin}.`)
  let openedBrowser = false
  const job = await runRunner('default', ['agy-login', bin, agyHome()], {
    onEvent: (e) => {
      if (e.type === 'diagnostic') record(String(e.line))
      if (e.type === 'url') {
        const url = googleLoginUrl(String(e.url))
        if (url) {
          onEvent({ line: String(e.line), url, needsCode: true })
          if (!openedBrowser) {
            openedBrowser = true
            void shell.openExternal(url).catch((error) => record(`Could not open the browser: ${(error as Error).message}`))
          }
        }
      }
      if (e.type === 'consent') onEvent({ needsConsent: true })
    },
  }).catch((e) => { throw failed(e) })
  loginChild = job.child
  // On macOS the CLI saves the sign-in in Keychain, so the Python helper never sees a
  // token file. Check existence through the same status path as Settings, never its contents.
  let signedIn = false
  let checking = false
  const timer = setInterval(async () => {
    if (checking || loginChild !== job.child) return
    checking = true
    try {
      const status = await antigravityStatus()
      if (status.loggedIn && loginChild === job.child) {
        signedIn = true
        killLogin()
      }
    } catch {
      // The helper still reports startup errors and its own timeout.
    } finally {
      checking = false
    }
  }, 1500)
  try {
    await job.done
  } catch (e) {
    if (!signedIn) throw failed(e, job.log())
  } finally {
    clearInterval(timer)
    if (loginChild === job.child) loginChild = null
    onEvent({ done: true })
  }
  record('Google sign-in finished. Checking the saved account.')
  return antigravityStatus()
}

/**
 * Windows has no pty for Python, so the CLI's own sign-in opens in a console window of its own
 * (`cmd /c start /wait`: Node's own `detached` + `stdio: 'ignore'` gives the child `DETACHED_PROCESS`
 * and `NUL` stdin, so its TUI exits right away without a window). The user signs in there; Studio
 * checks Credential Manager (and the fallback token file) and closes the window once signed in.
 */
async function windowsLogin(bin: string, onEvent: (e: ClaudeLoginEvent) => void): Promise<ClaudeStatus> {
  killLogin()
  const work = join(agyHome(), 'login')
  mkdirSync(work, { recursive: true })
  mkdirSync(cliDir(), { recursive: true })
  writeFileSync(join(cliDir(), 'settings.json'), JSON.stringify({ trustedWorkspaces: [realpathSync(work)] }, null, 2))
  onEvent({
    line: 'In the Antigravity window: choose Google OAuth, sign in in the browser and paste the code there. It closes by itself once you’re signed in.',
  })
  const child = spawn('cmd.exe', ['/d', '/s', '/c', `"start "Antigravity" /wait "${bin}""`], {
    cwd: work,
    env: agyEnvBase(),
    windowsHide: true,
    windowsVerbatimArguments: true,
    stdio: 'ignore',
  })
  loginChild = child
  const closed = new Promise<boolean>((resolve) => child.on('exit', () => resolve(false)))
  for (let open = true; open; ) {
    open = await Promise.race([closed, new Promise<boolean>((r) => setTimeout(() => r(true), 1500))])
    if ((await antigravityStatus()).loggedIn) break
  }
  if (loginChild === child) killLogin()
  onEvent({ done: true })
  return antigravityStatus()
}

/** The code the browser showed, typed into the CLI's sign-in. */
export function antigravityLoginCode(code: string): void {
  loginChild?.stdin?.write(code.trim() + '\n')
}

/** The user's explicit choice on the CLI's first-run terms and optional interaction sharing. */
export function antigravityLoginConsent(shareData: boolean): void {
  if (typeof shareData !== 'boolean') throw new Error('Choose whether to share Antigravity interactions with Google.')
  loginChild?.stdin?.write(JSON.stringify({ type: 'consent', shareData }) + '\n')
}

/** Forgets the Google sign-in (the CLI's /logout does the same to its own token file). */
export async function antigravityLogout(): Promise<ClaudeStatus> {
  rmSync(tokenFile(), { force: true })
  const homes = join(root(), 'projects')
  if (existsSync(homes)) for (const h of readdirSync(homes)) rmSync(tokenFile(join(homes, h)), { force: true }) // their links to it
  if (process.platform === 'win32') await forgetOnWindows()
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

/**
 * Windows: the CLI keeps its sign-in in Credential Manager through go-keyring, whose items are
 * named "<service>:<user>" (`gemini:antigravity`). cmdkey lists them as "Target: LegacyGeneric:target=…";
 * every Antigravity one is deleted.
 */
async function forgetOnWindows(): Promise<void> {
  const list = await run('cmdkey', ['/list']).catch(() => '')
  const targets = [...list.matchAll(/target=(\S+)/gi)].map((m) => m[1]).filter((t) => new RegExp(`(^|:)${KEYCHAIN_ITEM}(:|$)`, 'i').test(t))
  for (const t of targets) await run('cmdkey', [`/delete:${t}`]).catch(() => undefined)
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
function slug(selection: { model?: string; effort?: Effort } = {}): string {
  const { antigravityModel, antigravityEffort } = getSettings()
  return `${(selection.model ?? antigravityModel) || DEFAULT_MODEL}-${selection.effort || antigravityEffort || 'medium'}`
}

// --- turns ------------------------------------------------------------------------------

let current: ChildProcess | null = null // the chat's turn

export function interruptAntigravity(): void {
  current?.kill()
}

export const closeAntigravity = interruptAntigravity

export interface AntigravityTurnHandlers {
  part(part: ChatPart): void
  status(id: string, status: 'ok' | 'error'): void
  conversation(id: string): void
  usage?(usage: Record<string, number>, model: string): void
}

type Outcome = { ok: boolean; error?: string; result?: AgyResult }

/** Runs one headless CLI call in `cwd` with `home`, following its stream-json events. `started` gets the process, to stop it. */
function runTurn(
  home: string,
  cwd: string,
  prompt: string,
  conversation: string | undefined,
  on: AntigravityTurnHandlers,
  started: (child: ChildProcess) => void,
  selection: { model?: string; effort?: Effort } = {},
): Promise<Outcome> {
  const bin = installed()
  if (!bin) return Promise.resolve({ ok: false, error: 'Install Antigravity first (Settings → Accounts).' })
  const args = ['-p', prompt, '--output-format', 'stream-json', '--model', slug(selection), ...(conversation ? ['--conversation', conversation] : [])]
  return new Promise((resolve) => {
    const child = spawn(bin, args, { cwd, env: agyEnv(home), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    started(child)
    const feed = agyFollower(on)
    let outcome: Outcome | null = null
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
      if (signal) return resolve({ ok: false, error: 'Stopped' })
      resolve(outcome ?? { ok: false, error: friendly(stderr.trim().split('\n').pop() || `Antigravity exited with ${code}`) })
    })
  })
}

function friendly(message: string): string {
  if (/authentication|sign in|log in|expired/i.test(message)) return 'Antigravity isn’t signed in. Sign in in Settings → Accounts.'
  return message
}

/** Pictures go in as files for it to look at: headless input takes text only. */
const withImages = (text: string, images: string[]) =>
  images.length ? `${text}\n\n${images.map((p) => `[Attached image: ${p}. Look at it with view_file.]`).join('\n')}` : text

/**
 * One turn in the project's Antigravity conversation (resumed from `conversation` after a
 * restart): the chat's.
 */
export async function antigravityTurn(
  dir: string,
  instructions: string,
  text: string,
  images: string[],
  conversation: string | undefined,
  on: AntigravityTurnHandlers,
): Promise<{ ok: boolean; error?: string }> {
  const home = await prepare(dir, instructions)
  const { ok, error } = await runTurn(home, dir, withImages(text, images), conversation, on, (child) => (current = child)).finally(() => (current = null))
  return { ok, error: error && friendly(error) }
}

/** A background agent's conversation in one project (agent.ts): turns one after another, its own process to stop. */
export function antigravitySession(
  dir: string,
  instructions: string,
  conversation: string | undefined,
  on: AntigravityTurnHandlers,
  selection: { model?: string; effort?: Effort } = {},
) {
  let child: ChildProcess | null = null
  let closed = false
  let id = conversation
  const handlers = { ...on, conversation: (c: string) => ((id = c), on.conversation(c)) }
  return {
    async turn(text: string): Promise<{ ok: boolean; error?: string }> {
      if (closed) return { ok: false, error: 'Stopped' }
      const home = await prepare(dir, instructions)
      const { ok, error, result } = await runTurn(home, dir, text, id, handlers, (c) => (child = c), selection)
      if (result?.usage) on.usage?.({ ...result.usage }, selection.model || getSettings().antigravityModel || DEFAULT_MODEL)
      child = null
      return { ok, error: error && friendly(error) }
    },
    close(): void {
      closed = true
      child?.kill()
    },
  }
}

/** A one-off request with no project (translation, series planning, reading exercises), in an empty folder. */
export async function askAntigravity(
  system: string,
  prompt: string,
  what: string,
  images: { name: string; mediaType: string; data: string }[] = [],
  selection: { model?: string; effort?: Effort; signal?: AbortSignal; onUsage?: (entry: UsageEntry) => void } = {},
): Promise<string> {
  const started = Date.now()
  const dir = join(tmpdir(), 'manim-studio-antigravity', randomUUID())
  mkdirSync(dir, { recursive: true })
  let home = ''
  let child: ChildProcess | null = null
  const stop = () => child?.kill()
  selection.signal?.addEventListener('abort', stop)
  try {
    if (selection.signal?.aborted) throw new Error('Stopped')
    const files = images.map((img, i) => {
      const file = join(dir, `picture-${i + 1}.${img.mediaType.split('/')[1] === 'jpeg' ? 'jpg' : (img.mediaType.split('/')[1] ?? 'png')}`)
      writeFileSync(file, Buffer.from(img.data, 'base64'))
      return file
    })
    const named = images.length ? `${prompt}\n\nThe pictures, in order: ${images.map((img, i) => `${files[i]} is "${img.name}"`).join('; ')}.` : prompt
    home = await prepare(dir, system)
    if (selection.signal?.aborted) throw new Error('Stopped')
    const out = await runTurn(home, dir, withImages(named, files), undefined, { part: () => {}, status: () => {}, conversation: () => {} }, (process) => {
      child = process
      if (selection.signal?.aborted) stop()
    }, selection)
    selection.onUsage?.(cliUsageEntry('antigravity', antigravityUsesKey() ? 'api-key' : 'account', selection.model || getSettings().antigravityModel || DEFAULT_MODEL, { ...out.result?.usage }, what, Date.now() - started))
    if (!out.ok || !out.result) throw new Error(out.error ?? 'no answer')
    return out.result.response
  } catch (e) {
    throw new Error(`Antigravity couldn’t ${what}: ${friendly((e as Error).message)}`)
  } finally {
    selection.signal?.removeEventListener('abort', stop)
    rmSync(dir, { recursive: true, force: true })
    if (home) rmSync(home, { recursive: true, force: true })
  }
}
