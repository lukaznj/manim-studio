// Quick video uses the same project-bound, routed background agents as course production.
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Agent, ExportOptions, ExportResult, QuickRequest, QuickRun } from '../shared/types'
import { scriptStatus } from '../shared/script'
import { defaultAgentSelection } from '../shared/agent-selection'
import { claudeStatus } from './claude'
import { setupStatus } from './env'
import { configuredAuth, episodeAgent, turnPastLimits, type EpisodeAgent } from './agent'
import { fakeAgents } from './agent-fake'
import { cancelExport, completedExport, queueExport } from './exports'
import { createProject, updateMetaAt } from './projects'
import { protectWork, shutdownRequested } from './work-lifecycle'
import { cancel, currentOrNewRender } from './render'
import { importSources } from './sources'
import { titleFrom } from './title'
import { getSettings, rememberProject } from './settings'
import { paths } from './paths'
import { readAtomicJson, writeAtomicJson } from './atomic-json'
import { beginProductionPhase, finishProductionPhase } from './production-progress'

const FIX_ROUNDS = 3
let send: (run: QuickRun | null) => void = () => {}
let openInWindow: (dir: string) => Promise<void> = async () => {}
const controllers = new Map<string, QuickController>()
const legacyCheckpoint = () => join(paths.userData(), 'quick-video.json')
export function setupQuick(host: { send: typeof send; openInWindow: typeof openInWindow }): void {
  send = host.send
  openInWindow = host.openInWindow
  const folder = join(paths.userData(), 'quick-videos')
  const files = existsSync(folder) ? readdirSync(folder).filter(name => /^[a-f0-9-]{36}\.json$/.test(name)).map(name => join(folder, name)) : []
  if (existsSync(legacyCheckpoint())) files.unshift(legacyCheckpoint())
  for (const file of files) {
    const saved = readAtomicJson(file, validQuickCheckpoint)
    if (!saved || !existsSync(join(saved.run.project, 'project.json'))) continue
    const run = { ...saved.run, state: saved.run.state === 'working' ? 'stopped' as const : saved.run.state, activity: undefined, limitedUntil: undefined }
    if (run.state === 'stopped' && run.step === 'export' && run.exportJob) {
      const result = completedExport(run.project, run.exportJob)
      if (result) Object.assign(run, { state: 'done', step: 'done', result })
    }
    controllers.set(run.project, new QuickController(run, saved.task))
  }
  for (const controller of controllers.values()) controller.update({})
}
export const quickRuns = (): QuickRun[] => [...controllers.values()].map(c => structuredClone(c.run))
export const quickRun = (project?: string): QuickRun | null => project ? structuredClone(controllers.get(project)?.run ?? null) : quickRuns().at(-1) ?? null
export const stopQuick = (project?: string): void => { if (project) controllers.get(project)?.stop(); else for (const c of controllers.values()) c.stop() }
export async function settleQuick(): Promise<void> { await Promise.allSettled([...controllers.values()].map(c => c.pending)) }
class QuickController {
  agent: EpisodeAgent | null = null
  pending: Promise<ExportResult> | null = null
  stopping = false
  resuming = false
  constructor(public run: QuickRun, public task: QuickTask) {}
  checkpoint = () => join(paths.userData(), 'quick-videos', this.run.id + '.json')
  stop = (): void => {
    if (this.run.state !== 'working') return
    this.stopping = true
    this.agent?.close()
    cancel('preview', this.run.project)
    if (this.run.exportJob) cancelExport(this.run.exportJob)
    this.update({ state: 'stopped', activity: undefined, limitedUntil: undefined })
  }
  update = (patch: Partial<QuickRun>): void => {
    if (!this.run) return
    Object.assign(this.run, patch)
    writeAtomicJson(this.checkpoint(), { run: this.run, task: this.task })
    send(structuredClone(this.run))
  }
  launch = (): Promise<ExportResult> => {
    this.stopping = false
    this.update({ state: 'working', error: undefined, limitedUntil: undefined })
    const work = this.make(this.run!, this.task!)
    this.pending = work
    void work.finally(() => { if (this.pending === work) this.pending = null }).catch(() => undefined)
    return work
  }
  check = (): void => { if (this.stopping) throw new Error('Stopped') }
  make = async (r: QuickRun, req: QuickTask): Promise<ExportResult> => {
    try {
      if (!req.imported && req.sources.length) {
        this.update({ step: 'sources', activity: 'Reading the sources' })
        const sources = await importSources(req.sources, r.project)
        if (sources.items.some((source) => source.error)) throw new Error(sources.items.find((source) => source.error)!.error)
        req.imported = true
        this.update({})
      }
      this.check()
      this.agent = await episodeAgent(r.project, {
        ...r.route,
        followPriority: true,
        onTool: (activity) => { if (!this.stopping) this.update({ activity }) },
        onUsage: () => {},
        onSelection: (route) => { if (!this.stopping) this.update({ route }) },
      })
      this.check()
      const turn = async (text: string, label: string) => {
        this.check()
        const result = await turnPastLimits((prompt) => this.agent!.turn(prompt, label), text,
          (activity, limitedUntil) => { if (!this.stopping) this.update({ activity, limitedUntil }) }, this.check)
        this.check()
        if (!result.ok) throw new Error(result.error ?? 'The agent stopped with an error.')
      }
      if (r.step === 'script' && existsSync(join(r.project, 'script.md')) && scriptStatus(readFileSync(join(r.project, 'script.md'), 'utf8')) === 'approved') {
        finishProductionPhase(r.project, 'script')
        this.update({ step: 'scene' })
      }
      if (['setup', 'sources', 'script'].includes(r.step)) {
        this.update({ step: 'script', activity: 'Writing the script' })
        await turn(`${req.prompt.trim()}\n\nRead the PDFs in sources/ if present. For now, only the script: write script.md, review it and approve it, then stop. Don’t write scene.py yet: you’ll make the video in the next step.`, 'Script')
        if (scriptStatus(readFileSync(join(r.project, 'script.md'), 'utf8')) !== 'approved') throw new Error('The agent did not finish approving the script. Continue to finish it.')
        const title = readFileSync(join(r.project, 'script.md'), 'utf8').match(/^# ([^\r\n]+)/m)?.[1].trim().slice(0, 140)
        if (title) { updateMetaAt(r.project, { name: title }); this.update({ name: title }) }
        this.update({ step: 'scene' })
      }
      if (r.step === 'scene') {
        this.update({ activity: 'Making the video' })
        await turn('Continue from the existing files. Your script.md is approved. Make the video from it: write scene.py, render it and inspect the frames. Complete unfinished sections without discarding completed work.', 'Video')
        this.update({ step: 'check' })
      }
      if (r.step === 'check') {
        this.update({ activity: 'Checking the render' })
        this.update({ warnings: await checkAndFix(r.project, (text) => turn(text, 'Fixing the render'), this.check), step: 'export' })
      }
      this.check()
      this.agent.close()
      this.agent = null
      this.update({ activity: 'Exporting' })
      const { job, finished } = queueExport(r.project, req.export)
      this.update({ exportJob: job.id })
      const result = await finished
      this.check()
      this.update({ state: 'done', step: 'done', result, warnings: [...new Set([...r.warnings, ...result.warnings])], activity: undefined })
      return result
    } catch (error) {
      this.update(this.stopping ? { state: 'stopped', activity: undefined } : { state: 'failed', error: (error as Error).message, activity: undefined })
      throw error
    } finally { this.agent?.close(); this.agent = null }
  }
}

export async function ensureQuickReady(chosen?: Agent): Promise<void> {
  if (setupStatus().env !== 'ready') throw new Error('The manim environment isn’t installed yet (Settings → Environment).')
  const status = await claudeStatus(chosen)
  if (!status.loggedIn && !fakeAgents()) throw new Error('Sign in to your agent first (Settings → Accounts): quick mode needs it to write the video.')
}

export async function startQuick(req: QuickRequest): Promise<{ run: QuickRun; finished: Promise<ExportResult> }> {
  await ensureQuickReady()
  if (!req.prompt.trim() || req.prompt.length > 40_000) throw new Error('Describe the video in up to 40,000 characters.')
  if (shutdownRequested()) throw new Error('The app is closing. Try again after reopening it.')
  const name = req.name?.trim() || titleFrom(req.prompt)
  const { controller, finished } = await protectWork(async () => {
    const dir = await createProject({ name, aspect: req.aspect, theme: req.theme, tone: req.tone, language: req.language, voice: req.voice })
    rememberProject(dir)
    const selection = defaultAgentSelection(getSettings())
    const run: QuickRun = { id: randomUUID(), project: dir, name, state: 'working', step: 'setup', warnings: [], sources: req.sources.length, startedAt: Date.now(), route: { ...selection, auth: configuredAuth(selection.agent) } }
    const controller = new QuickController(run, { prompt: req.prompt, sources: req.sources, export: req.export })
    controllers.set(dir, controller)
    const finished = controller.launch()
    return { controller, finished }
  })
  void finished.catch(() => undefined)
  await openInWindow(controller.run.project)
  return { run: structuredClone(controller.run), finished }
}
export async function resumeQuick(project?: string): Promise<QuickRun> {
  const controller = controllers.get(project ?? quickRun()?.project ?? '')
  if (!controller || controller.run.state === 'done') throw new Error('There is no unfinished quick video.')
  if (controller.resuming || controller.run.state === 'working') throw new Error('This video is already running.')
  controller.resuming = true
  try {
    if (shutdownRequested()) throw new Error('The app is closing. Try again after reopening it.')
    await ensureQuickReady(controller.run.route?.agent)
    await controller.pending?.catch(() => undefined)
    if (shutdownRequested()) throw new Error('The app is closing. Try again after reopening it.')
    void controller.launch().catch(() => undefined)
    return structuredClone(controller.run)
  } finally { controller.resuming = false }
}

export interface QuickTask { prompt: string; sources: string[]; export: ExportOptions; imported?: boolean }
export interface QuickCheckpoint { run: QuickRun; task: QuickTask }
export function validQuickCheckpoint(value: unknown): value is QuickCheckpoint {
  const v = value as QuickCheckpoint | null
  return !!v && !!v.run && !!v.task && typeof v.run.id === 'string' && typeof v.run.project === 'string' && typeof v.run.name === 'string' &&
    ['working', 'stopped', 'failed', 'done'].includes(v.run.state) && ['setup', 'sources', 'script', 'scene', 'check', 'export', 'done'].includes(v.run.step) &&
    Array.isArray(v.run.warnings) && typeof v.task.prompt === 'string' && Array.isArray(v.task.sources) && v.task.sources.every((p) => typeof p === 'string') &&
    !!v.task.export && Array.isArray(v.task.export.themes) && v.task.export.themes.every((theme) => ['dark', 'light'].includes(theme)) && Array.isArray(v.task.export.languages)
}

/**
 * Studio's own check after Claude says it's done: renders, and sends Claude back for an error or
 * layout warnings, up to FIX_ROUNDS times. Returns what's left to tell the user (voice problems,
 * warnings it couldn't fix); throws when the video still doesn't render. Series episodes use it too.
 */
export async function checkAndFix(dir: string, turn: (text: string) => Promise<void>, check: () => void): Promise<string[]> {
  beginProductionPhase(dir, 'check')
  for (let round = 0; ; round++) {
    check()
    const outcome = await currentOrNewRender(dir)
    check()
    if ('cancelled' in outcome) throw new Error('The render was cancelled')
    const problems =
      'error' in outcome
        ? [`fails: ${outcome.error.message}${outcome.error.line ? ` (scene.py line ${outcome.error.line})` : ''}`]
        : outcome.timeline.warnings.map((w) => w.message)
    if (!problems.length) { finishProductionPhase(dir, 'check'); return 'timeline' in outcome ? outcome.timeline.voiceWarnings : [] }
    if (round === FIX_ROUNDS) {
      if ('error' in outcome) throw new Error(`The video still doesn’t render after ${FIX_ROUNDS} fixes: ${outcome.error.message}`)
      finishProductionPhase(dir, 'check')
      return [...outcome.timeline.warnings.map((w) => w.message), ...outcome.timeline.voiceWarnings]
    }
    await turn(
      `I rendered it, and the render ${problems.length === 1 ? problems[0] : `has these problems:\n- ${problems.join('\n- ')}`}\nFix ${problems.length === 1 ? 'it' : 'them'}, render again and look at the frames.`,
    )
  }
}
