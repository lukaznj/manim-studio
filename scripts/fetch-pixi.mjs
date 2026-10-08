// Downloads the pixi binary the app ships with (resources/bin/pixi), verified against the
// release's sha256. Run before `npm run dev` the first time, and in CI before packaging.
//   node scripts/fetch-pixi.mjs [platform] [arch]   (defaults: this machine)
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const VERSION = 'v0.81.0'
const platform = process.argv[2] ?? process.platform
const arch = process.argv[3] ?? process.arch

const triple = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc',
  'win32-arm64': 'aarch64-pc-windows-msvc',
  'linux-x64': 'x86_64-unknown-linux-musl',
}[`${platform}-${arch}`]
if (!triple) throw new Error(`no pixi build for ${platform}-${arch}`)

const archive = platform === 'win32' ? `pixi-${triple}.zip` : `pixi-${triple}.tar.gz`
const base = `https://github.com/prefix-dev/pixi/releases/download/${VERSION}`
const outDir = join(import.meta.dirname, '..', 'resources', 'bin')
const exe = platform === 'win32' ? 'pixi.exe' : 'pixi'

if (existsSync(join(outDir, exe)) && !process.env.FORCE) {
  console.log(`resources/bin/${exe} exists (FORCE=1 to replace)`)
  process.exit(0)
}

const get = async (url) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

const [data, sums] = await Promise.all([get(`${base}/${archive}`), get(`${base}/${archive}.sha256`)])
const expected = sums.toString().trim().split(/\s+/)[0]
const actual = createHash('sha256').update(data).digest('hex')
if (expected !== actual) throw new Error(`sha256 mismatch for ${archive}: ${actual} != ${expected}`)

const work = mkdtempSync(join(tmpdir(), 'pixi-'))
writeFileSync(join(work, archive), data)
// Windows' own bsdtar reads zips; Git Bash's GNU tar (first on PATH in CI) doesn't.
const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
execFileSync(tar, [archive.endsWith('.zip') ? '-xf' : '-xzf', join(work, archive), '-C', work])
mkdirSync(outDir, { recursive: true })
copyFileSync(join(work, exe), join(outDir, exe)) // not rename: tmp and the repo can be on different drives
if (platform !== 'win32') chmodSync(join(outDir, exe), 0o755)
rmSync(work, { recursive: true, force: true })
console.log(`pixi ${VERSION} (${triple}) → resources/bin/${exe}`)
