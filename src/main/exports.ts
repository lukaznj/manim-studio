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

const jobs: ExportJob[] = []
const done = new Map<string, { resolve: (r: ExportResult) => void; reject: (e: Error) => void }>()
let current: { id: string; abort: AbortController } | null = null
let send: (jobs: ExportJob[]) => void = () => {}

export function onExportsChanged(fn: (jobs: ExportJob[]) => void): void {
  send = fn
}

export const exportJobs = (): ExportJob[] => jobs.map((j) => ({ ...j }))
export const exportsBusy = (): boolean => jobs.some((j) => j.state === 'waiting' || j.state === 'running')

const changed = () => send(exportJobs())

/** Adds an export of the project in `project`. `finished` settles when it's done, failed or cancelled. */
export function queueExport(project: string, options: ExportOptions): { job: ExportJob; finished: Promise<ExportResult> } {
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
  if (job.state === 'running') current?.abort.abort()
  else if (job.state === 'waiting') finish(job, { state: 'cancelled' })
  else jobs.splice(jobs.indexOf(job), 1)
  changed()
}

/** Takes every finished export off the list. */
export function clearExports(): void {
  for (let i = jobs.length - 1; i >= 0; i--) if (!['waiting', 'running'].includes(jobs[i].state)) jobs.splice(i, 1)
  changed()
}

async function next(): Promise<void> {
  if (current) return
  const job = jobs.find((j) => j.state === 'waiting')
  if (!job) return
  const abort = new AbortController()
  current = { id: job.id, abort }
  job.state = 'running'
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
        job.percent = p.percent
        changed()
      },
      abort.signal,
    )
    finish(job, { state: 'done', result })
    notify(`Exported “${job.name}”`, result.warnings.length ? result.warnings[0] : 'Click to show the files.', () => shell.showItemInFolder(result.files[0] ?? result.folder))
  } catch (e) {
    if (abort.signal.aborted) finish(job, { state: 'cancelled' })
    else {
      finish(job, { state: 'failed', error: (e as Error).message })
      notify(`The export of “${job.name}” failed`, (e as Error).message)
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
    current = null
    changed()
    void next()
  }
}

function finish(job: ExportJob, patch: Partial<ExportJob>): void {
  Object.assign(job, patch, { finishedAt: Date.now(), stage: undefined, percent: undefined })
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
