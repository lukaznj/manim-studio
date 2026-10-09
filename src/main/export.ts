// Export: everything a video needs to be published, in exports/<name>/ (ADR 0012).
//   <name>.mp4 (or <name>.dark.mp4 + <name>.light.mp4)   the video, one per chosen theme
//   <name>.jpg (per theme)                               the thumbnail
//   <name>.<lang>.srt / .vtt                             subtitles, the original language and each extra one
//   <name>.<lang>.m4a                                    each extra language's narration, as an audio track
//   <name>[.<theme>].<lang>.mp4                          optional: a full video per extra language
// The names follow what YouTube asks for: one video, then an audio track and a subtitle file per language.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ExportOptions, ExportResult, Timeline } from '../shared/types'
import { languageName, translateNarration } from './claude'
import { requireProject, slugify } from './projects'
import { render } from './render'
import { runRunner } from './runner'
import { voiceEnv } from './voice'

type Progress = (e: { stage: string; percent?: number }) => void

export async function exportVideo(options: ExportOptions, progress: Progress): Promise<ExportResult> {
  const p = requireProject()
  const slug = slugify(p.meta.name)
  const folder = join(p.path, 'exports', slug)
  mkdirSync(folder, { recursive: true })
  const original = p.meta.voice.language
  const themes = options.themes.length ? options.themes : [p.meta.theme]
  const files: string[] = []
  const warnings: string[] = []
  const videos: string[] = []
  let timelinePath = ''

  for (const theme of themes) {
    progress({ stage: themes.length > 1 ? `Rendering the ${theme} version` : 'Rendering at full quality' })
    const outcome = await render('final', { theme, out: `final-${theme}` })
    if ('error' in outcome) throw new Error(outcome.error.message)
    if ('cancelled' in outcome) throw new Error('The export was cancelled')
    progress({ stage: 'Saving the video' })
    const timeline = join(p.path, '.studio', `final-${theme}`, 'timeline.json')
    const base = join(folder, themes.length > 1 ? `${slug}.${theme}` : slug)
    await (await runRunner('default', ['export', timeline, base])).done
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
    const translations = await translationFile(p.path, narration, original, lang)
    progress({ stage: `Voicing ${name}` })
    const env = await voiceEnv({ ...p.meta, voice: { ...p.meta.voice, language: lang } }, p.path)
    const args = ['dub', timelinePath, translations, lang, join(folder, slug), ...(options.languageVideos ? videos.flatMap((v) => ['--video', v]) : [])]
    const job = await runRunner<{ files: string[]; warnings: string[] }>('default', args, {
      extraEnv: env,
      onEvent: (e) => {
        if (e.type === 'progress') progress({ stage: `Voicing ${name}`, percent: Number(e.done) / Number(e.total) })
      },
    })
    const dubbed = await job.done
    files.push(...dubbed.files)
    warnings.push(...dubbed.warnings.map((w) => `${name}: ${w}`))
  }
  return { folder, files, warnings }
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
