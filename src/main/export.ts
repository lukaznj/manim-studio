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
import { join, relative, sep } from 'node:path'
import type { ExportOptions, ExportResult, Timeline } from '../shared/types'
import { languageName, translateNarration } from './claude'
import { readMeta, readTimeline, slugify } from './projects'
import { renderFinal } from './render'
import { runRunner } from './runner'
import { voiceEnv } from './voice'

type Progress = (e: { stage: string; percent?: number }) => void

/** What an export needs from a project: everything but its history, caches and earlier exports. */
export function snapshotProject(project: string, to: string): void {
  const skip = new Set(['.git', '.studio', 'exports'])
  cpSync(project, to, { recursive: true, filter: (src) => !skip.has(relative(project, src).split(sep)[0]) })
}

/** Exports `project` by rendering a copy of it in `work` (an empty folder the caller removes). */
export async function exportVideo(project: string, work: string, options: ExportOptions, progress: Progress, signal?: AbortSignal): Promise<ExportResult> {
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
  const duration = readTimeline(project)?.duration
  const files: string[] = []
  const warnings: string[] = []
  const videos: string[] = []
  let timelinePath = ''

  try {
    for (const theme of themes) {
      const stage = themes.length > 1 ? `Rendering the ${theme} version` : 'Rendering at full quality'
      progress({ stage })
      await renderFinal(snap, meta, { theme, out: `final-${theme}`, size, fps }, {
        cacheDir: join(project, '.studio', 'cache'),
        signal,
        onProgress: (t) => progress({ stage, percent: duration ? Math.min(t / duration, 1) : undefined }),
      })
      progress({ stage: 'Saving the video' })
      const timeline = join(snap, '.studio', `final-${theme}`, 'timeline.json')
      const base = join(folder, themes.length > 1 ? `${slug}.${theme}` : slug)
      await (await runRunner('default', ['export', timeline, base], { signal })).done
      videos.push(`${base}.mp4`)
      files.push(`${base}.mp4`, `${base}.jpg`)
      // Subtitles don't depend on the theme: keep one set, named by language.
      for (const ext of ['srt', 'vtt']) {
        if (!timelinePath) renameSync(`${base}.${ext}`, join(folder, `${slug}.${original}.${ext}`))
        else rmSync(`${base}.${ext}`, { force: true })
      }
      timelinePath ||= timeline
    }
    files.push(join(folder, `${slug}.${original}.srt`), join(folder, `${slug}.${original}.vtt`))

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
