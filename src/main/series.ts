import { archiveStudySources } from './study-source-archive'
import { fallbackEnabled } from './model-fallback'
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
import { nextQueuedSeries, nextSeriesTask } from '../shared/series-scheduling'
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
import { cancelExport, completedExport, exportJobs, queueExport } from './exports'
import { cancel } from './render'
import { createProject, readMeta, readScript, updateMetaAt } from './projects'
import { parsePlan, titlesSoFar } from '../shared/series-plan'
import { checkAndFix, ensureQuickReady } from './quick'
import { runRunner } from './runner'
import { getSettings, setSettings } from './settings'
import { slugify } from './slug'
import { appendUsage, readUsage } from './usage'
import { apiEstimateOf, costOf, type UsageEntry } from '../shared/usage'
import { isSeriesCheckpoint, recoverSeries } from '../shared/series-recovery'
import { readAtomicJson, writeAtomicJson } from './atomic-json'
import { protectWork, shutdownRequested } from './work-lifecycle'
import { saveSeriesDraft, saveSeriesPlan } from './series-draft'
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
export function switchSeriesAgent(to: AgentRoute, folder?: string): void {
  const controller = controllerFor(folder)
  if (controller.series.state === 'done') throw new Error('No series is being made.')
  switchSeriesSelection(controller.series, to, seriesSelection(getSettings(), 'make', to.agent))
  controller.save()
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
  const controller = controllers.get(folder)
  if (controller) { controller.series.title = name; controller.save() }
}

/** Creates the series folder and one project per episode; unattended, makes them all in quick mode. */
export async function startSeries(start: SeriesStart, openInWindow: (dir: string) => Promise<void>): Promise<string> {
  saveSeriesPlan({ request: { pdfs: start.pdfs, language: start.language, tone: start.tone, topic: !start.pdfs.length ? start.plan.instructions ?? start.plan.title : undefined, instructions: start.plan.instructions }, plan: start.plan })
  if (creating) throw new Error('A series is already being created. Your plan is saved; try again in a moment.')
  creating = true
  try {
    const pending = pendingCreation()
    const retry = pending && JSON.stringify(pending.start.plan) === JSON.stringify(start.plan) ? pending.folder : undefined
    return await protectWork(() => createSeries(start, openInWindow, retry))
  } finally {
    creating = false
    void pumpSeriesQueue()
  }
}

let creating = false
const creationFile = () => join(paths.userData(), 'series-creation.json')
interface SeriesCreation { start: SeriesStart; folder: string }
const pendingCreation = () => readAtomicJson(creationFile(), (value): value is SeriesCreation => {
  const item = value as SeriesCreation | null
  return !!item?.start?.plan && Array.isArray(item.start.plan.episodes) && typeof item.folder === 'string'
})

async function createSeries(start: SeriesStart, openInWindow: (dir: string) => Promise<void>, recovering?: string): Promise<string> {
  if (!start.plan.episodes.length) throw new Error('The series needs at least one episode.')
  if (!recovering) {
    if (start.unattended) await ensureQuickReady(start.plan.episodes[0]?.assignment?.agent)
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
  const courseSources = archiveStudySources(folder, start.pdfs)

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
  writeAtomicJson(join(folder, 'series.json'), { plan, episodes: dirs.map((d) => basename(d)), sources: courseSources })
  setSettings({ recentProjects: [...dirs, ...getSettings().recentProjects.filter((p) => !dirs.includes(p))] })

  if (!start.unattended) {
    writeEpisodeBible(dirs[0])
    if (!recovering) await openInWindow(dirs[0])
    clearCreation()
    return folder
  }
  if (plan.usage && !readUsage(folder).some((entry) => entry.at === plan.usage!.at && entry.step === plan.usage!.step)) appendUsage(folder, plan.usage)
  startRun(plan.title, folder, dirs, start, plan.usage && costOf(plan.usage.models), !!recovering)
  clearCreation()
  return folder
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

const controllers = new Map<string, SeriesController>()
let selectedFolder: string | undefined
let sendSeries: (run: SeriesRun | null) => void = () => {}
let queueEnabled = false
let pumping = false
const runFile = (folder: string) => join(folder, '.studio', 'series-run.json')
const registryFile = () => join(paths.userData(), 'series-jobs.json')
const unrecovered = new Set<string>()
const saveRegistry = () => writeAtomicJson(registryFile(), [...new Set([...controllers.keys(), ...unrecovered])])

export const seriesRuns = (): SeriesRun[] => [...controllers.values()].map((controller) => structuredClone(controller.series))
export const seriesRun = (): SeriesRun | null => selectedFolder ? seriesRunFor(selectedFolder) : null
export function seriesRunFor(folder: string): SeriesRun | null {
  const controller = controllers.get(folder)
  if (controller) return structuredClone(controller.series)
  const saved = readAtomicJson(runFile(folder), isSeriesCheckpoint)
  return saved ? recoveredRun(saved.run) : null
}
function controllerFor(folder = selectedFolder): SeriesController {
  if (!folder) throw new Error('No series is being made.')
  let controller = controllers.get(folder)
  if (!controller) {
    const saved = readAtomicJson(runFile(folder), isSeriesCheckpoint)
    if (!saved) throw new Error('The series checkpoint could not be read.')
    controller = new SeriesController(recoveredRun(saved.run), saved.exportOptions)
    controllers.set(folder, controller)
    unrecovered.delete(folder)
    saveRegistry()
  }
  return controller
}
export async function setupSeries(send: typeof sendSeries): Promise<void> {
  sendSeries = send
  const creation = pendingCreation()
  selectedFolder = getSettings().seriesRun
  const folders = readAtomicJson(registryFile(), (v): v is string[] => Array.isArray(v) && v.every((p) => typeof p === 'string')) ?? []
  if (selectedFolder) folders.push(selectedFolder)
  if (creation) folders.push(creation.folder)
  for (const folder of new Set(folders)) {
    const saved = readAtomicJson(runFile(folder), isSeriesCheckpoint)
    if (!saved) {
      unrecovered.add(folder)
      if (existsSync(runFile(folder))) console.error('[series recovery]', `Could not recover ${folder}; checkpoint retained.`)
      continue
    }
    const controller = new SeriesController(recoveredRun(saved.run), saved.exportOptions)
    controllers.set(folder, controller)
    controller.save()
  }
  if (creation) {
    saveSeriesPlan({ request: { pdfs: creation.start.pdfs, language: creation.start.language, tone: creation.start.tone, topic: !creation.start.pdfs.length ? creation.start.plan.title : undefined }, plan: creation.start.plan })
    if (controllers.has(creation.folder)) clearCreation()
    else await protectWork(() => createSeries(creation.start, async () => {}, creation.folder))
  }
  saveRegistry()
  // Restoring never starts paid work. Continue/Start now explicitly enables queue processing.
}
function startRun(title: string, folder: string, dirs: string[], start: SeriesStart, planningCostUSD?: number, recovered = false): void {
  const selection = seriesSelection(getSettings(), 'make')
  const settings = getSettings()
  const flags = { usage: !!settings.developerUsageMetrics, timing: !!settings.developerTimingMetrics, resources: !!settings.developerResourceMetrics }
  const queued = start.schedule === 'queue' && [...controllers.values()].some((c) => c.series.state === 'working')
  const run: SeriesRun = {
    title, folder, metrics: settings.developerMode && Object.values(flags).some(Boolean) ? flags : undefined,
    ...selection, auth: configuredAuth(selection.agent),
    state: recovered || shutdownRequested() ? 'stopped' : queued ? 'queued' : 'working',
    queuedAt: queued ? Date.now() : undefined,
    episodes: dirs.map((dir, i) => ({ dir, title: readMeta(dir).name, assignment: start.plan.episodes[i].assignment, state: 'waiting', warnings: [] })),
    planningCostUSD, planningApiEstimateUSD: apiEstimateOf(readUsage(folder)),
  }
  const controller = new SeriesController(run, start.export)
  controllers.set(folder, controller)
  selectedFolder = folder
  controller.save()
  saveRegistry()
  setSettings({ seriesRun: folder })
  if (!recovered) queueEnabled = true
  if (run.state === 'working') void controller.drive()
  else void pumpSeriesQueue()
}
async function pumpSeriesQueue(): Promise<void> {
  if (!queueEnabled || pumping || creating || shutdownRequested() || [...controllers.values()].some((c) => c.series.state === 'working')) return
  if ([...controllers.values()].some((c) => c.continuing)) return
  const queued = nextQueuedSeries(seriesRuns(), queueEnabled)
  const next = queued && controllers.get(queued.folder)
  if (!next) return
  pumping = true
  try { selectedFolder = next.series.folder; setSettings({ seriesRun: selectedFolder }); await next.continueSeries() }
  catch (error) { next.series.state = 'stopped'; next.save(); console.error('[series queue]', error) }
  finally { pumping = false; void pumpSeriesQueue() }
}
export function pauseSeries(paused: boolean, folder?: string): void { controllerFor(folder).pauseSeries(paused); void pumpSeriesQueue() }
export function pauseEpisode(dir: string, paused: boolean): void { controllerFor(readMeta(dir).series?.folder).pauseEpisode(dir, paused) }
export function stopSeries(folder?: string): void { controllerFor(folder).stopSeries(); void pumpSeriesQueue() }
export function stopAllSeries(): void {
  queueEnabled = false
  for (const controller of controllers.values()) if (controller.series.state !== 'queued') controller.stopSeries()
}
export async function continueSeries(folder?: string): Promise<void> {
  const controller = controllerFor(folder)
  queueEnabled = true
  selectedFolder = controller.series.folder
  setSettings({ seriesRun: selectedFolder })
  await controller.continueSeries()
}
export async function retrySeriesEpisode(dir: string): Promise<void> { await controllerFor(readMeta(dir).series?.folder).retrySeriesEpisode(dir) }
export async function settleSeries(): Promise<void> { await Promise.all([...controllers.values()].map((c) => c.settleSeries())) }
export async function dismissSeries(folder = selectedFolder): Promise<void> {
  if (!folder) return
  const controller = controllerFor(folder)
  if (controller.series.state === 'working') return
  controller.stopSeries()
  await controller.settleSeries()
  controllers.delete(folder)
  saveRegistry()
  if (selectedFolder === folder) { selectedFolder = [...controllers.keys()].at(-1); setSettings({ seriesRun: selectedFolder }) }
  sendSeries(null)
}

function recoveredRun(saved: SeriesRun): SeriesRun {
  const run = recoverSeries(saved)
  run.planningApiEstimateUSD = apiEstimateOf(readUsage(run.folder))
  for (const ep of run.episodes) {
    ep.apiEstimateUSD = apiEstimateOf(readUsage(ep.dir))
    if (ep.state === 'script' && scriptStatus(readScript(ep.dir) ?? '') === 'approved') {
      ep.state = 'scripted'
      ep.tried = false
    }
    if (ep.state === 'export' && ep.exportJob && completedExport(ep.dir, ep.exportJob)) ep.state = 'done'
  }
  if (run.episodes.every((ep) => ep.state === 'done' || ep.state === 'failed')) run.state = 'done'
  return run
}

/** Each course owns its scheduler, cancellations and export handles. No mutable run state is shared. */
class SeriesController {
  agents = new Map<string, EpisodeAgent>()
  steps = new Map<string, 'script' | 'video'>()
  exporting = new Set<string>()
  reporting = new Map<string, Promise<void>>()
  tasks = new Set<Promise<void>>()
  generations = new Map<string, number>()
  driving: Promise<void> | null = null
  continuing = false
  constructor(public series: SeriesRun, public exportOptions: ExportOptions) {}
  save = (): void => {
    if (!this.series) return
    mkdirSync(join(this.series.folder, '.studio'), { recursive: true })
    writeAtomicJson(runFile(this.series.folder), { run: this.series, exportOptions: this.exportOptions })
    sendSeries(structuredClone(this.series))
  }

  update = (ep: EpisodeRun, patch: Partial<EpisodeRun>) => {
    if (!this.series?.episodes.includes(ep)) return // a dismissed run's late callback cannot touch its replacement
    if (patch.state) {
      const phase = (
        { script: 'Script', scripted: 'Waiting for video', scene: 'Implementation', check: 'Render check', export: 'Export' } as Record<string, string>
      )[patch.state]
      if (phase) episodeMetricsPhase(ep.dir, phase)
    }
    Object.assign(ep, patch)
    this.save()
  }

  halted = (ep: EpisodeRun) => this.series?.state !== 'working' || !!ep.held

  halt = (ep: EpisodeRun): void => {
    this.generations.set(ep.dir, (this.generations.get(ep.dir) ?? 0) + 1)
    this.agents.get(ep.dir)?.close()
    cancel('preview', ep.dir)
  }

  pauseSeries = (paused: boolean): void => {
    if (!this.series || (paused ? this.series.state !== 'working' : this.series.state !== 'paused')) return
    this.series.state = paused ? 'paused' : 'working'
    if (paused) this.series.episodes.forEach(this.halt)
    for (const ep of this.series.episodes) if (paused && ep.exportJob && !exportJobs().find((job) => job.id === ep.exportJob)?.options.server) cancelExport(ep.exportJob)
    if (paused) this.series.episodes.filter((ep) => ep.state !== 'export').forEach((ep) => episodeMetricsPhase(ep.dir, 'Paused'))
    this.save()
    if (!paused) void this.drive()
  }

  pauseEpisode = (dir: string, paused: boolean): void => {
    const ep = this.series?.episodes.find((e) => e.dir === dir)
    if (!ep) return
    this.update(ep, { held: paused })
    if (paused && ep.state !== 'export') episodeMetricsPhase(ep.dir, 'Paused')
    if (paused) this.halt(ep)
    if (paused && ep.exportJob && !exportJobs().find((job) => job.id === ep.exportJob)?.options.server) cancelExport(ep.exportJob)
    if (!paused) void this.drive()
  }

  stopSeries = (): void => {
    if (!this.series || this.series.state === 'stopped' || this.series.state === 'done') return
    this.series.state = 'stopped'
    for (const ep of this.series.episodes) {
      this.halt(ep)
      if (ep.exportJob && this.exporting.has(ep.dir)) cancelExport(ep.exportJob)
      if (ep.state !== 'done' && ep.state !== 'failed') void this.finishMetrics(ep, this.series, 'stopped')
    }
    this.save()
  }

  retryState = (ep: EpisodeRun): void => {
    const approved = scriptStatus(readScript(ep.dir) ?? '') === 'approved'
    ep.state = ep.failedAt === 'export' ? 'export' : ep.failedAt === 'check' ? 'check' : approved ? 'scripted' : 'waiting'
    ep.error = undefined
    ep.failedAt = undefined
  }

  retrySeriesEpisode = async (dir: string): Promise<void> => {
    if (shutdownRequested()) return
    const folder = readMeta(dir).series?.folder
    if (!folder) throw new Error('That video does not belong to a series.')
    const run = this.series
    const ep = run?.episodes.find((episode) => episode.dir === dir)
    if (!run || !ep || ep.state !== 'failed') return
    await ensureQuickReady(seriesAgentSelection(run, ep, seriesSelection(getSettings(), 'make')).agent)
    if (this.series !== run || ep.state !== 'failed' || shutdownRequested()) return
    this.retryState(ep)
    ep.held = false
    if (run.state === 'done' || run.state === 'stopped') run.state = 'working'
    this.save()
    void this.drive()
  }

  continueSeries = async (): Promise<void> => {
    if (this.continuing || shutdownRequested()) return
    if (this.series?.state === 'done' && this.series.episodes.some((ep) => ep.state === 'failed')) this.series.state = 'stopped'
    if (this.series?.state !== 'stopped' && this.series?.state !== 'queued' && this.series?.state !== 'paused') return
    this.continuing = true
    try {
      await this.settleSeries()
      if (!['stopped', 'queued', 'paused'].includes(this.series.state) || shutdownRequested()) return
      for (const agent of new Set(
        this.series.episodes.filter((ep) => ep.state !== 'done').map((ep) => seriesAgentSelection(this.series!, ep, seriesSelection(getSettings(), 'make')).agent),
      ))
        await ensureQuickReady(agent)
      if (shutdownRequested()) return
      for (const ep of this.series.episodes) {
        if (ep.state !== 'failed' && ep.state !== 'stopped') continue
        this.retryState(ep)
      }
      this.series.state = 'working'
      this.save()
      void this.drive()
    } finally { this.continuing = false }
  }

  settleSeries = async (): Promise<void> => {
    while (this.tasks.size || this.reporting.size) await Promise.allSettled([...this.tasks, ...this.reporting.values()])
  }

  drive = (): Promise<void> => {
    if (this.driving) return this.driving
    this.driving = this.driveLoop().catch((error) => {
      console.error('[series scheduler]', error)
      this.stopSeries()
    }).finally(() => {
      this.driving = null
      if (this.series?.state === 'working') void this.drive()
      else void pumpSeriesQueue()
    })
    return this.driving
  }

  driveLoop = async (): Promise<void> => {
    const run = this.series
    while (run && this.series === run && run.state === 'working') {
      if (run.metrics) {
        const episode = run.episodes.find((ep) => ep.state !== 'done' && ep.state !== 'failed')
        if (!episode && !this.steps.size && !this.exporting.size && !this.reporting.size) {
          run.state = 'done'
          this.save()
          return
        }
        if (episode && !episode.held && !this.steps.size && !this.exporting.size && !this.reporting.size) {
          if (episode.state === 'waiting' || episode.state === 'script') this.launch(episode, 'script')
          else if (['scripted', 'scene', 'check'].includes(episode.state)) this.launch(episode, 'video')
          else if (episode.state === 'export') this.exportEpisode(episode, run)
        }
        await new Promise((r) => setTimeout(r, 500))
        continue
      }
      for (const ep of run.episodes) if (ep.state === 'export' && !ep.held && !this.exporting.has(ep.dir)) this.exportEpisode(ep, run)

      const next = nextSeriesTask(run.episodes, this.steps)
      if (next) {
        this.launch(next.episode, next.kind)
        await new Promise<void>((resolve) => setImmediate(resolve)) // keep navigation responsive for large restored runs
        continue
      }
      if (run.episodes.every((ep) => ep.state === 'done' || ep.state === 'failed') && !this.steps.size && !this.exporting.size) {
        run.state = 'done'
        this.save()
        return
      }
      await new Promise((r) => setTimeout(r, 500)) // ponytail: polls; a wake-up signal would save nothing you'd notice
    }
  }

  launch = (ep: EpisodeRun, kind: 'script' | 'video'): void => {
    this.steps.set(ep.dir, kind)
    const step = kind === 'script' ? this.writeScript(ep) : this.episodeVideo(ep)
    this.track(step.finally(() => this.steps.delete(ep.dir)))
  }

  track = (task: Promise<void>): void => {
    this.tasks.add(task)
    void task.catch((error) => console.error('[series task]', error)).finally(() => this.tasks.delete(task))
  }

  writeScript = async (ep: EpisodeRun): Promise<void> => {
    await this.episodeStep(ep, 'script', async (turn) => {
      await turn(
        `${episodePrompt(readMeta(ep.dir))}\n\nFor now, only the script: write script.md, review it and approve it, then stop. Don’t write scene.py yet: you’ll make the video in the next step.`,
        'Script',
      )
      this.update(ep, { state: 'scripted', activity: undefined, tried: false })
    })
  }

  episodeVideo = async (ep: EpisodeRun): Promise<void> => {
    const checking = ep.state === 'check'
    await this.episodeStep(ep, checking ? 'check' : 'scene', async (turn, check) => {
      if (!checking) {
        await turn(
          'Your script.md is approved, and series.md lists the episodes with what the ones scripted so far cover. Make this episode’s video from your script: write scene.py, render it and look at the frames.',
          'Video',
        )
      }
      check()
      this.update(ep, { state: 'check', activity: 'Checking the render' })
      const warnings = await checkAndFix(
        ep.dir,
        (text) => turn(text, 'Fixing the render'),
        check,
      )
      check()
      this.update(ep, { warnings, state: 'export', activity: undefined, tried: false })
    })
  }

  exportEpisode = (ep: EpisodeRun, run: SeriesRun): void => {
    this.exporting.add(ep.dir)
    this.track((async () => {
      const generation = this.generations.get(ep.dir) ?? 0
      try {
        await beginEpisodeMetrics(ep.dir, seriesAgentSelection(run, ep, seriesSelection(getSettings(), 'make')), run.metrics)
        this.stopIf(ep)
        episodeMetricsPhase(ep.dir, 'Export')
        const { job, finished } = queueExport(ep.dir, this.exportOptions)
        this.update(ep, { exportJob: job.id })
        await finished
        await this.finishMetrics(ep, run, 'done')
        this.update(ep, { state: 'done' })
      } catch (e) {
        if (run.state === 'working' && !ep.held && (this.generations.get(ep.dir) ?? 0) === generation) {
          await this.finishMetrics(ep, run, 'failed')
          this.update(ep, { state: 'failed', failedAt: 'export', error: (e as Error).message })
        }
      } finally {
        this.exporting.delete(ep.dir)
      }
    })())
  }

  stopIf = (ep: EpisodeRun): void => {
    if (this.halted(ep)) throw new Error('Stopped')
  }

  episodeStep = async (
    ep: EpisodeRun,
    state: EpisodeRun['state'],
    work: (turn: (text: string, step: string) => Promise<void>, check: () => void) => Promise<void>,): Promise<void> => {
    const run = this.series!
    const generation = this.generations.get(ep.dir) ?? 0
    const interrupted = () => this.series !== run || this.halted(ep) || (this.generations.get(ep.dir) ?? 0) !== generation
    const check = () => { if (interrupted()) throw new Error('Stopped') }
    let again = !!ep.tried
    let agent: EpisodeAgent | null = null
    // The agent and sign-in this episode runs on: the series' (switchable at a limit), or its fixed assignment.
    const route = (): AgentRoute => {
      const selection = seriesAgentSelection(run, ep, seriesSelection(getSettings(), 'make'))
      return { agent: selection.agent, auth: ep.assignment ? ep.assignmentAuth ?? configuredAuth(selection.agent) : (run.auth ?? configuredAuth(selection.agent)) }
    }
    const open = async () => {
      let opened = route()
      episodeMetricsSelection(ep.dir, seriesAgentSelection(run, ep, seriesSelection(getSettings(), 'make')))
      const a = await episodeAgent(ep.dir, {
        onTool: (summary) => { if (!interrupted()) this.update(ep, { activity: summary }) },
        onUsage: (e) => this.update(ep, { costUSD: (ep.costUSD ?? 0) + costOf(e.models), apiEstimateUSD: apiEstimateOf(readUsage(ep.dir)) }),
        ...seriesAgentSelection(run, ep, seriesSelection(getSettings(), 'make')),
        auth: opened.auth,
        allowFallback: !ep.assignment,
        strictModel: !!ep.assignment,
        followPriority: true,
        onSelection: (actual) => {
          if (interrupted()) return
          const { auth, ...assignment } = actual
          if (fallbackEnabled()) {
            this.update(ep, { assignment, assignmentAuth: auth })
            episodeMetricsSelection(ep.dir, assignment)
            opened = route()
          }
        },
      })
      this.agents.set(ep.dir, a)
      return { a, opened }
    }
    try {
      await beginEpisodeMetrics(ep.dir, seriesAgentSelection(run, ep, seriesSelection(getSettings(), 'make')), run.metrics)
      check()
      this.update(ep, { state, activity: 'Starting', tried: true })
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
            (note, until) => { if (!interrupted()) this.update(ep, { activity: note, limitedUntil: until }) },
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
      this.update(ep, { tried: false })
    } catch (e) {
      if (!interrupted()) await this.finishMetrics(ep, run, 'failed')
      this.update(ep, interrupted() ? { activity: undefined } : { state: 'failed', failedAt: state === 'script' ? 'script' : ep.state === 'check' ? 'check' : 'scene', error: (e as Error).message, activity: undefined, tried: false })
    } finally {
      if (agent) {
        if (this.agents.get(ep.dir) === agent) this.agents.delete(ep.dir)
        agent.close()
      }
    }
  }

  finishMetrics = (ep: EpisodeRun, run: SeriesRun, outcome: string): Promise<void> => {
    if (this.reporting.has(ep.dir)) return this.reporting.get(ep.dir)!
    const pending = finishEpisodeMetrics(ep.dir, outcome, { title: run.title, folder: run.folder, dirs: run.episodes.map((e) => e.dir) })
      .then((result) => {
        if (result) {
          ep.report = result.report
          ep.elapsedMs = result.elapsedMs
          run.report = result.seriesReport
          if (this.series === run) this.save()
        }
      })
      .catch((error) => {
        ep.warnings.push(`Developer report: ${(error as Error).message}`)
        if (this.series === run) this.save()
      })
      .finally(() => this.reporting.delete(ep.dir))
    this.reporting.set(ep.dir, pending)
    return pending
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
