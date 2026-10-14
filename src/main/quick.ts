// Quick mode: describe a video, attach PDFs, and Studio makes it unattended. It creates the project,
// opens it (the window shows a progress screen instead of the editor), lets Claude script, write and
// check it on autopilot, re-checks the render itself and sends Claude back to fix what's left, then
// queues the export. One run at a time; series mode (series.ts) runs these one after another.
import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import type { ChatEvent, ExportResult, QuickRequest, QuickRun, QuickStep } from '../shared/types'
import { chatAndWait, chatInterrupt, claudeStatus, observeChat, setAutopilot } from './claude'
import { setupStatus } from './env'
import { cancelExport, queueExport } from './exports'
import { createProject } from './projects'
import { currentOrNewRender } from './render'
import { importSources } from './sources'
import { titleFrom } from './title'

const STEPS: QuickStep[] = ['setup', 'sources', 'script', 'scene', 'check', 'export', 'done']
const FIX_ROUNDS = 3

let run: QuickRun | null = null
let stopping = false
let send: (run: QuickRun | null) => void = () => {}
let openInWindow: (dir: string) => Promise<void> = async () => {}

export function setupQuick(host: { send: typeof send; openInWindow: typeof openInWindow }): void {
  send = host.send
  openInWindow = host.openInWindow
}

export const quickRun = (): QuickRun | null => (run ? { ...run } : null)

const update = (patch: Partial<QuickRun>) => {
  if (!run) return
  Object.assign(run, patch)
  send(quickRun())
}

/** Moves the progress forward only: Claude goes back to the script now and then. */
const reach = (step: QuickStep) => run && STEPS.indexOf(step) > STEPS.indexOf(run.step) && update({ step })

/** Starts a run and returns it at once; it goes on in the background. `finished` settles at the end. */
export async function startQuick(req: QuickRequest): Promise<{ run: QuickRun; finished: Promise<ExportResult> }> {
  if (run?.state === 'working') throw new Error('Quick mode is already making a video. Wait for it, or stop it.')
  if (setupStatus().env !== 'ready') throw new Error('The manim environment isn’t installed yet (Settings → Environment).')
  const claude = await claudeStatus()
  if (!claude.loggedIn) throw new Error('Sign in to Claude first (Settings → Claude): quick mode needs it to write the video.')
  if (!req.prompt.trim()) throw new Error('Describe the video first.')

  const name = req.name?.trim() || titleFrom(req.prompt)
  const dir = await createProject({ name, aspect: req.aspect, theme: req.theme, tone: req.tone, scriptFirst: true, language: req.language, voice: req.voice })
  run = { id: randomUUID(), project: dir, name, state: 'working', step: 'setup', warnings: [] }
  stopping = false
  send(quickRun())
  const finished = make(run, req)
  finished.catch(() => undefined)
  return { run: quickRun()!, finished }
}

export function stopQuick(): void {
  if (!run || run.state !== 'working') return
  stopping = true
  void chatInterrupt()
  if (run.exportJob) cancelExport(run.exportJob)
}

async function make(r: QuickRun, req: QuickRequest): Promise<ExportResult> {
  const unobserve = observeChat((e) => follow(e))
  try {
    await openInWindow(r.project)
    if (req.sources.length) {
      reach('sources')
      update({ activity: `Adding ${req.sources.length === 1 ? basename(req.sources[0]) : `${req.sources.length} PDFs`}` })
      await importSources(req.sources)
    }
    setAutopilot(true)
    const names = req.sources.map((s) => basename(s))
    const brief = [
      req.prompt.trim(),
      names.length ? `\nMake it from these sources (in sources/): ${names.join(', ')}. Follow them, as the guide says.` : '',
    ].join('')
    await turn(brief)

    // Claude says it's done; check for ourselves and send it back for what's left.
    reach('check')
    for (let round = 0; ; round++) {
      check()
      update({ activity: 'Checking the render' })
      const outcome = await currentOrNewRender()
      check()
      if ('cancelled' in outcome) throw new Error('The render was cancelled')
      const problems = 'error' in outcome ? [`fails: ${outcome.error.message}${outcome.error.line ? ` (scene.py line ${outcome.error.line})` : ''}`] : outcome.timeline.warnings.map((w) => w.message)
      if (!problems.length) {
        if ('timeline' in outcome) update({ warnings: outcome.timeline.voiceWarnings })
        break
      }
      if (round === FIX_ROUNDS) {
        if ('error' in outcome) throw new Error(`The video still doesn’t render after ${FIX_ROUNDS} fixes: ${outcome.error.message}`)
        update({ warnings: [...outcome.timeline.warnings.map((w) => w.message), ...outcome.timeline.voiceWarnings] })
        break
      }
      await turn(`I rendered it, and the render ${problems.length === 1 ? problems[0] : `has these problems:\n- ${problems.join('\n- ')}`}\nFix ${problems.length === 1 ? 'it' : 'them'}, render again and look at the frames.`)
    }
    setAutopilot(false)

    reach('export')
    update({ activity: 'Exporting' })
    const { job, finished } = queueExport(r.project, req.export)
    update({ exportJob: job.id })
    const result = await finished
    update({ state: 'done', step: 'done', result, activity: undefined })
    return result
  } catch (e) {
    const message = (e as Error).message
    update(stopping ? { state: 'stopped', activity: undefined } : { state: 'failed', error: message, activity: undefined })
    throw e
  } finally {
    unobserve()
    setAutopilot(false)
  }
}

function check(): void {
  if (stopping) throw new Error('Stopped')
}

async function turn(text: string): Promise<void> {
  check()
  const result = await chatAndWait(text)
  check()
  if (!result.ok) throw new Error(result.error ?? 'Claude stopped with an error')
}

/** Progress from what Claude does: the files it writes and the tools it calls. */
function follow(e: ChatEvent): void {
  if (!run || run.state !== 'working' || e.type !== 'part' || e.part.kind !== 'tool') return
  const { name, summary } = e.part
  update({ activity: summary })
  if (/source/.test(name)) reach('sources')
  else if (/script\.md/.test(summary)) reach('script')
  else if (/scene\.py/.test(summary)) reach('scene')
  else if (/render_preview|view_frames/.test(name)) reach(run.step === 'setup' || run.step === 'sources' || run.step === 'script' ? 'scene' : 'check')
}
