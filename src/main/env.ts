// The managed Python environment (pixi) and LaTeX (TinyTeX), both installed into the
// app's data folder so colleagues need nothing but the app. See docs ADR 0003.
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Component, ComponentState, SetupEvent, SetupStatus } from '../shared/types'
import { paths } from './paths'

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
  const installed = existsSync(installedHashFile()) ? readFileSync(installedHashFile(), 'utf8') : ''
  return installed === manifestHash() ? 'ready' : 'outdated'
}

// Written only after the manim packages installed: an unpacked TinyTeX alone isn't usable.
const latexMarker = () => join(paths.tinytex(), '.manim-studio-ready')

export function latexBin(): string | null {
  const bin = join(paths.tinytex(), 'bin')
  if (!existsSync(bin)) return null
  const platformDir = readdirSync(bin)[0]
  return platformDir ? join(bin, platformDir) : null
}

export function setupStatus(): SetupStatus {
  const omnivoiceSupported = !(process.platform === 'darwin' && process.arch === 'x64')
  return {
    pixi: existsSync(paths.pixi()),
    env: envState('default', 'env'),
    latex: installing.has('latex') ? 'installing' : errors.latex ? 'error' : existsSync(latexMarker()) ? 'ready' : 'missing',
    omnivoice: omnivoiceSupported ? envState('omnivoice', 'omnivoice') : 'unsupported',
    transcribe: envState('transcribe', 'transcribe'),
    errors,
  }
}

// --- running Python ---------------------------------------------------------------------

const activation = new Map<EnvName, Record<string, string>>()

/** Environment variables of an activated pixi env (PATH, CONDA_PREFIX, fontconfig, ...). */
async function activate(name: EnvName): Promise<Record<string, string>> {
  const cached = activation.get(name)
  if (cached) return cached
  const out = await capture(paths.pixi(), ['shell-hook', '--json', '-e', name, '--manifest-path', join(paths.env(), 'pixi.toml')])
  const vars = JSON.parse(out).environment_variables as Record<string, string>
  activation.set(name, vars)
  return vars
}

export async function pythonEnv(name: EnvName, extra: Record<string, string> = {}): Promise<NodeJS.ProcessEnv> {
  const vars = await activate(name)
  const latex = latexBin()
  const path = [latex, vars.PATH ?? process.env.PATH].filter(Boolean).join(delimiter)
  return {
    ...cleanEnv(),
    ...vars,
    PATH: path,
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
  return spawn(pythonExe(name), ['-m', 'studio_runner', ...args], {
    env: await pythonEnv(name, extra),
    cwd: cwd ?? paths.python(),
    windowsHide: true,
  })
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

export async function install(component: Component): Promise<void> {
  if (installing.has(component)) return
  installing.add(component)
  delete errors[component]
  emit({ component, state: 'installing', line: 'Starting the install…' })
  try {
    if (component === 'latex') await installLatex(component)
    else await installEnv(component === 'env' ? 'default' : component, component)
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
  if (!existsSync(paths.pixi())) throw new Error(`pixi is missing (${paths.pixi()}). In development, run: npm run fetch-pixi`)
  mkdirSync(paths.env(), { recursive: true })
  for (const f of ['pixi.toml', 'pixi.lock']) {
    const src = join(paths.python(), f)
    if (existsSync(src)) copyFileSync(src, join(paths.env(), f))
  }
  const frozen = existsSync(join(paths.env(), 'pixi.lock')) ? ['--frozen'] : []
  await run(paths.pixi(), ['install', ...frozen, '-e', name, '--manifest-path', join(paths.env(), 'pixi.toml')], component)
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
  const tlmgr = join(bin, process.platform === 'win32' ? 'tlmgr.bat' : 'tlmgr')
  emit({ component, state: 'installing', line: 'Installing the LaTeX packages manim needs…' })
  // The release's tlmgr usually trails its repository and refuses to install until updated.
  await run(tlmgr, ['update', '--self'], component)
  await run(tlmgr, ['install', ...LATEX_PACKAGES], component)
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
      code === 0 ? resolve() : reject(new Error(`${cmd.split(/[\\/]/).pop()} exited with code ${code}: ${tail.slice(-3).join(' · ')}`)),
    )
  })
}

function capture(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: cleanEnv(), windowsHide: true })
    let out = ''
    let err = ''
    child.stdout.on('data', (b) => (out += b))
    child.stderr.on('data', (b) => (err += b))
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err.trim() || `exit ${code}`))))
  })
}
