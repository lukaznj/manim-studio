// One preview render at a time per project: a new request cancels the one in flight (the newest
// source always wins). The open project's renders report to the window; a series' episodes render
// in the background. Final renders run separately for export.
import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { ProjectMeta, Quality, RenderError, RenderEvent, Theme, Timeline } from '../shared/types'
import { commitAll } from './git'
import { project, readMeta, readTimeline, requireProject } from './projects'
import { killJob, pauseTag, runRunner } from './runner'
import { getSettings } from './settings'
import { voiceEnv } from './voice'
import { projectCache } from './render-cache'
import { previewProgress } from './production-progress'

export type RenderOutcome = { timeline: Timeline } | { error: RenderError } | { cancelled: true }

interface Running {
  cancel: () => void
  outcome: Promise<RenderOutcome>
}

const running = new Map<string, Running>() // by project folder and quality
export const rendersBusy = (): boolean => running.size > 0
const key = (dir: string, quality: Quality) => `${dir}\n${quality}`
let nextId = 1
let sendEvent: (e: RenderEvent) => void = () => {}
let commitsPaused = false

export function onRenderEvent(fn: (e: RenderEvent) => void): void {
  sendEvent = fn
}

/** While Claude works, renders don't commit; the turn commits once at the end. */
export function pauseCommits(paused: boolean): void {
  commitsPaused = paused
}

/** A final render in another theme goes to its own folder (`.studio/final-light`), for exporting both. */
export interface RenderVariant {
  theme?: Theme
  out?: string
  size?: number // short side in pixels
  fps?: number
  from?: number // a slice of a parallel export: the animations to draw (0-based, inclusive)
  upto?: number
  encoder?: string // a GPU video encoder for the partial movies (encoder.ts); none: libx264 on the CPU
}

export function render(quality: Quality, variant: RenderVariant = {}, dir = requireProject().path): Promise<RenderOutcome> {
  const k = key(dir, quality)
  running.get(k)?.cancel()
  const open = project()?.path === dir
  // The user may leave a project during this render. Never deliver its timeline into a new one.
  const send: typeof sendEvent = (event) => { if (project()?.path === dir) sendEvent(event) }
  if (quality === 'preview' && open) pauseTag('preview', false) // asking for a render means you want it to run
  const meta = open ? project()!.meta : readMeta(dir)
  const id = nextId++
  const expectedClips = readTimeline(dir, quality)?.clips.length ?? readTimeline(dir)?.clips.length ?? 0
  if (quality === 'preview') previewProgress(dir, 0, expectedClips)
  send({ id, quality, type: 'start', expectedClips })

  let cancelled = false
  const abort = new AbortController()
  let child: ChildProcess | null = null
  const entry: Running = {
    cancel: () => {
      cancelled = true
      abort.abort()
      if (child) killJob(child)
    },
    outcome: Promise.resolve({ cancelled: true }),
  }
  running.set(k, entry)

  entry.outcome = (async (): Promise<RenderOutcome> => {
    let log = ''
    try {
      const { previewSize, previewFps } = getSettings()
      const options =
        quality === 'preview'
          ? ['--size', String(previewSize), '--fps', String(previewFps)]
          : [
              ...(variant.theme ? ['--theme', variant.theme] : []),
              ...(variant.out ? ['--out', variant.out] : []),
              ...(variant.size ? ['--size', String(variant.size)] : []),
              ...(variant.fps ? ['--fps', String(variant.fps)] : []),
            ]
      const job = await runRunner<{ result: Timeline }>('default', ['render', dir, '--quality', quality, ...options], {
        signal: abort.signal,
        extraEnv: { ...(await voiceEnv(meta, dir)), STUDIO_CACHE_DIR: projectCache(dir) },
        tag: quality === 'preview' && open ? 'preview' : undefined,
        onEvent: (e) => {
          if (e.type === 'progress') {
            if (quality === 'preview') previewProgress(dir, Number(e.clips), expectedClips)
            send({ id, quality, type: 'progress', clips: Number(e.clips), t: Number(e.t) })
          }
        },
      })
      child = job.child
      if (cancelled) killJob(child)
      const { result } = await job.done.finally(() => (log = job.log()))
      send({ id, quality, type: 'done', timeline: result })
      if (quality === 'preview') void afterPreview(dir, open)
      return { timeline: result }
    } catch (e) {
      const err = e as Error & { cancelled?: boolean; event?: Record<string, unknown>; log?: string }
      if (err.cancelled || cancelled) {
        send({ id, quality, type: 'cancelled' })
        return { cancelled: true }
      }
      const error: RenderError = {
        message: String(err.event?.message ?? err.message),
        line: (err.event?.line as number | null) ?? null,
        traceback: String(err.event?.traceback ?? ''),
        log: err.log ?? log,
      }
      send({ id, quality, type: 'error', error })
      return { error }
    } finally {
      if (running.get(k) === entry) running.delete(k)
    }
  })()
  return entry.outcome
}

/**
 * A full-quality render of the project in `dir` (an export's own copy), outside the preview's
 * one-at-a-time rule. `cacheDir` shares the original project's partial movies, so unchanged
 * animations aren't drawn again. Throws the render's error, with its line when it has one.
 */
export async function renderFinal(
  dir: string,
  meta: ProjectMeta,
  variant: RenderVariant,
  opts: { cacheDir?: string; partialDir?: string; signal?: AbortSignal; onProgress?: (t: number, clips: number) => void; offlineVoice?: boolean; tag?: string } = {},
): Promise<Timeline> {
  const args = ['render', dir, '--quality', 'final']
  if (variant.theme) args.push('--theme', variant.theme)
  if (variant.out) args.push('--out', variant.out)
  if (variant.size) args.push('--size', String(variant.size))
  if (variant.fps) args.push('--fps', String(variant.fps))
  if (variant.from !== undefined) args.push('--from', String(variant.from))
  if (variant.upto !== undefined) args.push('--upto', String(variant.upto))
  if (variant.encoder) args.push('--encoder', variant.encoder)
  const job = await runRunner<{ result: Timeline }>('default', args, {
    extraEnv: {
      ...(await voiceEnv(meta, dir)),
      ...(opts.cacheDir ? { STUDIO_CACHE_DIR: opts.cacheDir } : {}),
      ...(opts.partialDir ? { STUDIO_PARTIAL_DIR: opts.partialDir } : {}),
      ...(opts.offlineVoice ? { STUDIO_VOICE_OFFLINE: '1' } : {}),
    },
    onEvent: (e) => e.type === 'progress' && opts.onProgress?.(Number(e.t), Number(e.clips)),
    signal: opts.signal,
    tag: opts.tag,
  })
  try {
    return (await job.done).result
  } catch (e) {
    const err = e as Error & { cancelled?: boolean; event?: { message?: string; line?: number | null } }
    if (err.cancelled) throw err
    const line = err.event?.line
    throw new Error(`${line ? `scene.py line ${line}: ` : ''}${err.event?.message ?? err.message}`)
  }
}

export function cancel(quality: Quality = 'preview', dir = project()?.path): void {
  if (dir) running.get(key(dir, quality))?.cancel()
}

/** The project's preview render in flight, or a fresh one. */
export function currentOrNewRender(dir = requireProject().path): Promise<RenderOutcome> {
  return running.get(key(dir, 'preview'))?.outcome ?? render('preview', {}, dir)
}

export async function frame(t: number, width?: number): Promise<string> {
  const [out] = await frames([t], width, join(requireProject().path, '.studio', 'frames'))
  return out
}

/** Frames of the latest preview, extracted by one runner call into a fresh folder (parallel
 *  calls once shared a Date.now() filename and handed Claude each other's half-written PNGs). */
async function frames(times: number[], width: number | undefined, parent: string, dir = requireProject().path): Promise<string[]> {
  const timeline = readTimeline(dir)
  if (!timeline) throw new Error('Nothing has been rendered yet')
  const out = join(parent, randomUUID())
  mkdirSync(out, { recursive: true })
  const clamped = times.map((t) => Math.min(Math.max(t, 0), Math.max(timeline.duration - 0.01, 0)))
  const args = ['frames', timeline.video, out, '--times', clamped.join(','), ...(width ? ['--width', String(width)] : [])]
  const { paths } = await (await runRunner<{ paths: string[] }>('default', args)).done
  return paths
}

export async function framesBase64(times: number[], width?: number, dir = requireProject().path): Promise<string[]> {
  const outs = await frames(times, width, join(tmpdir(), 'manim-studio-frames'), dir)
  try {
    return outs.map((f) => readFileSync(f).toString('base64'))
  } finally {
    rmSync(dirname(outs[0]), { recursive: true, force: true })
  }
}

export async function frameBase64(t: number, width?: number): Promise<string> {
  return (await framesBase64([t], width))[0]
}

/** The thumbnail, and a commit for the user's own edits (Claude's turns commit once at their end). */
async function afterPreview(dir: string, open: boolean): Promise<void> {
  try {
    const out = join(dir, '.studio', 'thumbnail.jpg')
    await (
      await runRunner('default', ['thumbnail', join(dir, '.studio', 'preview', 'timeline.json'), out, '--width', '480'])
    ).done
  } catch {
    // a missing thumbnail is cosmetic
  }
  if (open && !commitsPaused) await commitAll(dir, 'Edit', 'user').catch(() => null)
}
