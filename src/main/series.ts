// Series mode: a batch of PDFs (a course's lectures) becomes a series of videos. Claude reads them
// and proposes the episodes and a series bible; the user edits and accepts the plan; Studio creates
// one project per episode in a series folder, and either makes them all in quick mode, one after
// another, or opens the first to make by hand. Each episode carries a copy of the bible, series.md,
// listing what the earlier episodes covered, so a video can refer back to them (ADR 0019).
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { SCRIPT_FILE } from '../shared/script'
import { TONES } from '../shared/tone'
import type { EpisodeRun, ExportOptions, ProjectMeta, SeriesPlan, SeriesPlanProgress, SeriesRef, SeriesRun, SeriesStart, Tone } from '../shared/types'
import { episodeAgent, turnPastLimits, type EpisodeAgent } from './agent'
import { askClaude, claudeStatus, codexChosen, languageName } from './claude'
import { cancelExport, queueExport } from './exports'
import { cancel } from './render'
import { createProject, readMeta } from './projects'
import { parsePlan, titlesSoFar } from '../shared/series-plan'
import { checkAndFix, ensureQuickReady, makeVideo, quickStopped } from './quick'
import { runRunner } from './runner'
import { getSettings, setSettings } from './settings'
import { slugify } from './slug'

/** Per PDF, at most this much text goes into the planning request. */
const MAX_TEXT = 40_000

/** Reads the PDFs and asks Claude for episodes and a bible. */
/** Reads the PDFs and asks the agent for episodes and a bible, reporting each step as it goes. */
export async function planSeries(
  req: { pdfs: string[]; title?: string; instructions?: string; language: string; tone: Tone },
  report: (p: SeriesPlanProgress) => void = () => {},
  signal?: AbortSignal,
): Promise<SeriesPlan> {
  if (!req.pdfs.length) throw new Error('Add the PDFs the series is made from.')
  if (!(await claudeStatus()).loggedIn) throw new Error('Sign in to your agent first (Settings → Agent): it reads the PDFs and plans the episodes.')
  const work = join(tmpdir(), 'manim-studio-series', randomUUID())
  try {
    const material: string[] = []
    const progress: SeriesPlanProgress = { stage: 'reading', total: req.pdfs.length, read: [], episodes: [], startedAt: Date.now() }
    for (const [i, pdf] of req.pdfs.entries()) {
      report({ ...progress, file: basename(pdf), index: i + 1 })
      const out = join(work, String(i))
      const { info } = await (await runRunner<{ info: { pages: number } }>('default', ['pdf-index', pdf, out], { signal })).done
      progress.read.push({ file: basename(pdf), pages: info.pages })
      const text = readFileSync(join(out, 'text.txt'), 'utf8')
      material.push(
        `=== FILE: ${basename(pdf)} (${info.pages} pages) ===\n${text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n[… the rest is cut here]` : text}`,
      )
    }
    const tone = TONES.find((t) => t.value === req.tone) ?? TONES[1]
    const prompt = [
      `Plan an educational video series from this course material, in ${languageName(req.language)}.${req.title ? ` The series is called "${req.title}".` : ''}`,
      `Its tone: ${tone.brief}`,
      'Episodes: usually one per file, in the given order. Split a file that holds several big ideas into several episodes; merge files too thin for a video of their own. Each episode has one central idea and fits a focused video (typically 3 to 10 minutes). Name the pages each episode uses.',
      ...(req.instructions?.trim()
        ? [
            `The user's own instructions for this series come before the guidance here: the episodes' depth and length, and what the bible says about the audience and the approach, follow them.\n---\n${req.instructions.trim()}\n---`,
          ]
        : []),
      'The bible (series.md, Markdown) has: who the series is for and what it assumes; the arc (how the episodes build on each other); the notation used throughout (follow the material); the visual vocabulary, saying which colour (palette names TEXT, MUTED, ACCENT, HIGHLIGHT, POSITIVE, NEGATIVE) and which shape always stands for what; recurring visual devices. Aim for the clarity and consistency of 3Blue1Brown’s series.',
      // Episodes before the bible: they stream first, so the user sees the plan take shape.
      'Answer with only JSON, in this order: {"title": string, "episodes": [{"title": string, "summary": string, "sources": [{"file": string, "pages": string}], "buildsOn": [1-based episode numbers]}], "bible": string}',
      '',
      ...material,
    ].join('\n')
    report({ ...progress, stage: 'planning' })
    const answer = await askClaude('You plan educational maths and engineering video series. You answer with JSON only.', prompt, 'plan the series', {
      signal,
      onText: (soFar) => report({ ...progress, stage: /"bible"\s*:/.test(soFar) ? 'bible' : 'planning', episodes: titlesSoFar(soFar) }),
    })
    const plan = parsePlan(
      answer,
      req.pdfs.map((p) => basename(p)),
      req.title,
    )
    return { ...plan, instructions: req.instructions?.trim() || undefined }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

const two = (n: number) => String(n).padStart(2, '0')

/** Creates the series folder and one project per episode; unattended, makes them all in quick mode. */
export async function startSeries(start: SeriesStart, openInWindow: (dir: string) => Promise<void>): Promise<void> {
  if (start.unattended) await ensureQuickReady()
  if (start.unattended && series?.state === 'working') throw new Error('A series is already being made. Wait for it, or stop it.')
  const { plan } = start
  const root = getSettings().projectsDir
  let folder = join(root, slugify(plan.title))
  for (let i = 2; existsSync(folder); i++) folder = join(root, `${slugify(plan.title)}-${i}`)
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'series.md'), bibleText(plan))

  const byName = new Map(start.pdfs.map((p) => [basename(p), p]))
  const dirs: string[] = []
  for (const [i, ep] of plan.episodes.entries()) {
    const series: SeriesRef = { title: plan.title, folder, episode: i + 1, of: plan.episodes.length, brief: episodeBrief(ep) }
    const dir = await createProject({
      name: ep.title,
      aspect: start.aspect,
      theme: start.theme,
      tone: start.tone,
      scriptFirst: true,
      language: start.language,
      voice: start.voice,
      series,
      parentDir: folder,
    })
    // Episode folders sort in order: 01-…, 02-…
    const ordered = join(folder, `${two(i + 1)}-${basename(dir)}`)
    if (!existsSync(ordered)) renameSync(dir, ordered)
    mkdirSync(join(ordered, 'sources'), { recursive: true })
    for (const s of ep.sources) {
      const from = byName.get(s.file)
      if (from) copyFileSync(from, join(ordered, 'sources', sourceName(s.file)))
    }
    dirs.push(ordered)
  }
  writeFileSync(join(folder, 'series.json'), JSON.stringify({ plan, episodes: dirs.map((d) => basename(d)) }, null, 2))
  setSettings({ recentProjects: [...dirs, ...getSettings().recentProjects.filter((p) => !dirs.includes(p))] })

  if (!start.unattended) {
    writeEpisodeBible(dirs[0])
    await openInWindow(dirs[0])
    return
  }
  if (!codexChosen()) return void runSeries(plan.title, folder, dirs, start.export)
  // Codex's tools work on the open project only, so with Codex the episodes are made one at a time, in the window.
  void (async () => {
    const episodes = plan.episodes.map((ep) => ({ title: ep.title, state: 'todo' as 'done' | 'failed' | 'now' | 'todo' }))
    for (const [i, dir] of dirs.entries()) {
      writeEpisodeBible(dir)
      const meta = readMeta(dir)
      episodes[i].state = 'now'
      const series = { title: plan.title, episode: i + 1, of: dirs.length, episodes: episodes.map((e) => ({ ...e })) }
      episodes[i].state = await makeVideo(dir, meta.name, { prompt: episodePrompt(meta), sources: [], export: start.export }, series).then(
        () => 'done' as const,
        () => 'failed' as const,
      )
      if (quickStopped()) break
    }
  })()
}

// --- making a series unattended, several episodes at once (ADR 0023) ---------------------------

let series: SeriesRun | null = null
let stopping = false
const agents = new Set<EpisodeAgent>()
let sendSeries: (run: SeriesRun | null) => void = () => {}

export function setupSeries(send: typeof sendSeries): void {
  sendSeries = send
}

export const seriesRun = (): SeriesRun | null => (series ? structuredClone(series) : null)

/** Stops the agents, the episodes not started yet and the exports still running. */
export function stopSeries(): void {
  if (series?.state !== 'working') return
  stopping = true
  for (const agent of agents) agent.close()
  for (const ep of series.episodes) {
    if (ep.state === 'export' && ep.exportJob) cancelExport(ep.exportJob)
    cancel('preview', ep.dir) // a render an agent asked for
  }
}

export function dismissSeries(): void {
  if (series?.state === 'working') return
  series = null
  sendSeries(null)
}

const update = (ep: EpisodeRun, patch: Partial<EpisodeRun>) => {
  Object.assign(ep, patch)
  sendSeries(seriesRun())
}

function check(): void {
  if (stopping) throw new Error('Stopped')
}

/**
 * First the scripts, one after another: each episode's series.md says what the ones before it
 * actually cover, from their scripts. Then the videos, `seriesAgents` at a time, each queued for
 * export as soon as it passes Studio's check.
 */
async function runSeries(title: string, folder: string, dirs: string[], exportOptions: ExportOptions): Promise<void> {
  stopping = false
  series = {
    title,
    folder,
    agents: Math.max(1, getSettings().seriesAgents || 3),
    state: 'working',
    episodes: dirs.map((dir) => ({ dir, title: readMeta(dir).name, state: 'waiting', warnings: [] })),
  }
  sendSeries(seriesRun())
  const run = series

  // One agent writes the scripts in order; the others make each video as soon as its script is ready.
  // Together they never exceed `agents`: while scripts are still being written, the writer holds one.
  const ready: EpisodeRun[] = []
  const exports: Promise<unknown>[] = []
  let scripting = true

  const writeScripts = async () => {
    for (const ep of run.episodes) {
      if (stopping) break
      await episodeStep(ep, 'script', async (turn) => {
        await turn(
          `${episodePrompt(readMeta(ep.dir))}\n\nFor now, only the script: write script.md, review it and approve it, then stop. Don’t write scene.py yet: you’ll make the video in the next step.`,
        )
        update(ep, { state: 'scripted', activity: undefined })
        ready.push(ep)
      })
    }
    scripting = false
  }

  const makeVideo = async (ep: EpisodeRun) => {
    await episodeStep(ep, 'scene', async (turn) => {
      await turn(
        'Your script.md is approved, and series.md lists the episodes with what the ones scripted so far cover. Make this episode’s video from your script: write scene.py, render it and look at the frames.',
      )
      update(ep, { state: 'check', activity: 'Checking the render' })
      update(ep, { warnings: await checkAndFix(ep.dir, turn, check) })
    })
    if (ep.state !== 'check') return
    const { job, finished } = queueExport(ep.dir, exportOptions)
    update(ep, { state: 'export', activity: undefined, exportJob: job.id })
    exports.push(
      finished.then(
        () => update(ep, { state: 'done' }),
        (e: Error) => update(ep, stopping ? { state: 'stopped' } : { state: 'failed', error: e.message }),
      ),
    )
  }

  const makeVideos = async () => {
    const making = new Set<Promise<void>>()
    while (!stopping && (scripting || ready.length || making.size)) {
      const slots = scripting ? run.agents - 1 : run.agents
      if (ready.length && making.size < slots) {
        const video = makeVideo(ready.shift()!).finally(() => making.delete(video))
        making.add(video)
        continue
      }
      await new Promise((r) => setTimeout(r, 500)) // ponytail: polls; a wake-up signal would save nothing you'd notice
    }
    await Promise.all(making)
  }

  await Promise.all([writeScripts(), makeVideos()])
  await Promise.all(exports)
  for (const ep of run.episodes) if (ep.state === 'waiting' || ep.state === 'scripted') ep.state = 'stopped'
  run.state = stopping ? 'stopped' : 'done'
  sendSeries(seriesRun())
}

/** One agent session on an episode: `work` gets its turn (past usage limits); a failure marks the episode. */
async function episodeStep(ep: EpisodeRun, state: EpisodeRun['state'], work: (turn: (text: string) => Promise<void>) => Promise<void>): Promise<void> {
  update(ep, { state, activity: 'Starting' })
  let agent: EpisodeAgent | null = null
  try {
    writeEpisodeBible(ep.dir)
    agent = await episodeAgent(ep.dir, (summary) => update(ep, { activity: summary }))
    agents.add(agent)
    const a = agent
    await work(async (text) => {
      check()
      const result = await turnPastLimits(a.turn, text, (note) => update(ep, { activity: note }), check)
      check()
      if (!result.ok) throw new Error(result.error ?? 'Claude stopped with an error')
    })
  } catch (e) {
    update(ep, stopping ? { state: 'stopped', activity: undefined } : { state: 'failed', error: (e as Error).message, activity: undefined })
  } finally {
    if (agent) {
      agents.delete(agent)
      agent.close()
    }
  }
}

/** The name importSources would give a PDF: "Lecture 1.PDF" → lecture-1.pdf. */
const sourceName = (file: string) => `${slugify(basename(file, extname(file))) || 'source'}.pdf`

function episodeBrief(ep: SeriesPlan['episodes'][number]): string {
  const sources = ep.sources.map((s) => `sources/${sourceName(s.file)}${s.pages ? ` pages ${s.pages}` : ''}`)
  return [
    ep.summary,
    sources.length ? `Its material: ${sources.join('; ')}.` : '',
    ep.buildsOn?.length ? `It builds on episode ${ep.buildsOn.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

/** What Claude is asked to make, for one episode in quick mode. */
function episodePrompt(meta: ProjectMeta): string {
  const s = meta.series!
  return `Make episode ${s.episode} of ${s.of} of the series "${s.title}": ${meta.name}.\n${s.brief}\nFollow the material, and series.md as the guide says.`
}

/** What Claude is told about an episode in every turn (the chat's brief and Claude Desktop's guide). */
export function seriesBrief(meta: ProjectMeta): string {
  const s = meta.series
  if (!s) return ''
  return [
    `This video is episode ${s.episode} of ${s.of} of the series "${s.title}". ${s.brief}`,
    'series.md in this project is the series bible, with what each episode covers: follow its notation and visual vocabulary exactly, assume what the earlier episodes taught, refer back to them where it helps ("in episode 2 we saw…") instead of explaining again, and leave later episodes’ topics to them.',
    'When series.md has a "What the user asked for" section, that is how the user wants the whole series made: it comes before the usual guidance (how deep to go, how long, the style).',
  ].join('\n')
}

/** The series folder's series.md: the title, the user's own instructions when there are some, then the bible. */
function bibleText(plan: SeriesPlan): string {
  const asked = plan.instructions?.trim() ? `## What the user asked for\n\n${plan.instructions.trim()}\n\n` : ''
  return `# ${plan.title}\n\n${asked}${plan.bible}\n`
}

/**
 * series.md for one episode: the bible, then the episodes, with what the finished ones actually
 * cover (their script's idea and sections). Written when the episode is started or opened.
 */
export function writeEpisodeBible(dir: string): void {
  const meta = readMeta(dir)
  const s = meta.series
  if (!s || !existsSync(join(s.folder, 'series.json'))) return
  const { plan, episodes } = JSON.parse(readFileSync(join(s.folder, 'series.json'), 'utf8')) as { plan: SeriesPlan; episodes: string[] }
  const bible = existsSync(join(s.folder, 'series.md')) ? readFileSync(join(s.folder, 'series.md'), 'utf8') : bibleText(plan)
  const list = plan.episodes.map((ep, i) => {
    const here = i + 1 === s.episode
    const script = join(s.folder, episodes[i] ?? '', SCRIPT_FILE)
    const made = !here && existsSync(script) ? summarizeScript(readFileSync(script, 'utf8')) : ''
    return `${i + 1}. **${ep.title}**${here ? ' (this episode)' : ''}: ${ep.summary}${made ? `\n   ${made}` : ''}`
  })
  writeFileSync(join(dir, 'series.md'), `${bible.trimEnd()}\n\n## Episodes\n\n${list.join('\n')}\n`)
}

/** "The idea: …; sections: Intro, Formula, …" from an episode's script. */
function summarizeScript(text: string): string {
  const idea = text.match(/\*\*The idea:\*\*\s*(.+)/)?.[1]?.trim()
  const sections = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim())
  return [idea ? `As made: ${idea}` : '', sections.length ? `Sections: ${sections.join(', ')}.` : ''].filter(Boolean).join(' ')
}
