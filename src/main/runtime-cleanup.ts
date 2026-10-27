// Shared by the app and the Windows uninstaller. No Electron or third-party imports.
import { lstat, readdir, readFile, realpath, rename, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, isAbsolute, join, relative, resolve, sep, posix, win32 } from 'node:path'

export interface CleanupRoots { userData: string; renderCache: string }
export interface CleanupResult { removed: string[]; kept: string[]; errors: string[]; bytes: number }

/** Keep future downloads attributable to Studio; never delete the old shared caches. */
export function runtimeCacheEnv(userData: string): Record<string, string> {
  const hf = join(userData, 'models', 'huggingface')
  return {
    PIXI_CACHE_DIR: join(userData, 'runtime-cache', 'pixi'),
    HF_HOME: hf,
    HF_HUB_CACHE: join(hf, 'hub'),
    HUGGINGFACE_HUB_CACHE: join(hf, 'hub'),
    HF_XET_CACHE: join(hf, 'xet'),
    HF_ASSETS_CACHE: join(hf, 'assets'),
    TORCH_HOME: join(userData, 'models', 'torch'),
  }
}
const contains = (parent: string, child: string) => { const path = relative(parent, child); return !path || path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path) }

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error }
}

/** Never follow links while looking for projects or counting removable bytes. */
async function inspect(path: string): Promise<{ bytes: number; project: boolean }> {
  const stat = await lstat(path)
  if (stat.isSymbolicLink()) return { bytes: 0, project: false }
  if (!stat.isDirectory()) return { bytes: stat.size, project: false }
  const entries = await readdir(path)
  if (entries.includes('series.json') || entries.includes('exercises.json') || entries.includes('project.json') && entries.includes('scene.py')) return { bytes: 0, project: true }
  let bytes = 0
  for (const entry of entries) {
    const result = await inspect(join(path, entry))
    if (result.project) return result
    bytes += result.bytes
  }
  return { bytes, project: false }
}

async function linkedBelow(root: string, path: string): Promise<boolean> {
  let current = path
  for (;;) {
    if ((await lstat(current)).isSymbolicLink()) return true
    if (current === root) return false
    const parent = dirname(current)
    if (parent === current || !contains(root, parent)) return true
    current = parent
  }
}

async function projectPaths(root: string): Promise<string[]> {
  try {
    const settings = JSON.parse(await readFile(join(root, 'settings.json'), 'utf8'))
    const paths = [settings.projectsDir, ...(Array.isArray(settings.recentProjects) ? settings.recentProjects : [])]
    return paths.filter((path): path is string => typeof path === 'string' && isAbsolute(path)).map((path) => resolve(path))
  } catch { return [] }
}

async function candidates(roots: CleanupRoots): Promise<{ root: string; path: string }[]> {
  const root = resolve(roots.userData)
  const names = ['python-env', 'tinytex', 'runtime-cache', 'models/huggingface/hub', 'models/huggingface/xet', 'models/huggingface/assets', 'models/torch']
  const out = names.map((name) => ({ root, path: join(root, name) }))
  for (const name of ['codex', 'antigravity']) {
    const parent = join(root, name)
    if (!await exists(parent) || await linkedBelow(root, parent)) continue
    for (const version of await readdir(parent)) if (/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(version)) out.push({ root, path: join(parent, version) })
  }
  // This is the dedicated render-cache path supplied by paths.ts, never a renderer argument.
  const cache = resolve(roots.renderCache)
  if (cache !== root && !contains(cache, root)) out.push({ root: dirname(cache), path: cache })
  return out
}

/** Fixed allowlist only; settings, sign-ins, conversations, projects and shared system caches survive. */
export async function cleanupRuntimes(roots: CleanupRoots, remove = false): Promise<CleanupResult> {
  const result: CleanupResult = { removed: [], kept: [], errors: [], bytes: 0 }
  const protectedPaths = await projectPaths(roots.userData)
  for (const candidate of await candidates(roots)) {
    const { root, path } = candidate
    let quarantine: string | null = null
    try {
      if (!await exists(path)) continue
      if (await linkedBelow(root, path)) { result.kept.push(path); continue }
      const actual = await realpath(path)
      if (protectedPaths.some((project) => contains(path, project) || contains(actual, project))) { result.kept.push(path); continue }
      const info = await inspect(path)
      if (info.project) { result.kept.push(path); continue }
      if (remove) {
        // Detach first, then recheck. New files at the original path belong to the next install.
        quarantine = join(dirname(path), `.studio-cleanup-${randomUUID()}`)
        await rename(path, quarantine)
        const checked = await inspect(quarantine)
        if (checked.project) {
          await rename(quarantine, path)
          quarantine = null
          result.kept.push(path)
          continue
        }
        await rm(quarantine, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 })
        quarantine = null
      }
      result.removed.push(path)
      result.bytes += info.bytes
    } catch (error) {
      if (quarantine) {
        try { if (!await exists(path)) { await rename(quarantine, path); quarantine = null } } catch { /* Report its retained location below. */ }
      }
      result.errors.push(`${quarantine ?? path}: ${(error as Error).message}`)
    }
  }
  return result
}

/** Only a packaged app can remove itself; never a checkout or the development Electron bundle. */
export function uninstallTarget(packaged: boolean, platform: string, exe: string, appImage?: string): { kind: 'trash' | 'nsis'; path: string } | null {
  if (!packaged) return null
  const { dirname, join, isAbsolute } = platform === 'win32' ? win32 : posix
  if (platform === 'darwin') {
    const bundle = dirname(dirname(dirname(exe)))
    return bundle.endsWith('.app') && exe === join(bundle, 'Contents', 'MacOS', 'Manim Studio') ? { kind: 'trash', path: bundle } : null
  }
  if (platform === 'linux') return appImage && isAbsolute(appImage) && appImage.endsWith('.AppImage') ? { kind: 'trash', path: appImage } : null
  if (platform === 'win32') return { kind: 'nsis', path: join(dirname(exe), 'Uninstall Manim Studio.exe') }
  return null
}
