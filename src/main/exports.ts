// The export queue: exports run in the background, one at a time, each on its own copy of its
// project (export.ts), so the user can work on the next video meanwhile. The window shows the list
// (the title bar's Exports button) and a notification says when one is done. Jobs live in memory:
// quitting asks first when some are still running or waiting.
import { app, Notification, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { ExportJob, ExportOptions, ExportResult } from '../shared/types'
import { exportVideo } from './export'
import { readMeta } from './projects'
import { pauseTag } from './runner'
import { formatUi, translateUi } from '../shared/i18n'
import { getSettings } from './settings'
import { writeAtomicJson } from './atomic-json'
export { completedExport } from './export-recovery'

const jobs: ExportJob[] = []
const done = new Map<string, { resolve: (r: ExportResult) => void; reject: (e: Error) => void }>()
// One export at a time per machine: this computer, and each render server (ADR 0021).
const running = new Map<string, { id: string; abort: AbortController }>()
const slot = (job: ExportJob) => job.options.server ?? 'local'
let send: (jobs: ExportJob[]) => void = () => {}
let stopping = false
const pending = new Set<Promise<void>>()

export async function stopExports(): Promise<void> {
  stopping = true
  for (const job of jobs) if (job.state === 'waiting' || job.state === 'running') cancelExport(job.id)
  while (pending.size) await Promise.allSettled([...pending])
}

export function onExportsChanged(fn: (jobs: ExportJob[]) => void): void {
  send = fn
}

export const exportJobs = (): ExportJob[] => jobs.map((j) => ({ ...j }))
export const exportsBusy = (): boolean => jobs.some((j) => j.state === 'waiting' || j.state === 'running')

const changed = () => send(exportJobs())

/** Adds an export of the project in `project`. `finished` settles when it's done, failed or cancelled. */
export function queueExport(project: string, options: ExportOptions): { job: ExportJob; finished: Promise<ExportResult> } {
  if (stopping) throw new Error('The app is closing. Try again after reopening it.')
  const job: ExportJob = { id: randomUUID(), project, name: readMeta(project).name, options, state: 'waiting', queuedAt: Date.now() }
  jobs.push(job)
  const finished = new Promise<ExportResult>((resolve, reject) => done.set(job.id, { resolve, reject }))
  finished.catch(() => undefined) // a caller that doesn't wait mustn't see an unhandled rejection
  changed()
  void next()
  return { job: { ...job }, finished }
}

/** Stops a waiting or running export, or takes a finished one off the list. */
export function cancelExport(id: string): void {
  const job = jobs.find((j) => j.id === id)
  if (!job) return
  if (job.state === 'running') running.get(slot(job))?.abort.abort()
  else if (job.state === 'waiting') finish(job, { state: 'cancelled' })
  else jobs.splice(jobs.indexOf(job), 1)
  changed()
}

/** Pauses or resumes a running export on this computer (a render server's can only be stopped). */
export function pauseExport(id: string, on: boolean): void {
  const job = jobs.find((j) => j.id === id)
  if (!job || job.state !== 'running' || job.options.server) return
  pauseTag(job.id, on)
  job.paused = on
  changed()
}

/** Takes every finished export off the list. */
export function clearExports(): void {
  for (let i = jobs.length - 1; i >= 0; i--) if (!['waiting', 'running'].includes(jobs[i].state)) jobs.splice(i, 1)
  changed()
}

function next(): Promise<void> {
  const task = runNext()
  pending.add(task)
  void task.finally(() => pending.delete(task)).catch((error) => console.error('[export queue]', error))
  return task
}

async function runNext(): Promise<void> {
  if (stopping) return
  const job = jobs.find((j) => j.state === 'waiting' && !running.has(slot(j)))
  if (!job) return
  const abort = new AbortController()
  running.set(slot(job), { id: job.id, abort })
  job.state = 'running'
  void next() // another machine may be free for the next job
  changed()
  const work = join(app.getPath('userData'), 'export-jobs', job.id)
  mkdirSync(work, { recursive: true })
  try {
    const result = await exportVideo(
      job.project,
      work,
      job.options,
      (p) => {
        job.stage = p.stage
        job.phase = p.phase
        job.percent = p.percent
        changed()
      },
      abort.signal,
      job.id,
    )
    writeAtomicJson(join(job.project, '.studio', 'completed-exports', `${job.id}.json`), result)
    finish(job, { state: 'done', result })
    const language = getSettings().uiLanguage ?? 'en'
    notify(formatUi(language, 'Exported “{0}”', [job.name]), result.warnings.length ? translateUi(language, result.warnings[0]) : translateUi(language, 'Click to show the files.'), () => shell.showItemInFolder(result.files[0] ?? result.folder))
  } catch (e) {
    if (abort.signal.aborted) finish(job, { state: 'cancelled' })
    else {
      finish(job, { state: 'failed', error: (e as Error).message })
      const language = getSettings().uiLanguage ?? 'en'
      notify(formatUi(language, 'The export of “{0}” failed', [job.name]), translateUi(language, (e as Error).message))
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
    running.delete(slot(job))
    changed()
    void next()
  }
}

function finish(job: ExportJob, patch: Partial<ExportJob>): void {
  pauseTag(job.id, false)
  Object.assign(job, patch, { finishedAt: Date.now(), stage: undefined, phase: undefined, percent: undefined, paused: undefined })
  const waiter = done.get(job.id)
  done.delete(job.id)
  if (job.state === 'done' && job.result) waiter?.resolve(job.result)
  else waiter?.reject(new Error(job.error ?? 'The export was cancelled'))
}

function notify(title: string, body: string, onClick?: () => void): void {
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body })
  if (onClick) n.on('click', onClick)
  n.show()
}
