// The render cache (ADR 0043): manim's partial movies and typeset text and formulas, which make
// up most of a project's size and are rebuilt when missing. It used to live in each project's
// .studio/cache, so a project in a synced folder (iCloud Drive, OneDrive) uploaded gigabytes of
// throwaway files, and a cloud's "optimize storage" could evict them mid-render. Now each project
// has a folder in paths.renderCache(), named by a hash of its path; the project folder keeps only
// what's worth keeping. The cache is limited in size: the least recently used projects' go first.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, realpathSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { paths } from './paths'

/** Above this, the least recently used projects' caches are removed. */
export const CACHE_LIMIT = 20e9

const real = (dir: string) => (existsSync(dir) ? realpathSync(dir) : resolve(dir))

/**
 * The project's cache folder, made if needed and marked as just used. A project's old in-project
 * cache (.studio/cache) is moved there the first time, or removed if it can't be moved (another
 * disk): it's rebuilt anyway.
 */
export function projectCache(dir: string): string {
  const folder = join(paths.renderCache(), projectFolderName(dir))
  const legacy = join(dir, '.studio', 'cache')
  if (existsSync(legacy)) {
    if (!existsSync(folder)) {
      mkdirSync(paths.renderCache(), { recursive: true })
      try {
        renameSync(legacy, folder)
      } catch {
        // another disk: not worth copying
      }
    }
    rmSync(legacy, { recursive: true, force: true })
  }
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'project.txt'), real(dir)) // which project it was, for whoever looks in here
  const now = new Date()
  utimesSync(folder, now, now)
  return folder
}

function size(path: string): number {
  let total = 0
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const p = join(path, entry.name)
    try {
      total += entry.isDirectory() ? size(p) : statSync(p).size
    } catch {
      // removed meanwhile
    }
  }
  return total
}

/** How big the cache is, and where. */
export function renderCacheInfo(): { path: string; bytes: number } {
  const root = paths.renderCache()
  return { path: root, bytes: existsSync(root) ? size(root) : 0 }
}

/** Removes the whole cache (Settings → Environment); renders rebuild what they need. */
export function clearRenderCache(): void {
  rmSync(paths.renderCache(), { recursive: true, force: true })
}

/** Keeps the cache under the limit, removing the least recently used projects' first; `keep` (open, rendering) stays. */
export function pruneRenderCache(keep: string[] = [], limit = CACHE_LIMIT): void {
  const root = paths.renderCache()
  if (!existsSync(root)) return
  const kept = new Set(keep.map((d) => projectFolderName(d)))
  const folders = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ name: e.name, path: join(root, e.name), used: statSync(join(root, e.name)).mtimeMs, bytes: size(join(root, e.name)) }))
    .sort((a, b) => a.used - b.used)
  let total = folders.reduce((sum, f) => sum + f.bytes, 0)
  for (const f of folders) {
    if (total <= limit) break
    if (kept.has(f.name)) continue
    rmSync(f.path, { recursive: true, force: true })
    total -= f.bytes
  }
}

const projectFolderName = (dir: string) => createHash('sha256').update(real(dir)).digest('hex').slice(0, 16)
