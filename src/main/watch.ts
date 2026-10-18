// Watching a series (ADR 0028): its episodes' videos to study, and follow-up videos the viewer asks
// for while watching, explaining a part further. A follow-up is a project in the series folder's
// extras/, carrying meta.extra (which episode, where in it, what was asked); a background agent
// makes and exports it like a series episode, with the episode's script and the series bible.
import { accessSync, constants, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { SCRIPT_FILE } from '../shared/script'
import { momentNote } from '../shared/moment'
import { defaultAgentSelection } from '../shared/agent-selection'
import type { FollowUp, ProjectMeta, SeriesPlan, WatchDetail, WatchEpisode, WatchSeries } from '../shared/types'
import { episodeAgent, turnPastLimits, type EpisodeAgent } from './agent'
import { claudeStatus } from './claude'
import { fakeAgents } from './agent-fake'
import { setupStatus } from './env'
import { cancelExport, queueExport } from './exports'
import { cancel } from './render'
import { createProject, readMeta, readTimeline, updateMetaAt } from './projects'
import { checkAndFix } from './quick'
import { writeEpisodeBible } from './series'
import { titleFrom } from './title'
import { getSettings, setSettings } from './settings'
import { slugify } from './slug'
import { isWatched, writeWatched } from './watched'

let send: (series: WatchSeries) => void = () => {}
const running = new Map<string, { activity?: string; agent?: EpisodeAgent; stopping?: boolean; exportJob?: string }>()
export const watchVideosBusy = () => running.size > 0
export function stopWatchVideos(): void {
  for (const [dir, run] of running) {
    run.stopping = true
    run.agent?.close()
    cancel('preview', dir)
    if (run.exportJob) cancelExport(run.exportJob)
  }
}

export function setupWatch(sendSeries: typeof send): void {
  send = sendSeries
}

const savedFile = (dir: string) => join(dir, '.studio', 'follow-up.json')
const lessonFile = (dir: string) => join(dir, '.studio', 'lesson.json')
const adding = new Set<string>()

/** The newest exported video in the project's exports/, not a dubbed one (<name>.<lang>.mp4). */
function exported(dir: string): string | undefined {
  const root = join(dir, 'exports')
  if (!existsSync(root)) return undefined
  const videos = readdirSync(root)
    .flatMap((sub) =>
      existsSync(join(root, sub)) && statSync(join(root, sub)).isDirectory() ? readdirSync(join(root, sub)).map((f) => join(root, sub, f)) : [],
    )
    .filter((f) => f.endsWith('.mp4') && !/\.[a-z]{2,3}(-[A-Za-z]{2,4})?\.mp4$/.test(f.replace(/\.(dark|light)\.mp4$/, '.mp4')))
  return videos.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
}

function followUp(dir: string): FollowUp {
  const meta = readMeta(dir)
  const video = exported(dir)
  const run = running.get(dir)
  let failed: string | undefined
  try {
    failed = (JSON.parse(readFileSync(savedFile(dir), 'utf8')) as { failed?: string }).failed
  } catch {
    // made, or still being made
  }
  return {
    dir,
    title: meta.name,
    at: meta.extra?.at ?? 0,
    request: meta.extra?.request ?? '',
    state: run ? 'making' : video ? 'done' : 'failed',
    activity: run?.activity,
    watched: isWatched(dir),
    error: run || video ? undefined : (failed ?? 'It was interrupted. Try again.'),
    video,
  }
}

/** The series' episodes in order (series.json), each with its exported video and follow-ups. */
export function watchSeries(folder: string): WatchSeries {
  const file = join(folder, 'series.json')
  if (!existsSync(file) && existsSync(join(folder, 'project.json'))) {
    // A single video (Learn mode watches every video here): a list of one.
    const meta = readMeta(folder)
    return {
      folder,
      title: meta.name,
      episodes: [{ dir: folder, number: 1, title: meta.name, video: exported(folder), watched: isWatched(folder), followUps: [] }],
    }
  }
  if (!existsSync(file)) throw new Error('That folder isn’t a series any more (its series.json is gone).')
  const { plan, episodes } = JSON.parse(readFileSync(file, 'utf8')) as { plan: { title: string }; episodes: string[] }
  const extras = join(folder, 'extras')
  const follow = existsSync(extras) ? readdirSync(extras).filter((n) => existsSync(join(extras, n, 'project.json'))) : []
  const list: WatchEpisode[] = episodes
    .filter((name) => existsSync(join(folder, name, 'project.json')))
    .map((name, i) => {
      const dir = join(folder, name)
      const run = running.get(dir)
      const video = exported(dir)
      let lesson: { failed?: string } | undefined
      if (existsSync(lessonFile(dir))) {
        try {
          lesson = JSON.parse(readFileSync(lessonFile(dir), 'utf8'))
        } catch {
          lesson = {}
        }
      }
      return {
        dir,
        number: readMeta(dir).series?.episode ?? i + 1,
        title: readMeta(dir).name,
        video,
        state: run ? 'making' : lesson && !video ? 'failed' : undefined,
        activity: run?.activity,
        error: !run && lesson && !video ? (lesson.failed ?? 'It was interrupted. Try again.') : undefined,
        watched: isWatched(dir),
        followUps: follow
          .map((n) => join(extras, n))
          .filter((d) => readMeta(d).extra?.of === name)
          .map(followUp),
      }
    })
  const exercises = join(folder, 'exercises')
  return { folder, title: plan.title, episodes: list, exercises: existsSync(join(exercises, 'exercises.json')) ? exercises : undefined }
}

/** Marks a video watched or not; the screen showing its list hears about it. */
export function setWatched(dir: string, watched: boolean, exerciseChanged: (dir: string, watched: boolean) => void): void {
  writeWatched(dir, watched)
  if (readMeta(dir).exercise) exerciseChanged(dir, watched)
  else changed(dir)
}

export function watchDetail(dir: string): WatchDetail {
  const meta = readMeta(dir)
  const video = exported(dir)
  const vtt = video && join(video, '..', `${basename(video).replace(/(\.(dark|light))?\.mp4$/, '')}.${meta.voice.language}.vtt`)
  const timeline = readTimeline(dir)
  return {
    video,
    vtt: vtt && existsSync(vtt) ? vtt : undefined,
    preview: timeline?.video,
    chapters: timeline?.sections.filter((s) => s.end > s.start) ?? [],
    subtitles: timeline?.subtitles ?? [],
  }
}

async function ensureReady(): Promise<void> {
  if (setupStatus().env !== 'ready') throw new Error('The manim environment isn’t installed yet (Settings → Environment).')
  if (!fakeAgents() && !(await claudeStatus()).loggedIn) throw new Error('Sign in to your agent first (Settings → Accounts): it makes the video.')
}

export async function requestFollowUp(dir: string, at: number, request: string): Promise<void> {
  await ensureReady()
  if (!request.trim()) throw new Error('Say what the new video should explain.')
  const meta = readMeta(dir)
  const s = meta.series
  if (!s) throw new Error('Follow-up videos are for a series’ episodes.')
  const extras = join(s.folder, 'extras')
  mkdirSync(extras, { recursive: true })
  const made = await createProject({
    name: `#${s.episode} follow-up: ${titleFrom(request)}`,
    aspect: meta.aspect,
    theme: meta.theme,
    tone: meta.tone,
    scriptFirst: true,
    language: meta.voice.language,
    voice: meta.voice,
    series: s,
    parentDir: extras,
  })
  let extra = join(extras, `${String(s.episode).padStart(2, '0')}-${basename(made)}`)
  for (let i = 2; existsSync(extra); i++) extra = `${join(extras, `${String(s.episode).padStart(2, '0')}-${basename(made)}`)}-${i}`
  renameSync(made, extra)
  updateMetaAt(extra, { extra: { of: basename(dir), at, request: request.trim() } })
  if (existsSync(join(dir, SCRIPT_FILE))) copyFileSync(join(dir, SCRIPT_FILE), join(extra, 'episode-script.md'))
  void make(extra, meta, at, request.trim())
}

export async function retryFollowUp(dir: string): Promise<void> {
  await ensureReady()
  const meta = readMeta(dir)
  if (!meta.extra || !meta.series) throw new Error('That isn’t a follow-up video.')
  const episode = join(meta.series.folder, meta.extra.of)
  void make(dir, readMeta(episode), meta.extra.at, meta.extra.request)
}

/** Append a lesson using the course's notation and media settings. Existing lessons stay in order. */
export async function addCourseLesson(folder: string, request: { title: string; prompt: string; sources: string[] }): Promise<string> {
  await ensureReady()
  if (!request.title.trim() || (!request.prompt.trim() && !request.sources.length)) throw new Error('Give the lesson a title and a topic or PDF.')
  for (const source of request.sources) {
    if (!/\.pdf$/i.test(source) || !statSync(source).isFile()) throw new Error('Lesson sources must be readable PDFs.')
    accessSync(source, constants.R_OK)
  }
  if (adding.has(folder)) throw new Error('A lesson is already being added to this course. Try again in a moment.')
  const file = join(folder, 'series.json')
  if (!existsSync(file)) throw new Error('Add lessons from a course, rather than a single video.')
  adding.add(folder)
  try {
    const course = JSON.parse(readFileSync(file, 'utf8')) as { plan: SeriesPlan; episodes: string[] }
    const existing = course.episodes.map((name) => join(folder, name)).filter((dir) => existsSync(join(dir, 'project.json')))
    if (!existing.length) throw new Error('This course has no lesson to take its settings from.')
    const first = readMeta(existing[0])
    const number = Math.max(course.episodes.length, ...existing.map((dir) => readMeta(dir).series?.episode ?? 0)) + 1
    const title = request.title.trim()
    const made = await createProject({
      name: title,
      aspect: first.aspect,
      theme: first.theme,
      tone: first.tone,
      voice: first.voice,
      language: first.voice.language,
      scriptFirst: true,
      series: { title: course.plan.title, folder, episode: number, of: number, brief: request.prompt.trim() || title },
      parentDir: folder,
    })
    let dir = join(folder, `${String(number).padStart(2, '0')}-${basename(made)}`)
    for (let suffix = 2; existsSync(dir); suffix++) dir = join(folder, `${String(number).padStart(2, '0')}-${basename(made)}-${suffix}`)
    renameSync(made, dir)
    updateMetaAt(dir, { background: first.background, fps: first.fps })
    const names: string[] = []
    for (const source of request.sources) {
      if (!/\.pdf$/i.test(source)) throw new Error('Lesson sources must be PDFs.')
      mkdirSync(join(dir, 'sources'), { recursive: true })
      const base = slugify(basename(source).replace(/\.pdf$/i, '')) || 'source'
      let name = `${base}.pdf`
      for (let i = 2; names.includes(name); i++) name = `${base}-${i}.pdf`
      copyFileSync(source, join(dir, 'sources', name))
      names.push(name)
    }
    course.episodes.push(basename(dir))
    course.plan.episodes.push({ title, summary: request.prompt.trim() || title, sources: names.map((file) => ({ file })) })
    const pendingFile = join(folder, '.series-next.json')
    writeFileSync(pendingFile, JSON.stringify(course, null, 2))
    renameSync(pendingFile, file)
    for (const project of [...existing, dir]) {
      const meta = readMeta(project)
      if (meta.series) updateMetaAt(project, { series: { ...meta.series, of: number } })
    }
    const settings = getSettings()
    setSettings({ recentProjects: [dir, ...settings.recentProjects.filter((path) => path !== made && path !== dir)] })
    const brief = [
      request.prompt.trim() || `Teach the material in the attached PDFs as a lesson called "${title}".`,
      names.length ? `Use these sources in sources/: ${names.join(', ')}.` : '',
    ]
      .filter(Boolean)
      .join('\n')
    void make(dir, readMeta(dir), 0, brief, true)
    return dir
  } finally {
    adding.delete(folder)
  }
}

export async function retryCourseLesson(dir: string): Promise<void> {
  await ensureReady()
  if (running.has(dir)) throw new Error('This lesson is already being made.')
  const meta = readMeta(dir)
  const saved = JSON.parse(readFileSync(lessonFile(dir), 'utf8')) as { request: string }
  if (!meta.series || !saved.request) throw new Error('This lesson has no saved request.')
  void make(dir, meta, 0, saved.request, true)
}

const changed = (dir: string) => send(watchSeries(readMeta(dir).series?.folder ?? dir))

async function make(dir: string, episode: ProjectMeta, at: number, request: string, lesson = false): Promise<void> {
  const stateFile = lesson ? lessonFile(dir) : savedFile(dir)
  const run: { activity?: string; agent?: EpisodeAgent; stopping?: boolean; exportJob?: string } = { activity: 'Starting' }
  running.set(dir, run)
  const note = (activity?: string) => {
    run.activity = activity
    changed(dir)
  }
  let agent: EpisodeAgent | null = null
  const check = () => {
    if (run.stopping) throw new Error('It was stopped. Try again when you’re ready.')
  }
  try {
    mkdirSync(join(dir, '.studio'), { recursive: true })
    writeFileSync(stateFile, JSON.stringify({ request })) // a failure from before is forgotten
    changed(dir)
    agent = await episodeAgent(dir, { onTool: note, onUsage: () => undefined, ...defaultAgentSelection(getSettings()) })
    run.agent = agent
    check()
    const a = agent
    writeEpisodeBible(dir)
    const turn = async (text: string, step: string) => {
      check()
      const r = await turnPastLimits((t) => a.turn(t, step), text, note, check)
      if (!r.ok) throw new Error(r.error ?? 'Claude stopped with an error')
      check()
    }
    const s = episode.series!
    await turn(
      lesson
        ? [
            `Make episode ${s.episode} of the series "${s.title}": ${episode.name}.`,
            request,
            'This is a new lesson added to the course. Follow series.md for the audience, notation and visual vocabulary. Build on the earlier lessons without repeating them.',
            'Write script.md (approve it yourself), then scene.py, render it and look at the frames.',
          ].join('\n\n')
        : [
            `A viewer watching episode ${s.episode} of the series "${s.title}" ("${episode.name}") asked for a follow-up video. They stopped ${momentNote(readTimeline(join(s.folder, readMeta(dir).extra!.of)), at)}.`,
            `They wrote: "${request}"`,
            'Make a short follow-up video, typically 2 to 4 minutes, that explains that part more thoroughly: recall in a sentence or two what they saw, then go slower, with the intermediate steps, why it works, and another example where it helps. Don’t repeat the rest of the episode.',
            'episode-script.md is the episode’s script, for what it showed and how; series.md is the series bible: use the same notation and visual vocabulary.',
            'Write script.md (approve it yourself), then scene.py, render it and look at the frames.',
          ].join('\n\n'),
      lesson ? 'Lesson' : 'Follow-up',
    )
    note('Checking the render')
    await checkAndFix(dir, (text) => turn(text, 'Fixing the render'), check)
    note('Exporting the video')
    const { job, finished } = queueExport(dir, { themes: [], languages: [], languageVideos: false })
    run.exportJob = job.id
    await finished
    check()
    running.delete(dir)
  } catch (e) {
    running.delete(dir)
    try {
      mkdirSync(join(dir, '.studio'), { recursive: true })
      writeFileSync(stateFile, JSON.stringify({ request, failed: (e as Error).message }))
    } catch {
      // the list says it didn't finish anyway
    }
  } finally {
    agent?.close()
    changed(dir)
  }
}
