// Series mode: a batch of PDFs (a course's lectures) becomes a series of videos. Claude reads them
// and proposes the episodes and a series bible; the user edits and accepts the plan; Studio creates
// one project per episode in a series folder, and either makes them all in quick mode, one after
// another, or opens the first to make by hand. Each episode carries a copy of the bible, series.md,
// listing what the earlier episodes covered, so a video can refer back to them (ADR 0019).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { SCRIPT_FILE, scriptStatus } from '../shared/script'
import { TONES } from '../shared/tone'
import { seriesAgentSelection, seriesSelection, switchSeriesSelection } from '../shared/agent-selection'
import type {
  AgentRoute,
  EpisodeRun,
  ExportOptions,
  ProjectMeta,
  SeriesPlan,
  SeriesPlanProgress,
  SeriesRef,
  SeriesRun,
  SeriesStart,
  Tone,
} from '../shared/types'
import { configuredAuth, episodeAgent, sameRoute, turnPastLimits, type EpisodeAgent } from './agent'
import { askClaude, chatModels, claudeStatus, languageName } from './claude'
import { fakeAgents, fakeSeriesPlan } from './agent-fake'
import { beginEpisodeMetrics, episodeMetricsPhase, episodeMetricsSelection, finishEpisodeMetrics } from './episode-metrics'
import { cancelExport, completedExport, pauseExport, queueExport } from './exports'
import { cancel } from './render'
import { createProject, readMeta, readScript, updateMetaAt } from './projects'
import { parsePlan, titlesSoFar } from '../shared/series-plan'
import { checkAndFix, ensureQuickReady } from './quick'
import { runRunner } from './runner'
import { getSettings, setSettings } from './settings'
import { slugify } from './slug'
import { appendUsage, readUsage } from './usage'
import { costOf, type UsageEntry } from '../shared/usage'
import { isSeriesCheckpoint, recoverSeries } from '../shared/series-recovery'
import { readAtomicJson, writeAtomicJson } from './atomic-json'
import { protectWork, shutdownRequested } from './work-lifecycle'
import { saveSeriesDraft } from './series-draft'
import { paths } from './paths'

/** Per PDF, at most this much text goes into the planning request. */
const MAX_TEXT = 40_000

/** Reads the PDFs and asks Claude for episodes and a bible. */
/** Reads the PDFs and asks the agent for episodes and a bible, reporting each step as it goes. */
export async function planSeries(
  req: { pdfs: string[]; topic?: string; instructions?: string; language: string; tone: Tone },
  report: (p: SeriesPlanProgress) => void = () => {},
  signal?: AbortSignal,
): Promise<SeriesPlan> {
  const topic = req.topic?.trim()
  if (!req.pdfs.length && !topic) throw new Error('Add the PDFs the series is made from, or say what you want to learn.')
  if (fakeAgents()) return fakeSeriesPlan(req, report, signal)
  if (!(await claudeStatus()).loggedIn) throw new Error('Sign in to your agent first (Settings → Accounts): it reads the PDFs and plans the episodes.')
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
      ...(req.pdfs.length
        ? [
            `Plan an educational video series from this course material, in ${languageName(req.language)}.`,
            `Its tone: ${tone.brief}`,
            'Episodes: usually one per file, in the given order. Split a file that holds several big ideas into several episodes; merge files too thin for a video of their own. Each episode has one central idea and fits a focused video (typically 3 to 10 minutes). Name the pages each episode uses.',
          ]
        : [
            `Plan an educational video series, in ${languageName(req.language)}, that teaches what the user asks for here:\n---\n${topic}\n---`,
            `Its tone: ${tone.brief}`,
            'There is no course material: choose the curriculum yourself, in a sensible teaching order, starting from what the request implies the viewer already knows. Each episode has one central idea and fits a focused video (typically 3 to 10 minutes). Leave "sources" empty.',
          ]),
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
    let usage: UsageEntry | undefined
    const planner = seriesSelection(getSettings(), 'plan')
    const answer = await askClaude('You plan educational maths and engineering video series. You answer with JSON only.', prompt, 'plan the series', {
      signal,
      model: planner.model,
      effort: planner.effort,
      onUsage: (e) => (usage = { ...e, step: 'Planning the series' }),
      onText: (soFar) => report({ ...progress, stage: /"bible"\s*:/.test(soFar) ? 'bible' : 'planning', episodes: titlesSoFar(soFar) }),
    })
    const plan = parsePlan(
      answer,
      req.pdfs.map((p) => basename(p)),
    )
    return { ...plan, instructions: req.instructions?.trim() || undefined, usage }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

const two = (n: number) => String(n).padStart(2, '0')

/**
 * The running series carries on with another agent or sign-in (ADR 0048): new steps use it, and
 * episodes waiting on a usage limit start again with it at once, including comparison episodes.
 */
export function switchSeriesAgent(to: AgentRoute): void {
  if (!series || series.state === 'done') throw new Error('No series is being made.')
  const maker = seriesSelection(getSettings(), 'make', to.agent)
  switchSeriesSelection(series, to, maker)
  save()
}

/** Renames a series everywhere it's shown: each episode's project.json, series.json and a run on Home. Folders keep their names. */
export function renameSeries(folder: string, title: string): void {
  const name = title.trim()
  if (!name) throw new Error('Give the series a title.')
  for (const entry of readdirSync(folder)) {
    const dir = join(folder, entry)
    if (!existsSync(join(dir, 'project.json'))) continue
    const meta = readMeta(dir)
    if (meta.series) updateMetaAt(dir, { series: { ...meta.series, title: name } })
  }
  const file = join(folder, 'series.json')
  if (existsSync(file)) {
    const saved = JSON.parse(readFileSync(file, 'utf8'))
    saved.plan.title = name
    writeFileSync(file, JSON.stringify(saved, null, 2))
  }
  if (series?.folder === folder) {
    series.title = name
    save()
  }
}

/** Creates the series folder and one project per episode; unattended, makes them all in quick mode. */
export async function startSeries(start: SeriesStart, openInWindow: (dir: string) => Promise<void>): Promise<void> {
  if (creating) throw new Error('A series is already being created.')
  creating = true
  try {
    const pending = pendingCreation()
    const retry = pending && JSON.stringify(pending.start.plan) === JSON.stringify(start.plan) ? pending.folder : undefined
    await protectWork(() => createSeries(start, openInWindow, retry))
  } finally {
    creating = false
  }
}

let creating = false
const creationFile = () => join(paths.userData(), 'series-creation.json')
interface SeriesCreation { start: SeriesStart; folder: string }
const pendingCreation = () => readAtomicJson(creationFile(), (value): value is SeriesCreation => {
  const item = value as SeriesCreation | null
  return !!item?.start?.plan && Array.isArray(item.start.plan.episodes) && typeof item.folder === 'string'
})

async function createSeries(start: SeriesStart, openInWindow: (dir: string) => Promise<void>, recovering?: string): Promise<void> {
  if (!start.plan.episodes.length) throw new Error('The series needs at least one episode.')
  if (!recovering) {
    if (start.unattended) await ensureQuickReady(start.plan.episodes[0]?.assignment?.agent)
    if (start.unattended && series && series.state !== 'done')
      throw new Error('Another series is still on Home. Let it finish, or stop and dismiss it there, before starting a new one.')
    const { plan } = start
    const settings = getSettings()
    const assignments = plan.episodes.flatMap((ep) => (ep.assignment ? [ep.assignment] : []))
    if (assignments.length) {
      const learning = settings.mode === 'learn' || (settings.mode === 'both' && settings.homeTab === 'learn')
      if (!settings.developerMode || !settings.developerEpisodeModels || !learning || !start.unattended)
        throw new Error('Enable episode model comparison in Settings → Develop and start the series in Learn.')
      if (assignments.length !== plan.episodes.length) throw new Error('Choose an agent and model for every episode.')
      for (const agent of new Set(assignments.map((a) => a.agent))) {
        if (!['claude', 'codex', 'antigravity'].includes(agent)) throw new Error('Unknown episode agent.')
        if (fakeAgents()) continue
        if (!(await claudeStatus(agent)).loggedIn) throw new Error(`Connect ${agent} in Settings → Accounts before starting this series.`)
        const models = await chatModels(agent)
        for (const assignment of assignments.filter((a) => a.agent === agent)) {
          const model = models.find((m) => m.value === assignment.model && m.value)
          if (!model || (assignment.effort && !model.efforts.includes(assignment.effort)))
            throw new Error(`The selected model or effort is no longer offered by ${agent}. Review the episode assignments.`)
        }
      }
    }
  }
  const { plan } = start
  const root = getSettings().projectsDir
  const pending = pendingCreation()
  if (!recovering && pending) throw new Error('Reopen the app to recover the series that was being created.')
  let folder = recovering ?? join(root, slugify(plan.title))
  if (!recovering) for (let i = 2; existsSync(folder); i++) folder = join(root, `${slugify(plan.title)}-${i}`)
  writeAtomicJson(creationFile(), { start, folder })
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'series.md'), bibleText(plan))

  const byName = new Map(start.pdfs.map((p) => [basename(p), p]))
  const dirs: string[] = []
  for (const [i, ep] of plan.episodes.entries()) {
    const series: SeriesRef = { title: plan.title, folder, episode: i + 1, of: plan.episodes.length, brief: episodeBrief(ep) }
    const ordered = join(folder, `${two(i + 1)}-${slugify(ep.title)}`)
    const staging = join(folder, '.studio', `creating-${i + 1}`)
    if (existsSync(join(ordered, 'project.json')) && (readMeta(ordered).series?.folder !== folder || readMeta(ordered).series?.episode !== i + 1))
      throw new Error('An episode folder belongs to another video. Move it before continuing.')
    if (!existsSync(join(ordered, 'project.json'))) {
      // Only this transaction's disposable staging folder is removed after an interruption.
      rmSync(staging, { recursive: true, force: true })
      mkdirSync(join(folder, '.studio'), { recursive: true })
      await createProject({
        name: ep.title,
        aspect: start.aspect,
        theme: start.theme,
        tone: start.tone,
        language: start.language,
        voice: start.voice,
        series,
        parentDir: folder,
      }, staging)
      renameSync(staging, ordered)
    }
    mkdirSync(join(ordered, 'sources'), { recursive: true })
    for (const s of ep.sources) {
      const from = byName.get(s.file)
      if (from) copyFileSync(from, join(ordered, 'sources', sourceName(s.file)))
    }
    dirs.push(ordered)
  }
  writeAtomicJson(join(folder, 'series.json'), { plan, episodes: dirs.map((d) => basename(d)) })
  setSettings({ recentProjects: [...dirs, ...getSettings().recentProjects.filter((p) => !dirs.includes(p))] })

  if (!start.unattended) {
    writeEpisodeBible(dirs[0])
    if (!recovering) await openInWindow(dirs[0])
    clearCreation()
    return
  }
  if (plan.usage && !readUsage(folder).some((entry) => entry.at === plan.usage!.at && entry.step === plan.usage!.step)) appendUsage(folder, plan.usage)
  startRun(plan.title, folder, dirs, start, plan.usage && costOf(plan.usage.models), !!recovering)
  clearCreation()
}

function clearCreation(): void {
  writeAtomicJson(creationFile(), null)
  writeAtomicJson(creationFile(), null)
  saveSeriesDraft(null)
}

// --- making a series unattended, several episodes at once (ADR 0023) ---------------------------
//
// A loop hands out the work from each episode's state: one agent writes the scripts in order, the
// others make each video as soon as its script is ready, and each finished video is exported. So
// pausing (the series or one episode), stopping and continuing later are only states: the loop
// skips what's held, and Continue starts it again on the saved run, also after a restart.

let series: SeriesRun | null = null
let exportOptions: ExportOptions = { themes: [], languages: [], languageVideos: false }
const agents = new Map<string, EpisodeAgent>() // by episode folder
const steps = new Map<string, 'script' | 'video'>() // episodes whose agent step is running
const exporting = new Set<string>()
const reporting = new Map<string, Promise<void>>()
const tasks = new Set<Promise<void>>()
const generations = new Map<string, number>()
let driving: Promise<void> | null = null
let continuing = false
let sendSeries: (run: SeriesRun | null) => void = () => {}

const runFile = (folder: string) => join(folder, '.studio', 'series-run.json')

/** Loads the series Home last showed: a run the app was making when it quit can continue. */
export async function setupSeries(send: typeof sendSeries): Promise<void> {
  sendSeries = send
  const creation = pendingCreation()
  const folder = creation && readAtomicJson(runFile(creation.folder), isSeriesCheckpoint) ? creation.folder : getSettings().seriesRun
  const saved = folder && readAtomicJson(runFile(folder), isSeriesCheckpoint)
  if (folder && !saved && existsSync(runFile(folder)) && !creation)
    throw new Error(`The series checkpoint and its backup could not be read. The episode projects are still in ${folder}.`)
  if (saved) {
    series = recoveredRun(saved.run)
    exportOptions = saved.exportOptions
    save()
    if (creation?.folder === folder) setSettings({ seriesRun: folder })
  }
  if (creation) {
    if (series?.folder === creation.folder) clearCreation() // run committed before the last journal cleanup
    else {
      try {
        await protectWork(() => createSeries(creation.start, async () => {}, creation.folder))
      } catch (error) {
        console.error('[series recovery]', error)
        saveSeriesDraft({ request: { pdfs: creation.start.pdfs, instructions: creation.start.plan.instructions, language: creation.start.language, tone: creation.start.tone }, plan: creation.start.plan })
        throw error
      }
    }
  }
}

export const seriesRun = (): SeriesRun | null => (series ? structuredClone(series) : null)

/** A course owns its production history after Home's active run is dismissed or replaced. */
export function seriesRunFor(folder: string): SeriesRun | null {
  if (series?.folder === folder) return seriesRun()
  const saved = readAtomicJson(runFile(folder), isSeriesCheckpoint)
  return saved ? recoveredRun(saved.run) : null
}

function recoveredRun(saved: SeriesRun): SeriesRun {
  const run = recoverSeries(saved)
  for (const ep of run.episodes) {
    if (ep.state === 'script' && scriptStatus(readScript(ep.dir) ?? '') === 'approved') {
      ep.state = 'scripted'
      ep.tried = false
    }
    if (ep.state === 'export' && ep.exportJob && completedExport(ep.dir, ep.exportJob)) ep.state = 'done'
  }
  if (run.episodes.every((ep) => ep.state === 'done' || ep.state === 'failed')) run.state = 'done'
  return run
}

/** Saves the run in its folder (for Continue after a restart) and tells the window. */
function save(): void {
  if (!series) return
  mkdirSync(join(series.folder, '.studio'), { recursive: true })
  writeAtomicJson(runFile(series.folder), { run: series, exportOptions })
  sendSeries(seriesRun())
}

const update = (ep: EpisodeRun, patch: Partial<EpisodeRun>) => {
  if (!series?.episodes.includes(ep)) return // a dismissed run's late callback cannot touch its replacement
  if (patch.state) {
    const phase = (
      { script: 'Script', scripted: 'Waiting for video', scene: 'Implementation', check: 'Render check', export: 'Export' } as Record<string, string>
    )[patch.state]
    if (phase) episodeMetricsPhase(ep.dir, phase)
  }
  Object.assign(ep, patch)
  save()
}

const halted = (ep: EpisodeRun) => series?.state !== 'working' || !!ep.held

/** Stops an episode's agent and its render; its state stays, so it carries on from there later. */
function halt(ep: EpisodeRun): void {
  generations.set(ep.dir, (generations.get(ep.dir) ?? 0) + 1)
  agents.get(ep.dir)?.close()
  cancel('preview', ep.dir)
}

export function pauseSeries(paused: boolean): void {
  if (!series || (paused ? series.state !== 'working' : series.state !== 'paused')) return
  series.state = paused ? 'paused' : 'working'
  if (paused) series.episodes.forEach(halt)
  for (const ep of series.episodes) if (ep.exportJob) pauseExport(ep.exportJob, paused || !!ep.held)
  if (paused) series.episodes.filter((ep) => ep.state !== 'export').forEach((ep) => episodeMetricsPhase(ep.dir, 'Paused'))
  save()
  if (!paused) void drive()
}

export function pauseEpisode(dir: string, paused: boolean): void {
  const ep = series?.episodes.find((e) => e.dir === dir)
  if (!ep) return
  update(ep, { held: paused })
  if (paused && ep.state !== 'export') episodeMetricsPhase(ep.dir, 'Paused')
  if (paused) halt(ep)
  if (ep.exportJob) pauseExport(ep.exportJob, paused || series?.state === 'paused')
  if (!paused) void drive()
}

/** Stops the agents and the exports; Continue picks the run up again. */
export function stopSeries(): void {
  if (!series || series.state === 'stopped' || series.state === 'done') return
  series.state = 'stopped'
  for (const ep of series.episodes) {
    halt(ep)
    if (ep.exportJob && exporting.has(ep.dir)) cancelExport(ep.exportJob)
    if (ep.state !== 'done' && ep.state !== 'failed') void finishMetrics(ep, series, 'stopped')
  }
  save()
}

/** Carries on with a stopped run: what didn't finish, including what failed, gets another go. */
function adoptSeries(folder?: string): void {
  if (folder && folder !== series?.folder) {
    if (series && series.state !== 'done') throw new Error('Another series is still being made. Stop and dismiss it before continuing this one.')
    const saved = readAtomicJson(runFile(folder), isSeriesCheckpoint)
    if (!saved) throw new Error('The series checkpoint could not be read.')
    series = recoveredRun(saved.run)
    exportOptions = saved.exportOptions
    setSettings({ seriesRun: folder })
    save()
  }
}

function retryState(ep: EpisodeRun): void {
  const approved = scriptStatus(readScript(ep.dir) ?? '') === 'approved'
  ep.state = ep.failedAt === 'export' ? 'export' : ep.failedAt === 'check' ? 'check' : approved ? 'scripted' : 'waiting'
  ep.error = undefined
  ep.failedAt = undefined
}

/** Retry one failed lesson without restarting completed lessons or other agents. */
export async function retrySeriesEpisode(dir: string): Promise<void> {
  if (shutdownRequested()) return
  const folder = readMeta(dir).series?.folder
  if (!folder) throw new Error('That video does not belong to a series.')
  adoptSeries(folder)
  const run = series
  const ep = run?.episodes.find((episode) => episode.dir === dir)
  if (!run || !ep || ep.state !== 'failed') return
  await ensureQuickReady(seriesAgentSelection(run, ep, seriesSelection(getSettings(), 'make')).agent)
  if (series !== run || ep.state !== 'failed' || shutdownRequested()) return
  retryState(ep)
  ep.held = false
  if (run.state === 'done' || run.state === 'stopped') run.state = 'working'
  save()
  void drive()
}

export async function continueSeries(folder?: string): Promise<void> {
  if (continuing || shutdownRequested()) return
  adoptSeries(folder)
  if (series?.state === 'done' && series.episodes.some((ep) => ep.state === 'failed')) series.state = 'stopped'
  if (series?.state !== 'stopped') return
  continuing = true
  try {
    await settleSeries()
    if (series?.state !== 'stopped' || shutdownRequested()) return
    for (const agent of new Set(
      series.episodes.filter((ep) => ep.state !== 'done').map((ep) => seriesAgentSelection(series!, ep, seriesSelection(getSettings(), 'make')).agent),
    ))
      await ensureQuickReady(agent)
    for (const ep of series.episodes) {
      if (ep.state !== 'failed' && ep.state !== 'stopped') continue
      retryState(ep)
    }
    series.state = 'working'
    save()
    void drive()
  } finally { continuing = false }
}

/** All agent turns, cancelled exports and report writes have settled before the process exits. */
export async function settleSeries(): Promise<void> {
  while (tasks.size || reporting.size) await Promise.allSettled([...tasks, ...reporting.values()])
}

export function dismissSeries(): void {
  if (!series || series.state === 'working') return
  series.episodes.forEach(halt)
  series = null
  setSettings({ seriesRun: undefined })
  sendSeries(null)
}

function startRun(title: string, folder: string, dirs: string[], start: SeriesStart, planningCostUSD?: number, recovered = false): void {
  const selection = seriesSelection(getSettings(), 'make')
  const settings = getSettings()
  const flags = { usage: !!settings.developerUsageMetrics, timing: !!settings.developerTimingMetrics, resources: !!settings.developerResourceMetrics }
  const metrics = settings.developerMode && Object.values(flags).some(Boolean) ? flags : undefined
  exportOptions = start.export
  series = {
    title,
    folder,
    agents: metrics ? 1 : Math.max(1, getSettings().seriesAgents || 3),
    metrics,
    agent: selection.agent,
    model: selection.model,
    effort: selection.effort,
    auth: configuredAuth(selection.agent),
    state: recovered || shutdownRequested() ? 'stopped' : 'working',
    episodes: dirs.map((dir, i) => ({ dir, title: readMeta(dir).name, assignment: start.plan.episodes[i].assignment, state: 'waiting', warnings: [] })),
    planningCostUSD,
  }
  save()
  setSettings({ seriesRun: folder })
  if (series.state === 'working') void drive()
}

/** Hands out the work while the series is being made: scripts in order, videos and exports as they're ready. */
function drive(): Promise<void> {
  if (driving) return driving
  driving = driveLoop().catch((error) => {
    console.error('[series scheduler]', error)
    stopSeries()
  }).finally(() => {
    driving = null
    if (series?.state === 'working') void drive()
  })
  return driving
}

async function driveLoop(): Promise<void> {
  const run = series
  while (run && series === run && run.state === 'working') {
    if (run.metrics) {
      const episode = run.episodes.find((ep) => ep.state !== 'done' && ep.state !== 'failed')
      if (!episode && !steps.size && !exporting.size && !reporting.size) {
        run.state = 'done'
        save()
        return
      }
      if (episode && !episode.held && !steps.size && !exporting.size && !reporting.size) {
        if (episode.state === 'waiting' || episode.state === 'script') launch(episode, 'script')
        else if (['scripted', 'scene', 'check'].includes(episode.state)) launch(episode, 'video')
        else if (episode.state === 'export') exportEpisode(episode, run)
      }
      await new Promise((r) => setTimeout(r, 500))
      continue
    }
    for (const ep of run.episodes) if (ep.state === 'export' && !ep.held && !exporting.has(ep.dir)) exportEpisode(ep, run)

    // A paused episode's script waits; the writer goes on with the next one.
    const nextScript = run.episodes.find((ep) => (ep.state === 'waiting' || ep.state === 'script') && !ep.held && !steps.has(ep.dir))
    if (nextScript && ![...steps.values()].includes('script')) {
      launch(nextScript, 'script')
      continue
    }
    // While scripts are still to be written, the writer keeps one of the agents.
    const slots = nextScript ? run.agents - 1 : run.agents
    const videos = [...steps.values()].filter((k) => k === 'video').length
    const nextVideo = run.episodes.find((ep) => ['scripted', 'scene', 'check'].includes(ep.state) && !ep.held && !steps.has(ep.dir))
    if (nextVideo && videos < slots) {
      launch(nextVideo, 'video')
      continue
    }
    if (run.episodes.every((ep) => ep.state === 'done' || ep.state === 'failed') && !steps.size && !exporting.size) {
      run.state = 'done'
      save()
      return
    }
    await new Promise((r) => setTimeout(r, 500)) // ponytail: polls; a wake-up signal would save nothing you'd notice
  }
}

function launch(ep: EpisodeRun, kind: 'script' | 'video'): void {
  steps.set(ep.dir, kind)
  const step = kind === 'script' ? writeScript(ep) : episodeVideo(ep)
  track(step.finally(() => steps.delete(ep.dir)))
}

function track(task: Promise<void>): void {
  tasks.add(task)
  void task.catch((error) => console.error('[series task]', error)).finally(() => tasks.delete(task))
}

async function writeScript(ep: EpisodeRun): Promise<void> {
  await episodeStep(ep, 'script', async (turn) => {
    await turn(
      `${episodePrompt(readMeta(ep.dir))}\n\nFor now, only the script: write script.md, review it and approve it, then stop. Don’t write scene.py yet: you’ll make the video in the next step.`,
      'Script',
    )
    update(ep, { state: 'scripted', activity: undefined, tried: false })
  })
}

async function episodeVideo(ep: EpisodeRun): Promise<void> {
  const checking = ep.state === 'check'
  await episodeStep(ep, checking ? 'check' : 'scene', async (turn, check) => {
    if (!checking) {
      await turn(
        'Your script.md is approved, and series.md lists the episodes with what the ones scripted so far cover. Make this episode’s video from your script: write scene.py, render it and look at the frames.',
        'Video',
      )
    }
    check()
    update(ep, { state: 'check', activity: 'Checking the render' })
    const warnings = await checkAndFix(
      ep.dir,
      (text) => turn(text, 'Fixing the render'),
      check,
    )
    check()
    update(ep, { warnings, state: 'export', activity: undefined, tried: false })
  })
}

function exportEpisode(ep: EpisodeRun, run: SeriesRun): void {
  exporting.add(ep.dir)
  track((async () => {
    try {
      await beginEpisodeMetrics(ep.dir, seriesAgentSelection(run, ep, seriesSelection(getSettings(), 'make')), run.metrics)
      stopIf(ep)
      episodeMetricsPhase(ep.dir, 'Export')
      const { job, finished } = queueExport(ep.dir, exportOptions)
      update(ep, { exportJob: job.id })
      await finished
      await finishMetrics(ep, run, 'done')
      update(ep, { state: 'done' })
    } catch (e) {
      if (run.state === 'working') {
        await finishMetrics(ep, run, 'failed')
        update(ep, { state: 'failed', failedAt: 'export', error: (e as Error).message })
      }
    } finally {
      exporting.delete(ep.dir)
    }
  })())
}

function stopIf(ep: EpisodeRun): void {
  if (halted(ep)) throw new Error('Stopped')
}

/**
 * One agent session on an episode: `work` gets its turn (past usage limits). An episode that was
 * interrupted in this step before carries on from where it stopped; a pause leaves its state as it
 * is, and a failure marks it.
 */
async function episodeStep(
  ep: EpisodeRun,
  state: EpisodeRun['state'],
  work: (turn: (text: string, step: string) => Promise<void>, check: () => void) => Promise<void>,
): Promise<void> {
  const run = series!
  const generation = generations.get(ep.dir) ?? 0
  const interrupted = () => series !== run || halted(ep) || (generations.get(ep.dir) ?? 0) !== generation
  const check = () => { if (interrupted()) throw new Error('Stopped') }
  let again = !!ep.tried
  let agent: EpisodeAgent | null = null
  // The agent and sign-in this episode runs on: the series' (switchable at a limit), or its fixed assignment.
  const route = (): AgentRoute => {
    const selection = seriesAgentSelection(run, ep, seriesSelection(getSettings(), 'make'))
    return { agent: selection.agent, auth: ep.assignment ? ep.assignmentAuth ?? configuredAuth(selection.agent) : (run.auth ?? configuredAuth(selection.agent)) }
  }
  const open = async () => {
    const opened = route()
    episodeMetricsSelection(ep.dir, seriesAgentSelection(run, ep, seriesSelection(getSettings(), 'make')))
    const a = await episodeAgent(ep.dir, {
      onTool: (summary) => { if (!interrupted()) update(ep, { activity: summary }) },
      onUsage: (e) => update(ep, { costUSD: (ep.costUSD ?? 0) + costOf(e.models) }),
      ...seriesAgentSelection(run, ep, seriesSelection(getSettings(), 'make')),
      auth: opened.auth,
      allowFallback: !ep.assignment,
      strictModel: !!ep.assignment,
    })
    agents.set(ep.dir, a)
    return { a, opened }
  }
  try {
    await beginEpisodeMetrics(ep.dir, seriesAgentSelection(run, ep, seriesSelection(getSettings(), 'make')), run.metrics)
    check()
    update(ep, { state, activity: 'Starting', tried: true })
    writeEpisodeBible(ep.dir)
    let current = await open()
    agent = current.a
    check()
    await work(async (text, step) => {
      episodeMetricsPhase(ep.dir, step === 'Script' ? 'Script' : step === 'Fixing the render' ? 'Fixing render' : 'Implementation')
      check()
      let ask = again ? `You were interrupted. Carry on where you stopped, with this task:\n\n${text}` : text
      again = false
      for (;;) {
        const { a, opened } = current
        const result = await turnPastLimits(
          (t) => a.turn(t, step),
          ask,
          (note, until) => { if (!interrupted()) update(ep, { activity: note, limitedUntil: until }) },
          check,
          () => !sameRoute(route(), opened),
        )
        check()
        if (result.switched) {
          // Another agent takes over (ADR 0048): it reads where things stand from the project's files.
          a.close()
          current = await open()
          agent = current.a
          ask = `Another agent was working on this and was interrupted. Carry on where it stopped, with this task:\n\n${text}`
          continue
        }
        if (!result.ok) throw new Error(result.error ?? 'Claude stopped with an error')
        return
      }
    }, check)
    update(ep, { tried: false })
  } catch (e) {
    if (!interrupted()) await finishMetrics(ep, run, 'failed')
    update(ep, interrupted() ? { activity: undefined } : { state: 'failed', failedAt: state === 'script' ? 'script' : ep.state === 'check' ? 'check' : 'scene', error: (e as Error).message, activity: undefined, tried: false })
  } finally {
    if (agent) {
      if (agents.get(ep.dir) === agent) agents.delete(ep.dir)
      agent.close()
    }
  }
}

function finishMetrics(ep: EpisodeRun, run: SeriesRun, outcome: string): Promise<void> {
  if (reporting.has(ep.dir)) return reporting.get(ep.dir)!
  const pending = finishEpisodeMetrics(ep.dir, outcome, { title: run.title, folder: run.folder, dirs: run.episodes.map((e) => e.dir) })
    .then((result) => {
      if (result) {
        ep.report = result.report
        ep.elapsedMs = result.elapsedMs
        run.report = result.seriesReport
        if (series === run) save()
      }
    })
    .catch((error) => {
      ep.warnings.push(`Developer report: ${(error as Error).message}`)
      if (series === run) save()
    })
    .finally(() => reporting.delete(ep.dir))
  reporting.set(ep.dir, pending)
  return pending
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
