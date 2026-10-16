// Watching a series (ADR 0028): its episodes' videos to study, and follow-up videos the viewer asks
// for while watching, explaining a part further. A follow-up is a project in the series folder's
// extras/, carrying meta.extra (which episode, where in it, what was asked); a background agent
// makes and exports it like a series episode, with the episode's script and the series bible.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { SCRIPT_FILE } from '../shared/script'
import { momentNote } from '../shared/moment'
import type { FollowUp, ProjectMeta, WatchDetail, WatchEpisode, WatchSeries } from '../shared/types'
import { episodeAgent, turnPastLimits, type EpisodeAgent } from './agent'
import { claudeStatus, claudeNotChosen } from './claude'
import { fakeAgents } from './agent-fake'
import { setupStatus } from './env'
import { queueExport } from './exports'
import { createProject, readMeta, readTimeline, updateMetaAt } from './projects'
import { checkAndFix } from './quick'
import { writeEpisodeBible } from './series'
import { titleFrom } from './title'
import { isWatched, writeWatched } from './watched'

let send: (series: WatchSeries) => void = () => {}
const running = new Map<string, { activity?: string }>() // follow-ups being made, by folder

export function setupWatch(sendSeries: typeof send): void {
  send = sendSeries
}

const savedFile = (dir: string) => join(dir, '.studio', 'follow-up.json')

/** The newest exported video in the project's exports/, not a dubbed one (<name>.<lang>.mp4). */
function exported(dir: string): string | undefined {
  const root = join(dir, 'exports')
  if (!existsSync(root)) return undefined
  const videos = readdirSync(root)
    .flatMap((sub) => (existsSync(join(root, sub)) && statSync(join(root, sub)).isDirectory() ? readdirSync(join(root, sub)).map((f) => join(root, sub, f)) : []))
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
    return { folder, title: meta.name, episodes: [{ dir: folder, number: 1, title: meta.name, video: exported(folder), watched: isWatched(folder), followUps: [] }] }
  }
  if (!existsSync(file)) throw new Error('That folder isn’t a series any more (its series.json is gone).')
  const { plan, episodes } = JSON.parse(readFileSync(file, 'utf8')) as { plan: { title: string }; episodes: string[] }
  const extras = join(folder, 'extras')
  const follow = existsSync(extras) ? readdirSync(extras).filter((n) => existsSync(join(extras, n, 'project.json'))) : []
  const list: WatchEpisode[] = episodes
    .filter((name) => existsSync(join(folder, name, 'project.json')))
    .map((name, i) => {
      const dir = join(folder, name)
      return {
        dir,
        number: readMeta(dir).series?.episode ?? i + 1,
        title: readMeta(dir).name,
        video: exported(dir),
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
  if (claudeNotChosen()) throw new Error('Follow-up videos are made by a Claude agent in the background. Choose Claude in Settings → Agent.')
  if (setupStatus().env !== 'ready') throw new Error('The manim environment isn’t installed yet (Settings → Environment).')
  if (!fakeAgents() && !(await claudeStatus()).loggedIn) throw new Error('Sign in to Claude first (Settings → Agent): it makes the video.')
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

const changed = (dir: string) => send(watchSeries(readMeta(dir).series?.folder ?? dir))

async function make(dir: string, episode: ProjectMeta, at: number, request: string): Promise<void> {
  const run: { activity?: string } = { activity: 'Starting' }
  running.set(dir, run)
  const note = (activity?: string) => {
    run.activity = activity
    changed(dir)
  }
  let agent: EpisodeAgent | null = null
  try {
    mkdirSync(join(dir, '.studio'), { recursive: true })
    writeFileSync(savedFile(dir), '{}') // a failure from before is forgotten
    changed(dir)
    agent = await episodeAgent(dir, { onTool: note, onUsage: () => undefined })
    const a = agent
    writeEpisodeBible(dir)
    const turn = async (text: string, step: string) => {
      const r = await turnPastLimits((t) => a.turn(t, step), text, note, () => undefined)
      if (!r.ok) throw new Error(r.error ?? 'Claude stopped with an error')
    }
    const s = episode.series!
    await turn(
      [
        `A viewer watching episode ${s.episode} of the series "${s.title}" ("${episode.name}") asked for a follow-up video. They stopped ${momentNote(readTimeline(join(s.folder, readMeta(dir).extra!.of)), at)}.`,
        `They wrote: "${request}"`,
        'Make a short follow-up video, typically 2 to 4 minutes, that explains that part more thoroughly: recall in a sentence or two what they saw, then go slower, with the intermediate steps, why it works, and another example where it helps. Don’t repeat the rest of the episode.',
        'episode-script.md is the episode’s script, for what it showed and how; series.md is the series bible: use the same notation and visual vocabulary.',
        'Write script.md (approve it yourself), then scene.py, render it and look at the frames.',
      ].join('\n\n'),
      'Follow-up',
    )
    note('Checking the render')
    await checkAndFix(dir, (text) => turn(text, 'Fixing the render'), () => undefined)
    note('Exporting the video')
    await queueExport(dir, { themes: [], languages: [], languageVideos: false }).finished
    running.delete(dir)
  } catch (e) {
    running.delete(dir)
    try {
      mkdirSync(join(dir, '.studio'), { recursive: true })
      writeFileSync(savedFile(dir), JSON.stringify({ failed: (e as Error).message }))
    } catch {
      // the list says it didn't finish anyway
    }
  } finally {
    agent?.close()
    changed(dir)
  }
}
