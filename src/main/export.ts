// Export: everything a video needs to be published, in <folder>/<name>/ (ADR 0013). The folder is
// the project's exports/ unless the export dialog chose another one.
//   <name>.mp4 (or <name>.dark.mp4 + <name>.light.mp4)   the video, one per chosen theme
//   <name>.jpg (per theme)                               the thumbnail
//   <name>.<lang>.srt / .vtt                             subtitles, the original language and each extra one
//   <name>.<lang>.m4a                                    each extra language's narration, as an audio track
//   <name>[.<theme>].<lang>.mp4                          optional: a full video per extra language
// The names follow what YouTube asks for: one video, then an audio track and a subtitle file per language.
//
// An export works on its own copy of the project (`snapshotProject`), so the queue (exports.ts) can
// run it while the project is edited, closed or swapped for another. Narration it generates is
// copied back, so it's never paid for twice.
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { availableParallelism, totalmem } from 'node:os'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { dirname, join, relative, sep } from 'node:path'
import type { ExportOptions, ExportResult, ProjectMeta, Timeline } from '../shared/types'
import { languageName, translateNarration } from './claude'
import { readMeta, readTimeline, slugify } from './projects'
import { exportEncoder, partialFolder } from './encoder'
import { renderFinal, type RenderVariant } from './render'
import { renderRemote } from './remote'
import { runRunner } from './runner'
import { voiceEnv } from './voice'

type Progress = (e: { stage: string; percent?: number }) => void

/** What an export needs from a project: everything but its history, caches and earlier exports. */
export function snapshotProject(project: string, to: string): void {
  const skip = new Set(['.git', '.studio', 'exports'])
  cpSync(project, to, { recursive: true, filter: (src) => !skip.has(relative(project, src).split(sep)[0]) })
}

/** The thumbnail's words: a series episode or an exercise gets its number and its series' or set's name. */
function cardArgs(meta: ProjectMeta): string[] {
  const badge = meta.series ? `#${meta.series.episode}` : meta.exercise ? `#${meta.exercise.number}` : ''
  const kicker = meta.series?.title ?? meta.exercise?.title ?? ''
  return ['--text', meta.name, ...(badge ? ['--badge', badge] : []), ...(kicker ? ['--kicker', kicker] : [])]
}

/** Exports `project` by rendering a copy of it in `work` (an empty folder the caller removes). */
export async function exportVideo(project: string, work: string, options: ExportOptions, progress: Progress, signal?: AbortSignal, tag?: string): Promise<ExportResult> {
  progress({ stage: 'Copying the project' })
  const snap = join(work, 'project')
  snapshotProject(project, snap)
  const meta = readMeta(snap)
  const slug = slugify(meta.name)
  const folder = join(options.folder ?? meta.export?.folder ?? join(project, 'exports'), slug)
  mkdirSync(folder, { recursive: true })
  const original = meta.voice.language
  const themes = options.themes.length ? options.themes : [meta.theme]
  // Claude Desktop's export_video passes no choices: it gets the project's last ones.
  const size = options.size ?? meta.export?.size ?? 1080
  const fps = options.fps ?? meta.export?.fps ?? meta.fps ?? 30
  const last = readTimeline(project)
  const duration = last?.duration
  const animations = last?.clips.length ?? 0 // one per play() and wait(), as manim counts them
  const files: string[] = []
  const warnings: string[] = []
  const videos: string[] = []
  let timelinePath = ''

  /** A theme's rendered video in `base`: keep it, and one set of subtitles named by language. */
  const cards: { base: string; timeline: string }[] = []
  const keep = (theme: string, base: string, timeline: string) => {
    cards.push({ base, timeline })
    videos.push(`${base}.mp4`)
    files.push(`${base}.mp4`, `${base}.jpg`)
    // Subtitles don't depend on the theme.
    for (const ext of ['srt', 'vtt']) {
      if (!timelinePath) renameSync(`${base}.${ext}`, join(folder, `${slug}.${original}.${ext}`))
      else rmSync(`${base}.${ext}`, { force: true })
    }
    timelinePath ||= timeline
  }

  try {
    if (options.server) {
      // On a render server (ADR 0021): the narration is made here first, since the server has no voice.
      progress({ stage: 'Making the narration' })
      await (await runRunner('default', ['render', snap, '--quality', 'preview', '--voice-only', '--out', 'voice-only'], { extraEnv: await voiceEnv(meta, snap), signal, tag })).done
      progress({ stage: 'Packing the project' })
      const archive = join(work, 'project.tar.gz')
      await packProject(snap, archive)
      // project.json's voice as is: narration is keyed by paths inside the project, so the server finds it.
      await renderRemote(options.server, archive, { themes, size, fps, slug, voice: meta.voice, animations, duration, cacheKey: createHash('sha1').update(project).digest('hex').slice(0, 16) }, folder, progress, signal)
      for (const theme of themes) {
        // The server's timeline goes where a local render's would, for dubbing below.
        const timeline = join(snap, '.studio', `final-${theme}`, 'timeline.json')
        mkdirSync(dirname(timeline), { recursive: true })
        renameSync(join(folder, `timeline.${theme}.json`), timeline)
        keep(theme, join(folder, themes.length > 1 ? `${slug}.${theme}` : slug), timeline)
      }
    } else {
      // The GPU's video encoder when one works here (ADR 0034); if it fails, the CPU's, for the rest of the export.
      let encoder = await exportEncoder()
      for (const theme of themes) {
        const stage = themes.length > 1 ? `Rendering the ${theme} version` : 'Rendering at full quality'
        const parts = await renderSlices(snap, meta, { theme, size, fps, encoder }, join(project, '.studio', 'cache'), animations, (p, n) => progress({ stage: `${stage}: ${n} parts at once`, percent: p }), signal, tag)
        const final = (on: string | undefined) =>
          renderFinal(snap, meta, { theme, out: `final-${theme}`, size, fps, encoder: on }, {
            cacheDir: join(project, '.studio', 'cache'),
            signal,
            tag,
            onProgress: (t) => progress({ stage: parts > 1 ? `${stage}: joining the parts` : stage, percent: duration ? Math.min(t / duration, 1) : undefined }),
          })
        progress({ stage: parts > 1 ? `${stage}: joining the parts` : stage })
        try {
          await final(encoder)
        } catch (e) {
          if (!encoder || signal?.aborted || (e as { cancelled?: boolean }).cancelled) throw e
          const why = (e as Error).message.replace(/^scene\.py line \d+: /, '').split(':')[0]
          warnings.push(`The GPU’s video encoder (${encoder}) failed with ${why}, so this video was encoded on the CPU. Settings → Environment can turn GPU encoding off.`)
          encoder = undefined
          progress({ stage: `${stage} on the CPU` })
          await final(undefined)
        }
        progress({ stage: 'Saving the video' })
        const timeline = join(snap, '.studio', `final-${theme}`, 'timeline.json')
        const base = join(folder, themes.length > 1 ? `${slug}.${theme}` : slug)
        await (await runRunner('default', ['export', timeline, base], { signal, tag })).done
        keep(theme, base, timeline)
      }
    }
    files.push(join(folder, `${slug}.${original}.srt`), join(folder, `${slug}.${original}.vtt`))

    // The thumbnail made for publishing (card.py): the key picture, its hook, number and series.
    progress({ stage: 'Making the thumbnail' })
    for (const c of cards) {
      try {
        await (await runRunner('default', ['thumbnail-card', c.timeline, `${c.base}.jpg`, ...cardArgs(meta)], { signal, tag })).done
      } catch (e) {
        if (signal?.aborted) throw e
        warnings.push(`The thumbnail stayed a plain frame: ${(e as Error).message}`)
      }
    }

    const narration = [...new Set((JSON.parse(readFileSync(timelinePath, 'utf8')) as Timeline).voice.map((v) => v.text))]
    for (const lang of options.languages.filter((l) => l !== original)) {
      const name = languageName(lang)
      progress({ stage: `Translating the narration into ${name}` })
      const translations = await translationFile(project, narration, original, lang)
      progress({ stage: `Voicing ${name}` })
      const env = await voiceEnv({ ...meta, voice: { ...meta.voice, language: lang } }, snap)
      const args = ['dub', timelinePath, translations, lang, join(folder, slug), ...(options.languageVideos ? videos.flatMap((v) => ['--video', v]) : [])]
      const job = await runRunner<{ files: string[]; warnings: string[] }>('default', args, {
        extraEnv: env,
        signal,
        tag,
        onEvent: (e) => {
          if (e.type === 'progress') progress({ stage: `Voicing ${name}`, percent: Number(e.done) / Number(e.total) })
        },
      })
      const dubbed = await job.done
      files.push(...dubbed.files)
      warnings.push(...dubbed.warnings.map((w) => `${name}: ${w}`))
    }
  } finally {
    keepNarration(snap, project)
  }
  return { folder, files, warnings }
}

/**
 * Parallel exports: before the final render, separate processes draw slices of the animations at
 * the same time, each into its own folders (a shared cache would let one read another's
 * half-written file). The pieces of each slice that succeeded move into the project's cache, where
 * the final render finds them and only joins them, so the timeline, subtitles and audio come out
 * exactly as from one render. A slice that fails costs only time: the final render draws what it
 * doesn't find. Slices use only narration that exists (STUDIO_VOICE_OFFLINE), so none is paid twice.
 * Measured: a 3-minute, 120-animation export on a 10-core Mac took 39 s instead of 72 s.
 */
async function renderSlices(
  snap: string,
  meta: ProjectMeta,
  variant: RenderVariant,
  cacheDir: string,
  animations: number,
  progress: (percent: number, slices: number) => void,
  signal?: AbortSignal,
  tag?: string,
): Promise<number> {
  const slices = sliceCount(animations, availableParallelism(), totalmem())
  if (slices < 2) return 1
  const size = Math.ceil(animations / slices)
  let done = 0
  progress(0, slices)
  const results = await Promise.allSettled(
    Array.from({ length: slices }, async (_, i) => {
      const own = join(snap, '.studio', `slice-${i}`)
      // The project's text and formula caches, so each slice doesn't typeset everything again.
      for (const kind of ['texts', 'Tex']) if (existsSync(join(cacheDir, kind))) cpSync(join(cacheDir, kind), join(own, 'cache', kind), { recursive: true })
      const timeline = await renderFinal(
        snap,
        meta,
        { ...variant, out: `slice-${i}`, from: i * size, upto: i === slices - 1 ? undefined : (i + 1) * size - 1 },
        { cacheDir: join(own, 'cache'), partialDir: join(own, 'partial'), signal, offlineVoice: true, tag },
      ).finally(() => progress(++done / slices, slices))
      return { pieces: join(own, 'partial'), shared: join(cacheDir, 'partial', partialFolder(timeline.width, timeline.height, timeline.fps, variant.encoder)) }
    }),
  )
  if (signal?.aborted) throw Object.assign(new Error('cancelled'), { cancelled: true })
  for (const r of results) {
    if (r.status !== 'fulfilled' || !existsSync(r.value.pieces)) continue
    mkdirSync(r.value.shared, { recursive: true })
    for (const name of readdirSync(r.value.pieces))
      if (name.endsWith('.mp4') && !existsSync(join(r.value.shared, name))) copyFileSync(join(r.value.pieces, name), join(r.value.shared, name)) // the copy may sit on another disk
  }
  return slices
}

/**
 * How many slices: each uses about two cores (video encoding is threaded) and up to about 700 MB, so
 * one per 2.5 GB of memory leaves room for the app and the rest of the computer (free memory says
 * little on macOS, which keeps it full of caches); at least 8 animations each, and at most 6.
 */
export function sliceCount(animations: number, cores: number, totalBytes: number): number {
  return Math.max(1, Math.min(Math.floor(cores / 2), Math.floor(totalBytes / 2.5e9), Math.floor(animations / 8), 6))
}

/** The project copy as a tar.gz for a render server, without the copy's own caches. tar ships with macOS, Linux and Windows 10+. */
function packProject(snap: string, archive: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tar = spawn('tar', ['-czf', archive, '--exclude', './.studio', '-C', snap, '.'], { windowsHide: true })
    let err = ''
    tar.stderr.on('data', (b: Buffer) => (err += b.toString()))
    tar.on('error', reject)
    tar.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Packing the project failed: ${err.trim() || `tar exited with ${code}`}`))))
  })
}

/** Narration the copy generated (any language) goes back to the project, so it isn't made again. */
function keepNarration(snap: string, project: string): void {
  const from = join(snap, 'voice', 'tts')
  const to = join(project, 'voice', 'tts')
  if (!existsSync(from)) return
  mkdirSync(to, { recursive: true })
  for (const name of readdirSync(from)) if (!existsSync(join(to, name))) copyFileSync(join(from, name), join(to, name))
}

/**
 * The narration in another language, kept in voice/translations/<lang>.json (original sentence →
 * translation) so it is translated once, travels with the project, and can be corrected by hand.
 * Only sentences it doesn't have yet go to Claude. Returns the file's path.
 */
async function translationFile(dir: string, narration: string[], from: string, to: string): Promise<string> {
  const file = join(dir, 'voice', 'translations', `${to}.json`)
  const known: Record<string, string> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  const missing = narration.filter((s) => !known[s])
  const done = await translateNarration(missing, from, to)
  missing.forEach((s, i) => (known[s] = done[i]))
  mkdirSync(join(dir, 'voice', 'translations'), { recursive: true })
  writeFileSync(file, JSON.stringify(known, null, 2))
  return file
}
