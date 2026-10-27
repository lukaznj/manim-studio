// Projects are plain folders: scene.py + project.json + voice/ (+ .studio/ for renders,
// git-ignored). One project is open at a time.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import { cp } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { ChatMessage, NewProjectInput, OpenProject, ProjectMeta, ProjectSummary, Timeline } from '../shared/types'
import { SCRIPT_FILE } from '../shared/script'
import { DEFAULT_TONE } from '../shared/tone'
import { migrateVoice } from '../shared/voice'
import { initRepo } from './git'
import { slugify } from './slug'
import { paths } from './paths'
import { getSettings, rememberProject, setSettings } from './settings'
import { readAtomicJson, writeAtomicJson } from './atomic-json'

export interface Current {
  path: string
  meta: ProjectMeta
  lastWritten: string
  lastScript?: string | null // script.md as last written or seen, to tell Claude's edits from ours
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
const metaBackup = (dir: string) => join(dir, '.studio', 'project-meta.json')

export function readMeta(dir: string): ProjectMeta {
  const meta = readAtomicJson(metaFile(dir), (value): value is ProjectMeta => !!value && typeof (value as ProjectMeta).name === 'string', metaBackup(dir))
  if (!meta) throw new Error('The project settings could not be read.')
  return meta.voice ? { ...meta, voice: migrateVoice(meta.voice) } : meta
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
      // A series folder (series.ts) holds its episodes one level down.
      else if (existsSync(join(dir, 'series.json'))) for (const ep of readdirSync(dir)) if (existsSync(metaFile(join(dir, ep)))) found.add(join(dir, ep))
    }
  }
  // Remember what the scan found too, so a project moved out of the projects folder shows as
  // "Folder not found" (and can be located) instead of vanishing.
  const unknown = [...found].filter((dir) => !recentProjects.includes(dir))
  if (unknown.length) setSettings({ recentProjects: [...recentProjects, ...unknown] })
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
        series: meta.series,
        exercise: meta.exercise,
        extra: !!meta.extra,
      })
    } catch {
      // unreadable project.json: skip it
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

export { slugify }

export async function createProject(input: NewProjectInput, targetDir?: string): Promise<string> {
  const parent = input.parentDir || getSettings().projectsDir
  mkdirSync(parent, { recursive: true })
  let dir = targetDir ?? join(parent, slugify(input.name))
  if (!targetDir) for (let i = 2; existsSync(dir); i++) dir = join(parent, `${slugify(input.name)}-${i}`)
  if (targetDir && existsSync(targetDir)) throw new Error('The project folder already exists.')

  await cp(join(paths.templates(), 'project'), dir, { recursive: true })
  // electron-builder leaves out files named .gitignore, so the template ships it as "gitignore".
  if (existsSync(join(dir, 'gitignore'))) renameSync(join(dir, 'gitignore'), join(dir, '.gitignore'))
  const meta: ProjectMeta = {
    name: input.name.trim() || 'Untitled video',
    aspect: input.aspect,
    theme: input.theme,
    tone: input.tone ?? getSettings().defaultTone ?? DEFAULT_TONE,
    background: getSettings().defaultBackground,
    scriptFirst: true,
    series: input.series,
    exercise: input.exercise,
    captionBand: true,
    fps: 30,
    createdAt: new Date().toISOString(),
    voice: { ...(input.voice ?? getSettings().defaultVoice), language: input.language || input.voice?.language || getSettings().defaultVoice.language },
  }
  writeAtomicJson(metaFile(dir), meta, metaBackup(dir))
  mkdirSync(join(dir, 'voice', 'recordings'), { recursive: true })
  await initRepo(dir)
  if (input.parentDir && !input.series && !input.exercise) setSettings({ projectsDir: input.parentDir }) // an episode's or exercise's folder isn't a choice to remember
  return dir
}

export function openProject(dir: string): OpenProject {
  closeProject()
  const meta = readMeta(dir)
  const source = readFileSync(sceneFile(dir), 'utf8')
  current = { path: dir, meta, lastWritten: source, lastScript: readScript(dir) }
  current.watcher = watchProject(dir)
  rememberProject(dir)
  return {
    path: dir,
    meta,
    source,
    script: readScript(dir),
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

/** updateMeta for any project: the open one in memory too, any other only on disk. */
export function updateMetaAt(dir: string, patch: Partial<ProjectMeta>): void {
  if (current?.path === dir) return void updateMeta(patch)
  writeAtomicJson(metaFile(dir), { ...readMeta(dir), ...patch }, metaBackup(dir))
}

export function updateMeta(patch: Partial<ProjectMeta>): ProjectMeta {
  const p = requireProject()
  p.meta = { ...p.meta, ...patch }
  writeAtomicJson(metaFile(p.path), p.meta, metaBackup(p.path))
  return p.meta
}

/** The pictures and videos in the open project's media/, for Claude's instructions. */
export function mediaNames(dir = requireProject().path): string[] {
  const media = join(dir, 'media')
  return existsSync(media)
    ? readdirSync(media)
        .filter((n) => !n.startsWith('.'))
        .sort()
    : []
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
  return readAtomicJson(chatFile(dir), (value): value is ChatMessage[] => Array.isArray(value)) ?? []
}

export function writeChat(messages: ChatMessage[], dir = requireProject().path): void {
  mkdirSync(join(dir, '.studio'), { recursive: true })
  writeAtomicJson(chatFile(dir), messages)
}

export const readScript = (dir: string): string | null => (existsSync(join(dir, SCRIPT_FILE)) ? readFileSync(join(dir, SCRIPT_FILE), 'utf8') : null)

export function saveScript(text: string): void {
  const dir = requireProject().path
  writeFileSync(join(dir, SCRIPT_FILE), text)
  current!.lastScript = text
}

let onScriptChange: (text: string | null) => void = () => {}
export function onScriptChangedOnDisk(fn: (text: string | null) => void): void {
  onScriptChange = fn
}

function watchProject(dir: string): FSWatcher {
  let timer: NodeJS.Timeout | undefined
  let scriptTimer: NodeJS.Timeout | undefined
  return watch(dir, (_event, filename) => {
    if (filename === SCRIPT_FILE) {
      clearTimeout(scriptTimer)
      scriptTimer = setTimeout(() => {
        if (!current || current.path !== dir) return
        const text = readScript(dir)
        if (text === current.lastScript) return
        current.lastScript = text
        onScriptChange(text)
      }, 120)
      return
    }
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
