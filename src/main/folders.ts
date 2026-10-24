// Where projects live (ADR 0043): whether a folder is synced by a cloud drive, what Manim Studio
// projects it already holds (a returning user's folder), and choosing it as the projects folder.
// Synced folders are allowed (they back the projects up) but never the default: Documents is
// synced by iCloud on many Macs ("Desktop & Documents Folders") and by OneDrive on most new
// Windows PCs (folder backup), so new installs put projects in the home folder instead.
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import type { FolderInfo, ProjectsFolders, Settings } from '../shared/types'
import { paths } from './paths'
import { getSettings, setSettings } from './settings'

/** The nearest existing folder's real path, for a folder that may not exist yet. */
function realish(dir: string): string {
  let at = resolve(dir)
  const rest: string[] = []
  while (!existsSync(at) && dirname(at) !== at) {
    rest.unshift(at.slice(dirname(at).length + 1))
    at = dirname(at)
  }
  const base = existsSync(at) ? realpathSync(at) : at
  return rest.length ? join(base, ...rest) : base
}

const inside = (path: string, folder: string) => {
  const p = process.platform === 'win32' ? path.toLowerCase() : path
  const f = process.platform === 'win32' ? folder.toLowerCase() : folder
  return p === f || p.startsWith(f.endsWith(sep) ? f : f + sep)
}

/**
 * The cloud drive that syncs `dir`, or null. Windows: OneDrive's own folders (its folder backup
 * moves Documents into them), iCloud Drive's. macOS: iCloud Drive, the File Provider drives in
 * ~/Library/CloudStorage (OneDrive, Dropbox, Google Drive, Box), and Documents or Desktop while
 * iCloud's "Desktop & Documents Folders" is on. Anywhere: a Dropbox or Google Drive folder by name.
 */
export function cloudSync(dir: string): string | null {
  const path = realish(dir)
  const home = homedir()
  if (process.platform === 'win32') {
    for (const v of ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial']) if (process.env[v] && inside(path, process.env[v]!)) return 'OneDrive'
    if (/\\OneDrive( - [^\\]+)?(\\|$)/i.test(path)) return 'OneDrive'
    if (inside(path, join(home, 'iCloudDrive'))) return 'iCloud Drive'
  }
  if (process.platform === 'darwin') {
    if (inside(path, join(home, 'Library', 'Mobile Documents'))) return 'iCloud Drive'
    const storage = join(home, 'Library', 'CloudStorage')
    if (inside(path, storage)) {
      const provider = path.slice(storage.length + 1).split(sep)[0] ?? ''
      return /^OneDrive/i.test(provider)
        ? 'OneDrive'
        : /^Dropbox/i.test(provider)
          ? 'Dropbox'
          : /^GoogleDrive/i.test(provider)
            ? 'Google Drive'
            : /^Box/i.test(provider)
              ? 'Box'
              : 'a cloud drive'
    }
    // "Desktop & Documents Folders": iCloud Drive then holds Desktop and Documents next to its own files.
    const icloud = join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs')
    for (const name of ['Documents', 'Desktop']) if (inside(path, join(home, name)) && existsSync(join(icloud, name))) return 'iCloud Drive'
  }
  if (/[\\/]Dropbox([\\/]|$)/.test(path)) return 'Dropbox'
  if (/[\\/](Google Drive|My Drive)([\\/]|$)/.test(path)) return 'Google Drive'
  return null
}

const isProject = (dir: string) => existsSync(join(dir, 'project.json'))

/** What a folder holds, as Home and the study screens find it: one level down, and a course's episodes and exercises. */
export function inspectFolder(dir: string): FolderInfo {
  const found = { videos: 0, courses: 0, exerciseSets: 0 }
  if (existsSync(dir))
    for (const name of readdirSync(dir)) {
      const sub = join(dir, name)
      try {
        if (existsSync(join(sub, 'series.json'))) found.courses++
        else if (existsSync(join(sub, 'exercises.json'))) found.exerciseSets++
        else if (isProject(sub)) found.videos++
      } catch {
        // unreadable: skip it
      }
    }
  const any = found.videos + found.courses + found.exerciseSets > 0
  return { path: dir, cloud: cloudSync(dir), exists: existsSync(dir), found: any ? found : null }
}

/** The onboarding's choices: a local folder, Documents (and whether it's synced), and the folder in use. */
export function projectsFolders(): ProjectsFolders {
  const local = paths.defaultProjectsDir()
  const documents = paths.legacyProjectsDir()
  return { local: inspectFolder(local), documents: inspectFolder(documents), current: getSettings().projectsDir }
}

const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
const writeJson = (file: string, data: unknown) => writeFileSync(file, JSON.stringify(data, null, 2))

/** Points every project of an exercise set at the set's folder, where it now is. */
function repairSet(set: string, course?: string): void {
  const file = join(set, 'exercises.json')
  const f = readJson(file) as { exercises?: string[]; course?: string }
  if (course && f.course !== course) writeJson(file, { ...f, course })
  for (const name of f.exercises ?? []) {
    const meta = join(set, name, 'project.json')
    if (!existsSync(meta)) continue
    const m = readJson(meta) as { exercise?: { set: string } }
    if (m.exercise && m.exercise.set !== set) writeJson(meta, { ...m, exercise: { ...m.exercise, set } })
  }
}

/**
 * A folder brought back from another computer or a backup sits at another path (another user
 * name, another disk), but its courses and exercise sets name their folders by absolute path.
 * Points them at where they are now: episodes and follow-ups at their course, exercises at their
 * set, a course's set at its course.
 */
export function repairFolderLinks(dir: string): void {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    const sub = join(dir, name)
    try {
      if (existsSync(join(sub, 'series.json'))) {
        const episodes = [
          ...readdirSync(sub).map((n) => join(sub, n)),
          ...(existsSync(join(sub, 'extras')) ? readdirSync(join(sub, 'extras')).map((n) => join(sub, 'extras', n)) : []),
        ]
        for (const ep of episodes) {
          const meta = join(ep, 'project.json')
          if (!existsSync(meta)) continue
          const m = readJson(meta) as { series?: { folder: string } }
          if (m.series && m.series.folder !== sub) writeJson(meta, { ...m, series: { ...m.series, folder: sub } })
        }
        if (existsSync(join(sub, 'exercises', 'exercises.json'))) repairSet(join(sub, 'exercises'), sub)
      } else if (existsSync(join(sub, 'exercises.json'))) repairSet(sub)
    } catch {
      // an unreadable folder stays as it is
    }
  }
}

/** Makes `dir` the projects folder, its links repaired; Home then lists what's in it. */
export function useProjectsFolder(dir: string): Settings {
  mkdirSync(dir, { recursive: true })
  repairFolderLinks(dir)
  return setSettings({ projectsDir: dir })
}
