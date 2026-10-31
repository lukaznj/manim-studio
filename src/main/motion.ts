// Provider-neutral, deterministic browser graphics compiled to ordinary VideoClip media.
import { app, BrowserWindow, session } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types'
import { MOTION_CSP, MOTION_FPS, motionFrames, motionRequest, motionSize, motionSource, motionTimes, type MotionInput, type MotionSource } from '../shared/motion'
import { writeAtomicJson } from './atomic-json'
import { paths } from './paths'
import { readMeta } from './projects'
import { acquireDrawingSlot, runRunner } from './runner'
import { shutdownRequested } from './work-lifecycle'
import { ignoreMediaVideos } from './media'

type Task = { state: 'queued' | 'drawing' | 'encoding' | 'preview' | 'ready' | 'error'; completed: number; total: number; error?: string; done: Promise<void>; stop: AbortController }
const tasks = new Map<string, Task>()
export const motionsBusy = () => [...tasks.values()].some((t) => !['preview', 'ready', 'error'].includes(t.state))
export async function stopMotions(): Promise<void> {
  for (const task of tasks.values()) task.stop.abort()
  await Promise.allSettled([...tasks.values()].map((t) => t.done))
}

/** Refuse links escaping the project before creating or replacing source/media files. */
function mediaFolder(dir: string): string {
  const root = realpathSync(dir), folder = join(root, 'media')
  const rel = existsSync(folder) ? relative(root, realpathSync(folder)) : 'media'
  if (isAbsolute(rel) || rel.split(sep).includes('..')) throw new Error('The media folder must stay inside the project.')
  mkdirSync(folder, { recursive: true })
  return folder
}
function safeFile(folder: string, name: string): string {
  const file = join(folder, name)
  if (lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('Motion files cannot be symbolic links.')
  return file
}
const text = (value: string, error = false): CallToolResult => ({ content: [{ type: 'text', text: value }], ...(error ? { isError: true } : {}) })

export async function renderMotion(dir: string, input: MotionInput): Promise<CallToolResult> {
  try {
    if (shutdownRequested()) throw new Error('Studio is closing. Retry after reopening it.')
    const request = motionRequest.parse(input), mode = request.mode ?? 'preview'
    const folder = mediaFolder(dir), sourceFile = safeFile(folder, `motion-${request.name}.json`)
    let source: MotionSource
    if (request.html !== undefined) {
      if (mode !== 'preview') throw new Error('New HTML must be previewed first (mode preview).')
      source = motionSource.parse({ html: request.html, seconds: request.seconds, portrait: readMeta(dir).aspect === '9:16' })
      safeFile(realpathSync(dir), '.gitignore')
      ignoreMediaVideos(dir)
      safeFile(folder, `motion-${request.name}.json.bak`)
      safeFile(folder, `motion-${request.name}.json.bak.tmp`)
      writeAtomicJson(sourceFile, source)
    } else {
      if (request.seconds !== undefined) throw new Error('Supply seconds with HTML, or omit both to reuse the saved source.')
      if (!existsSync(sourceFile)) throw new Error('Start with mode preview, HTML and seconds.')
      source = motionSource.parse(JSON.parse(readFileSync(sourceFile, 'utf8')))
    }
    const hash = createHash('sha256').update(JSON.stringify([1, process.platform, request.name, source])).digest('hex').slice(0, 20)
    const projectHash = createHash('sha256').update(realpathSync(dir)).digest('hex').slice(0, 20)
    const cache = join(paths.renderCache(), 'motion', projectHash, hash)
    const name = `motion-${request.name}-${hash}.mp4`, output = safeFile(folder, name)
    const key = `${resolve(dir)}:${hash}:${mode === 'render' ? 'render' : 'preview'}`
    const pictures = [0, 1, 2].map((i) => join(cache, `preview-${i}.png`))
    const previewed = pictures.every((p) => existsSync(p) && statSync(p).size > 0)
    if (existsSync(output) && statSync(output).size > 0) return text(`Motion ready (cached). Use VideoClip(${JSON.stringify(name)}) in scene.py. Duration ${motionFrames(source.seconds) / MOTION_FPS}s, 1080p, ${MOTION_FPS}fps. Source: media/motion-${request.name}.json. Keep narration in StudioScene.`)
    if (mode === 'render' && !previewed) throw new Error('Preview and inspect the three frames before rendering this source.')
    let task = tasks.get(key)
    if (mode === 'status') task = tasks.get(`${resolve(dir)}:${hash}:render`) ?? task
    if (mode !== 'status' && (!task || ['error', 'preview', 'ready'].includes(task.state)) && !(mode === 'preview' && previewed)) {
      if (tasks.size > 60) for (const [id, old] of tasks) if (['preview', 'ready', 'error'].includes(old.state)) tasks.delete(id)
      task = { state: 'queued', completed: 0, total: mode === 'render' ? motionFrames(source.seconds) : 3, done: Promise.resolve(), stop: new AbortController() }
      tasks.set(key, task)
      task.done = draw(source, cache, output, mode === 'render', task).catch((error) => {
        task!.state = 'error'; task!.error = String(error?.message ?? error).slice(0, 1500)
      })
      // Preview is usually quick. Full clips always return promptly and are polled.
      if (mode === 'preview') {
        let timer: ReturnType<typeof setTimeout> | undefined
        await Promise.race([task.done, new Promise<void>((r) => { timer = setTimeout(r, 20_000) })])
        clearTimeout(timer)
      }
    }
    if (task?.state === 'error') return text(`Motion failed: ${task.error}. Fix the source and preview again, or use manim. Existing media is preserved.`, true)
    if (task && !['preview', 'ready'].includes(task.state)) return text(`Motion ${task.state}: ${task.completed}/${task.total} frames. Poll render_motion with name ${JSON.stringify(request.name)} and mode status; do not resend HTML or start another render.`)
    if (mode === 'status' && !previewed) return text('No motion job is running. Call mode preview to resume from the saved source.')
    return {
      content: [
        { type: 'text', text: `Preview ready: ${source.seconds}s, 1080p, ${MOTION_FPS}fps. Inspect these frames before calling mode render with just name ${JSON.stringify(request.name)}. Rendering makes a reusable MP4, not a new agent request. This does not include narration.` },
        ...pictures.flatMap((file, i) => [{ type: 'text' as const, text: `${motionTimes(source.seconds)[i].toFixed(2)}s` }, { type: 'image' as const, data: readFileSync(file).toString('base64'), mimeType: 'image/png' }]),
      ],
    }
  } catch (error) { return text((error as Error).message, true) }
}

async function draw(source: MotionSource, cache: string, output: string, full: boolean, task: Task): Promise<void> {
  const release = await acquireDrawingSlot(task.stop.signal)
  let win: BrowserWindow | undefined
  const partition = session.fromPartition(`motion-${randomUUID()}`, { cache: false })
  const url = 'studio-motion://frame/index.html'
  const scratch = join(cache, `frames-${randomUUID()}`)
  const delivery = join(dirname(output), `.motion-${randomUUID()}.tmp`)
  let timeout: ReturnType<typeof setTimeout> | undefined
  const abort = () => { if (win && !win.isDestroyed()) win.destroy() }
  try {
    timeout = setTimeout(() => task.stop.abort(), 120_000)
    task.stop.signal.addEventListener('abort', abort)
    if (task.stop.signal.aborted) throw new Error('Motion stopped. Retry from the saved source.')
    partition.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    partition.setPermissionCheckHandler(() => false)
    partition.webRequest.onBeforeRequest((details, callback) => callback({ cancel: details.url !== url && !details.url.startsWith('data:') }))
    partition.protocol.handle('studio-motion', () => new Response(source.html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': MOTION_CSP } }))
    const size = motionSize(source.portrait)
    win = new BrowserWindow({
      ...size, useContentSize: true, show: false, backgroundColor: '#0b1724',
      webPreferences: { session: partition, offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false, spellcheck: false, disableDialogs: true },
    })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (event) => event.preventDefault())
    win.webContents.on('will-redirect', (event) => event.preventDefault())
    win.webContents.on('will-attach-webview', (event) => event.preventDefault())
    win.webContents.setZoomFactor(1)
    const contents = win.webContents
    const checked = async <T>(work: Promise<T>): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        return await Promise.race([work, new Promise<never>((_r, reject) => { timer = setTimeout(() => { abort(); reject(new Error('Motion frame took too long. Remove loops, timers and external resources.')) }, 5000) })])
      } finally { clearTimeout(timer) }
    }
    await checked(win.loadURL(url))
    await checked(contents.executeJavaScript("document.fonts.ready.then(() => { if (typeof window.renderFrame !== 'function') throw Error('Define window.renderFrame(seconds) to seek the animation.'); return true })"))
    mkdirSync(scratch, { recursive: true })
    task.state = 'drawing'
    const times = full ? Array.from({ length: task.total }, (_, i) => i / MOTION_FPS) : motionTimes(source.seconds)
    for (let i = 0; i < times.length; i++) {
      if (task.stop.signal.aborted || win.isDestroyed()) throw new Error('Motion stopped. Retry from the saved source.')
      await checked(contents.executeJavaScript(`(async () => { await window.renderFrame(${times[i]}); for (const animation of document.getAnimations()) { animation.pause(); animation.currentTime = ${times[i] * 1000}; } await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); return true })()`))
      const bitmap = await checked(contents.capturePage())
      if (bitmap.isEmpty()) throw new Error('Motion produced an empty frame.')
      const png = bitmap.resize(full ? size : { width: source.portrait ? 480 : 854 }).toPNG()
      writeFileSync(full ? join(scratch, `${String(i).padStart(4, '0')}.png`) : join(cache, `preview-${i}.png`), png)
      task.completed = i + 1
    }
    win.destroy(); win = undefined
    if (full) {
      task.state = 'encoding'
      const encoded = join(scratch, 'clip.mp4')
      await (await runRunner('default', ['motion-encode', scratch, encoded, '--fps', String(MOTION_FPS)], { signal: task.stop.signal })).done
      if (task.stop.signal.aborted) throw new Error('Motion stopped. Retry from the saved source.')
      // Encode in disposable cache, then publish atomically even across disks. A killed
      // Python process cannot leave a partial MP4 appearing in the project's Media tab.
      copyFileSync(encoded, delivery, constants.COPYFILE_EXCL)
      renameSync(delivery, output)
      task.state = 'ready'
    } else task.state = 'preview'
  } finally {
    clearTimeout(timeout)
    task.stop.signal.removeEventListener('abort', abort)
    abort()
    rmSync(scratch, { recursive: true, force: true })
    rmSync(delivery, { force: true })
    partition.webRequest.onBeforeRequest(null)
    partition.protocol.unhandle('studio-motion')
    await partition.clearStorageData().catch(() => undefined)
    release()
  }
}
