// Save video (ADR 0062): a copy of a project's newest export in a folder of the user's choice,
// Downloads by default, named after the video. Its subtitles go beside it as an .srt (players
// pick a same-named file up), are burned in with the viewer's subtitle style, or are left out.
import { app } from 'electron'
import { copyFileSync, existsSync, renameSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import type { SubtitleCopy, VideoCopyInfo } from '../shared/types'
import { subtitleStyle } from '../shared/subtitle-style'
import { readMeta } from './projects'
import { runRunner } from './runner'
import { getSettings, setSettings } from './settings'
import { exported } from './watch'
import { freeName } from './file-name'

/** The export's subtitles in the narration's language: <name>.<lang>.srt beside <name>[.<theme>].mp4. */
function subtitlesOf(project: string, video: string): string | undefined {
  const srt = join(dirname(video), `${basename(video).replace(/(\.(dark|light))?\.mp4$/, '')}.${readMeta(project).voice.language}.srt`)
  return existsSync(srt) ? srt : undefined
}

export function videoCopyInfo(project: string): VideoCopyInfo {
  const video = exported(project)
  const saved = getSettings().saveCopy
  const folder = saved?.folder && existsSync(saved.folder) ? saved.folder : app.getPath('downloads')
  return { name: readMeta(project).name, video, subtitles: !!(video && subtitlesOf(project, video)), folder, mode: saved?.subtitles ?? 'file' }
}

export async function saveVideoCopy(
  project: string,
  options: { folder: string; subtitles: SubtitleCopy },
  progress: (percent: number) => void,
): Promise<string[]> {
  const video = exported(project)
  if (!video) throw new Error('This video hasn’t been exported yet. Export it first, then save a copy.')
  if (!existsSync(options.folder) || !statSync(options.folder).isDirectory()) throw new Error('That folder isn’t there any more. Choose another one.')
  const meta = readMeta(project)
  const srt = subtitlesOf(project, video)
  const dest = freeName(options.folder, meta.name, extname(video))
  const saved = [dest]
  if (options.subtitles === 'burn') {
    if (!srt) throw new Error('This export has no subtitles to burn in. Export the video again, then save a copy.')
    const partial = join(options.folder, `.${basename(dest)}.partial.mp4`)
    try {
      const job = await runRunner(
        'default',
        ['burn-subtitles', video, srt, partial, '--style', JSON.stringify(subtitleStyle(getSettings().subtitleStyle)), ...(meta.captionBand ? ['--band'] : [])],
        { onEvent: (e) => e.type === 'progress' && typeof e.percent === 'number' && progress(e.percent) },
      )
      await job.done
      renameSync(partial, dest)
    } finally {
      rmSync(partial, { force: true })
    }
  } else {
    copyFileSync(video, dest)
    if (options.subtitles === 'file' && srt) {
      // The same name as the video, so players (VLC, QuickTime with a plug-in, TVs) load it by themselves.
      const subtitles = `${dest.slice(0, -extname(dest).length)}.srt`
      copyFileSync(srt, subtitles)
      saved.push(subtitles)
    }
  }
  setSettings({ saveCopy: { folder: options.folder, subtitles: options.subtitles } })
  return saved
}
