// Projects are plain folders: scene.py + project.json + voice/ (+ .studio/ for renders,
// git-ignored). One project is open at a time.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import { cp } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { ChatMessage, NewProjectInput, OpenProject, ProjectMeta, ProjectSummary, Timeline } from '../shared/types'
import { initRepo } from './git'
import { slugify } from './slug'
import { paths } from './paths'
import { getSettings, rememberProject, setSettings } from './settings'

export interface Current {
  path: string
  meta: ProjectMeta
  lastWritten: string
  watcher?: FSWatcher
}

let current: Current | null = null
let onExternalChange: (source: string) => void = () => {}

export const project = () => current
export const requireProject = (): Current => {
  if (!current) throw new Error('No project is open')
  return current
}

export function onSceneChangedOnDisk(fn: (source: string) => void): void {
  onExternalChange = fn
}

const sceneFile = (dir: string) => join(dir, 'scene.py')
const metaFile = (dir: string) => join(dir, 'project.json')
const chatFile = (dir: string) => join(dir, '.studio', 'chat.json')

export function readMeta(dir: string): ProjectMeta {
  return JSON.parse(readFileSync(metaFile(dir), 'utf8'))
}

export function readTimeline(dir: string, quality: 'preview' | 'final' = 'preview'): Timeline | null {
  try {
    const t = JSON.parse(readFileSync(join(dir, '.studio', quality, 'timeline.json'), 'utf8')) as Timeline
    return existsSync(t.video) ? t : null
  } catch {
    return null
  }
}

export function listProjects(): ProjectSummary[] {
  const { recentProjects, projectsDir } = getSettings()
  const found = new Set(recentProjects)
  if (existsSync(projectsDir)) {
    for (const name of readdirSync(projectsDir)) {
      const dir = join(projectsDir, name)
      if (existsSync(metaFile(dir))) found.add(dir)
    }
  }
  const out: ProjectSummary[] = []
  for (const dir of found) {
    if (!existsSync(metaFile(dir))) {
      out.push({ path: dir, name: basename(dir), aspect: '16:9', theme: 'dark', updatedAt: 0, missing: true })
      continue
    }
    try {
      const meta = readMeta(dir)
      const timeline = readTimeline(dir)
      const thumb = join(dir, '.studio', 'thumbnail.jpg')
      out.push({
        path: dir,
        name: meta.name,
        aspect: meta.aspect,
        theme: meta.theme,
        updatedAt: statSync(sceneFile(dir)).mtimeMs,
        duration: timeline?.duration,
        thumbnail: existsSync(thumb) ? thumb : undefined,
      })
    } catch {
      // unreadable project.json: skip it
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

export { slugify }

export async function createProject(input: NewProjectInput): Promise<string> {
  const parent = input.parentDir || getSettings().projectsDir
  mkdirSync(parent, { recursive: true })
  let dir = join(parent, slugify(input.name))
  for (let i = 2; existsSync(dir); i++) dir = join(parent, `${slugify(input.name)}-${i}`)

  await cp(join(paths.templates(), 'project'), dir, { recursive: true })
  // electron-builder leaves out files named .gitignore, so the template ships it as "gitignore".
  if (existsSync(join(dir, 'gitignore'))) renameSync(join(dir, 'gitignore'), join(dir, '.gitignore'))
  const meta: ProjectMeta = {
    name: input.name.trim() || 'Untitled video',
    aspect: input.aspect,
    theme: input.theme,
    fps: 30,
    createdAt: new Date().toISOString(),
    voice: { ...getSettings().defaultVoice, language: input.language || getSettings().defaultVoice.language },
  }
  writeFileSync(metaFile(dir), JSON.stringify(meta, null, 2))
  mkdirSync(join(dir, 'voice', 'recordings'), { recursive: true })
  await initRepo(dir)
  if (input.parentDir) setSettings({ projectsDir: input.parentDir })
  return dir
}

export function openProject(dir: string): OpenProject {
  closeProject()
  const meta = readMeta(dir)
  const source = readFileSync(sceneFile(dir), 'utf8')
  current = { path: dir, meta, lastWritten: source }
  current.watcher = watchProject(dir)
  rememberProject(dir)
  return {
    path: dir,
    meta,
    source,
    timeline: readTimeline(dir),
    chat: readChat(dir),
    recordings: listRecordings(dir),
  }
}

export function closeProject(): void {
  current?.watcher?.close()
  current = null
}

export function saveScene(source: string): void {
  const p = requireProject()
  p.lastWritten = source
  writeFileSync(sceneFile(p.path), source)
}

export function updateMeta(patch: Partial<ProjectMeta>): ProjectMeta {
  const p = requireProject()
  p.meta = { ...p.meta, ...patch }
  writeFileSync(metaFile(p.path), JSON.stringify(p.meta, null, 2))
  return p.meta
}

/** The pictures and videos in the open project's media/, for Claude's instructions. */
export function mediaNames(dir = requireProject().path): string[] {
  const media = join(dir, 'media')
  return existsSync(media) ? readdirSync(media).filter((n) => !n.startsWith('.')).sort() : []
}

export function readScene(): string {
  return readFileSync(sceneFile(requireProject().path), 'utf8')
}

export function listRecordings(dir = requireProject().path): string[] {
  const rec = join(dir, 'voice', 'recordings')
  if (!existsSync(rec)) return []
  return readdirSync(rec)
    .filter((f) => f.endsWith('.wav'))
    .map((f) => f.slice(0, -4))
}

export function readChat(dir: string): ChatMessage[] {
  try {
    return JSON.parse(readFileSync(chatFile(dir), 'utf8'))
  } catch {
    return []
  }
}

export function writeChat(messages: ChatMessage[]): void {
  const p = requireProject()
  mkdirSync(join(p.path, '.studio'), { recursive: true })
  writeFileSync(chatFile(p.path), JSON.stringify(messages.slice(-300)))
}

function watchProject(dir: string): FSWatcher {
  let timer: NodeJS.Timeout | undefined
  return watch(dir, (_event, filename) => {
    if (filename !== 'scene.py') return
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (!current || current.path !== dir) return
      let source: string
      try {
        source = readFileSync(sceneFile(dir), 'utf8')
      } catch {
        return
      }
      if (source === current.lastWritten) return
      current.lastWritten = source
      onExternalChange(source)
    }, 120)
  })
}
