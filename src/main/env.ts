// The managed Python environment (pixi) and LaTeX (TinyTeX), both installed into the
// app's data folder so colleagues need nothing but the app. See docs ADR 0003.
import { execFile, spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Component, ComponentState, SetupEvent, SetupStatus } from '../shared/types'
import { antigravityInstalled, installAntigravity } from './antigravity'
import { codexInstalled, installCodex } from './codex'
import { paths } from './paths'
import { ENV_IMPORTS, envFilesReady, findLatexBin, INSTALLER_MESSAGE, latexFilesReady, REPAIR_MESSAGE, usableExecutable } from './dependency-health'
import { protectWork } from './work-lifecycle'
import { runtimeCacheEnv } from './runtime-cleanup'

export type EnvName = 'default' | 'omnivoice' | 'transcribe'

const TINYTEX_VERSION = 'v2026.10'
// What manim's default TexTemplate \usepackage's (manim/utils/tex_templates.py), on top of
// TinyTeX-1, plus Croatian hyphenation for Tex with Croatian prose. (The manim docs still
// list `ms`, which TeX Live no longer has; tlmgr then aborts the whole install.)
const LATEX_PACKAGES = [
  'standalone', 'preview', 'babel-english', 'lm', 'amsfonts', 'doublestroke', 'setspace', 'tipa',
  'relsize', 'rsfs', 'fundus-calligra', 'wasysym', 'wasy', 'ragged2e', 'physics', 'xcolor',
  'microtype', 'dvisvgm', 'jknapltx', 'cm-super', 'gnu-freefont', 'mathastext', 'cbfonts-fd',
  'babel-croatian', 'hyphen-croatian',
]

const installing = new Set<Component>()
const errors: SetupStatus['errors'] = {}
const damaged: SetupStatus['errors'] = {}
const installs = new Map<Component, Promise<void>>()
const livePython = new Set<ChildProcess>()
let startingPython = 0
let envInstall: Promise<void> = Promise.resolve()
let healthCheck: Promise<SetupStatus> | null = null
let checkedAt = 0
let installerBroken = false
let maintenance = false
export const runtimeMaintenance = () => maintenance

/** Prevent fresh installs/processes and invalidate cached activation after removing tools. */
export async function maintainRuntimes<T>(work: () => Promise<T>): Promise<T> {
  if (maintenance || installs.size || livePython.size || startingPython) throw new Error('Stop video creation before removing tools.')
  maintenance = true
  try {
    if (healthCheck) await healthCheck
    return await protectWork(work)
  } finally {
    activation.clear()
    checkedAt = 0
    for (const key of Object.keys(errors) as Component[]) delete errors[key]
    for (const key of Object.keys(damaged) as Component[]) delete damaged[key]
    maintenance = false
    const status = setupStatus()
    for (const component of ['env', 'latex', 'omnivoice', 'transcribe', 'codex', 'antigravity'] as const) emit({ component, state: status[component] })
  }
}
let emit: (e: SetupEvent) => void = () => {}

export function onSetupEvent(fn: (e: SetupEvent) => void): void {
  emit = fn
}

// --- status -----------------------------------------------------------------------------

const manifestHash = () =>
  createHash('sha1')
    .update(readFileSync(join(paths.python(), 'pixi.toml')))
    .update(existsSync(join(paths.python(), 'pixi.lock')) ? readFileSync(join(paths.python(), 'pixi.lock')) : '')
    .digest('hex')

const installedHashFile = () => join(paths.env(), '.installed-hash')
const envDir = (name: EnvName) => join(paths.env(), '.pixi', 'envs', name)

function envState(name: EnvName, component: Component): ComponentState {
  if (installing.has(component)) return 'installing'
  if (errors[component]) return 'error'
  if (!existsSync(envDir(name))) return 'missing'
  if (!envFilesReady(envDir(name)) || damaged[component]) return 'error'
  const installed = existsSync(installedHashFile()) ? readFileSync(installedHashFile(), 'utf8') : ''
  return installed === manifestHash() ? 'ready' : 'outdated'
}

// Written only after the manim packages installed: an unpacked TinyTeX alone isn't usable.
const latexMarker = () => join(paths.tinytex(), '.manim-studio-ready')

export function latexBin(): string | null {
  return findLatexBin(paths.tinytex())
}

export function setupStatus(): SetupStatus {
  const omnivoiceSupported = !(process.platform === 'darwin' && process.arch === 'x64')
  const problems = { ...errors, ...damaged }
  for (const [name, component] of [['default', 'env'], ['omnivoice', 'omnivoice'], ['transcribe', 'transcribe']] as const)
    if (existsSync(envDir(name)) && !envFilesReady(envDir(name))) problems[component] = REPAIR_MESSAGE
  const marker = existsSync(latexMarker()), latexReady = marker && latexFilesReady(paths.tinytex())
  if (marker && !latexReady) problems.latex = REPAIR_MESSAGE
  const pixi = !installerBroken && usableExecutable(paths.pixi())
  if (!pixi) problems.env = INSTALLER_MESSAGE
  return {
    pixi,
    env: !pixi ? 'error' : envState('default', 'env'),
    latex: installing.has('latex') ? 'installing' : problems.latex ? 'error' : latexReady ? 'ready' : 'missing',
    omnivoice: omnivoiceSupported ? envState('omnivoice', 'omnivoice') : 'unsupported',
    transcribe: envState('transcribe', 'transcribe'),
    codex: installing.has('codex') ? 'installing' : errors.codex ? 'error' : codexInstalled() ? 'ready' : 'missing',
    antigravity: installing.has('antigravity') ? 'installing' : errors.antigravity ? 'error' : antigravityInstalled() ? 'ready' : 'missing',
    errors: problems,
  }
}

/** Bounded real execution checks catch removed modules and broken native libraries behind valid markers. */
export function checkSetup(force = false): Promise<SetupStatus> {
  if (maintenance) return Promise.resolve(setupStatus())
  if (healthCheck) return healthCheck
  if (installing.size || !force && Date.now() - checkedAt < 60_000) return Promise.resolve(setupStatus())
  healthCheck = (async () => {
    const status = setupStatus()
    if (!usableExecutable(paths.pixi())) return status
    try { await probe(paths.pixi(), ['--version'], cleanEnv()); installerBroken = false } catch {
      installerBroken = true
      checkedAt = Date.now()
      emit({ component: 'env', state: 'error', line: INSTALLER_MESSAGE })
      return setupStatus()
    }
    for (const [name, component] of [['default', 'env'], ['omnivoice', 'omnivoice'], ['transcribe', 'transcribe']] as const) {
      if (!envFilesReady(envDir(name)) || status[component] === 'unsupported') continue
      try {
        await verifyEnv(name)
        delete damaged[component]
        delete errors[component]
      } catch { damaged[component] = REPAIR_MESSAGE }
    }
    const bin = latexBin()
    if (bin && latexFilesReady(paths.tinytex())) {
      try {
        const suffix = process.platform === 'win32' ? '.exe' : ''
        await probe(join(bin, 'latex' + suffix), ['--version'], cleanEnv())
        await probe(join(bin, 'dvisvgm' + suffix), ['--version'], cleanEnv())
        delete damaged.latex
        delete errors.latex
      } catch { damaged.latex = REPAIR_MESSAGE }
    }
    checkedAt = Date.now()
    const next = setupStatus()
    for (const component of ['env', 'latex', 'omnivoice', 'transcribe'] as const) if (next[component] !== status[component]) emit({ component, state: next[component], ...(next.errors[component] ? { line: next.errors[component] } : {}) })
    return next
  })().finally(() => { healthCheck = null })
  return healthCheck
}

function probe(file: string, args: string[], env: NodeJS.ProcessEnv, timeout = 20_000): Promise<void> {
  return new Promise((resolve, reject) => execFile(file, args, { env, windowsHide: true, timeout, maxBuffer: 512_000 }, (error) => error ? reject(error) : resolve()))
}

async function verifyEnv(name: EnvName): Promise<void> {
  const env = await pythonEnv(name)
  await probe(pythonExe(name), ['-c', `import importlib; [importlib.import_module(m) for m in ${JSON.stringify(ENV_IMPORTS[name])}]`], env, 60_000)
  if (name === 'default') await probe(join(envDir(name), process.platform === 'win32' ? 'Library/bin/ffmpeg.exe' : 'bin/ffmpeg'), ['-version'], env)
}

export function reportDependencyFailure(component: Component): void {
  if (installing.has(component)) return
  damaged[component] = REPAIR_MESSAGE
  activation.clear()
  emit({ component, state: 'error', line: REPAIR_MESSAGE })
}

// --- running Python ---------------------------------------------------------------------

const activation = new Map<EnvName, Record<string, string>>()

/** Environment variables of an activated pixi env (PATH, CONDA_PREFIX, fontconfig, ...). */
async function activate(name: EnvName): Promise<Record<string, string>> {
  const cached = activation.get(name)
  if (cached) return cached
  const out = await capture(paths.pixi(), ['shell-hook', '--json', '--as-is', '--no-config', '-e', name, '--manifest-path', join(paths.env(), 'pixi.toml')])
  const vars = JSON.parse(out).environment_variables as Record<string, string>
  activation.set(name, vars)
  return vars
}

export async function pythonEnv(name: EnvName, extra: Record<string, string> = {}): Promise<NodeJS.ProcessEnv> {
  const vars = await activate(name)
  // An app started from Explorer has "Path", and pixi answers in the same spelling. Node passes on
  // only one spelling (PATH wins), so keep exactly one: the activated one. Without the env's
  // Library\bin, Windows loaded other DLLs and every Text crashed the render (0xC06D007F).
  const activated = Object.entries(vars).find(([k]) => k.toUpperCase() === 'PATH')?.[1] ?? process.env.PATH
  const env: NodeJS.ProcessEnv = { ...cleanEnv(), ...vars }
  for (const k of Object.keys(env)) if (k.toUpperCase() === 'PATH') delete env[k]
  return {
    ...env,
    ...runtimeCacheEnv(paths.userData()),
    PATH: [latexBin(), activated].filter(Boolean).join(delimiter),
    PYTHONPATH: paths.python(),
    PYTHONUNBUFFERED: '1',
    PYTHONIOENCODING: 'utf-8',
    PYTHONWARNINGS: 'ignore',
    ...extra,
  }
}

export function pythonExe(name: EnvName): string {
  return process.platform === 'win32' ? join(envDir(name), 'python.exe') : join(envDir(name), 'bin', 'python')
}

export async function spawnPython(name: EnvName, args: string[], extra: Record<string, string> = {}, cwd?: string): Promise<ChildProcess> {
  if (maintenance) throw new Error('Stop video creation before removing tools.')
  const component = name === 'default' ? 'env' : name
  if (!envFilesReady(envDir(name)) || installing.has(component)) {
    reportDependencyFailure(component)
    throw new Error(REPAIR_MESSAGE)
  }
  startingPython++
  let env: NodeJS.ProcessEnv
  try { env = await pythonEnv(name, extra) } finally { startingPython-- }
  if (installing.has(component)) throw new Error(REPAIR_MESSAGE)
  const child = spawn(pythonExe(name), ['-m', 'studio_runner', ...args], {
    env,
    cwd: cwd ?? paths.python(),
    windowsHide: true,
    detached: process.platform !== 'win32', // one group for the runner and its manim/ffmpeg children
  })
  livePython.add(child)
  const gone = () => livePython.delete(child)
  child.once('close', gone); child.once('error', gone)
  return child
}

/** process.env minus anything that would redirect Claude/Anthropic auth or leak from a parent tool. */
export function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_AGENT_|ANTHROPIC_|PIXI_|CONDA_|VIRTUAL_ENV|PYTHON)/.test(k)) continue
    env[k] = v
  }
  // Finder-launched apps get a minimal PATH; make the usual tool locations visible.
  if (process.platform === 'darwin') {
    env.PATH = [env.PATH, '/opt/homebrew/bin', '/usr/local/bin', '/Library/TeX/texbin'].filter(Boolean).join(delimiter)
  }
  return env
}

// --- installing ---------------------------------------------------------------------------

export function install(component: Component, repair = false): Promise<void> {
  if (maintenance) return Promise.reject(new Error('Stop video creation before removing tools.'))
  if (!['env', 'latex', 'omnivoice', 'transcribe', 'codex', 'antigravity'].includes(component)) return Promise.reject(new Error('Unknown installation component.'))
  const pending = installs.get(component)
  if (pending) return pending
  const task = protectWork(() => performInstall(component, repair)).finally(() => installs.delete(component))
  installs.set(component, task)
  return task
}

async function performInstall(component: Component, repair: boolean): Promise<void> {
  if (healthCheck) await healthCheck
  if (repair && (livePython.size || startingPython)) throw new Error('Stop video creation before reinstalling tools.')
  installing.add(component)
  delete errors[component]
  delete damaged[component]
  emit({ component, state: 'installing', line: 'Starting the install…' })
  try {
    if (component === 'latex') {
      await installLatex(component)
      if (!latexFilesReady(paths.tinytex())) throw new Error(REPAIR_MESSAGE)
      const suffix = process.platform === 'win32' ? '.exe' : ''
      await probe(join(latexBin()!, 'latex' + suffix), ['--version'], cleanEnv())
      await probe(join(latexBin()!, 'dvisvgm' + suffix), ['--version'], cleanEnv())
    }
    else if (component === 'codex') await installCodex(emit)
    else if (component === 'antigravity') await installAntigravity(emit)
    else {
      const name = component === 'env' ? 'default' : component
      const before = envInstall
      const current = before.catch(() => undefined).then(async () => {
        if (repair && (livePython.size || startingPython)) throw new Error('Stop video creation before reinstalling tools.')
        if (!usableExecutable(paths.pixi())) throw new Error(INSTALLER_MESSAGE)
        if (repair) { activation.delete(name); rmSync(envDir(name), { recursive: true, force: true }) }
        await installEnv(name, component)
        await verifyEnv(name)
      })
      envInstall = current.catch(() => undefined)
      await current
    }
    checkedAt = 0
    installing.delete(component)
    emit({ component, state: 'ready', line: 'Done.' })
  } catch (e) {
    installing.delete(component)
    errors[component] = (e as Error).message
    emit({ component, state: 'error', line: (e as Error).message })
    throw e
  }
}

async function installEnv(name: EnvName, component: Component): Promise<void> {
  if (!usableExecutable(paths.pixi())) throw new Error(INSTALLER_MESSAGE)
  mkdirSync(paths.env(), { recursive: true })
  for (const f of ['pixi.toml', 'pixi.lock']) {
    const src = join(paths.python(), f)
    if (existsSync(src)) copyFileSync(src, join(paths.env(), f))
  }
  const frozen = existsSync(join(paths.env(), 'pixi.lock')) ? ['--frozen'] : []
  await run(paths.pixi(), ['install', '--no-config', ...frozen, '-e', name, '--manifest-path', join(paths.env(), 'pixi.toml')], component, { env: { ...cleanEnv(), PIXI_CACHE_DIR: runtimeCacheEnv(paths.userData()).PIXI_CACHE_DIR } })
  activation.delete(name)
  if (name === 'default') writeFileSync(installedHashFile(), manifestHash())
}

async function installLatex(component: Component): Promise<void> {
  const dest = paths.tinytex()
  const work = join(tmpdir(), `manim-studio-tinytex-${Date.now()}`)
  mkdirSync(work, { recursive: true })
  const asset =
    process.platform === 'win32' ? `TinyTeX-1-windows-${TINYTEX_VERSION}.exe` : `TinyTeX-1-${process.platform === 'darwin' ? 'darwin' : 'linux-x86_64'}-${TINYTEX_VERSION}.tar.xz`
  const url = `https://github.com/rstudio/tinytex-releases/releases/download/${TINYTEX_VERSION}/${asset}`
  const file = join(work, asset)

  emit({ component, state: 'installing', line: `Downloading ${asset}…`, progress: 0 })
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Downloading TinyTeX failed (HTTP ${res.status})`)
  const total = Number(res.headers.get('content-length') ?? 0)
  let received = 0
  const body = Readable.fromWeb(res.body as never)
  body.on('data', (chunk: Buffer) => {
    received += chunk.length
    if (total) emit({ component, state: 'installing', progress: received / total })
  })
  await pipeline(body, createWriteStream(file))

  emit({ component, state: 'installing', line: 'Unpacking…' })
  rmSync(dest, { recursive: true, force: true })
  if (process.platform === 'win32') {
    // A 7-Zip self-extracting archive that unpacks a TinyTeX\ folder.
    await run(file, ['-y', `-o${work}`], component)
  } else {
    await run('tar', ['-xJf', file, '-C', work], component)
  }
  renameSync(join(work, 'TinyTeX'), dest)
  rmSync(work, { recursive: true, force: true })

  const bin = latexBin()
  if (!bin) throw new Error('TinyTeX was unpacked, but its bin/ folder is missing')
  // Node won't spawn a .bat without a shell (EINVAL since CVE-2024-27980); the quotes keep
  // "Manim Studio" in the path together for cmd.exe.
  const win = process.platform === 'win32'
  const tlmgr = win ? `"${join(bin, 'tlmgr.bat')}"` : join(bin, 'tlmgr')
  const shell = { shell: win }
  emit({ component, state: 'installing', line: 'Installing the LaTeX packages manim needs…' })
  // The release's tlmgr usually trails its repository and refuses to install until updated.
  await run(tlmgr, ['update', '--self'], component, shell)
  await run(tlmgr, ['install', ...LATEX_PACKAGES], component, shell)
  writeFileSync(latexMarker(), TINYTEX_VERSION)
}

/** Runs a command, streaming its output lines to the setup log. */
function run(cmd: string, args: string[], component: Component, opts: SpawnOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: cleanEnv(), windowsHide: true, ...opts })
    emit({ component, state: 'installing', line: `$ ${cmd} ${args.join(' ')}` })
    const tail: string[] = []
    const onData = (buf: Buffer) => {
      for (const raw of buf.toString().split(/\r?\n|\r/)) {
        const line = raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim()
        if (!line) continue
        tail.push(line)
        if (tail.length > 20) tail.shift()
        emit({ component, state: 'installing', line })
      }
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd.split(/[\\/]/).pop()?.replace(/"/g, '')} exited with code ${code}: ${tail.slice(-3).join(' · ')}`)),
    )
  })
}

function capture(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { env: { ...cleanEnv(), PIXI_CACHE_DIR: runtimeCacheEnv(paths.userData()).PIXI_CACHE_DIR }, windowsHide: true, timeout: 20_000, maxBuffer: 2_000_000 }, (error, stdout, stderr) => error ? reject(new Error(stderr.trim() || error.message)) : resolve(stdout))
  })
}
