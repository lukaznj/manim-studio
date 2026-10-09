// The project's own pictures and videos, in <project>/media/ (ADR 0012). Scenes use them through
// studio's image() and VideoClip(); the Media panel imports, previews and removes them.
import { dialog, shell } from 'electron'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { MediaItem } from '../shared/types'
import { requireProject } from './projects'
import { runRunner } from './runner'
import { slugify } from './slug'

const IMAGE = /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i
const VIDEO = /\.(mp4|mov|m4v|webm|mkv)$/i

const folder = () => join(requireProject().path, 'media')
const thumbs = () => join(requireProject().path, '.studio', 'media')

export async function listMedia(): Promise<MediaItem[]> {
  const dir = folder()
  if (!existsSync(dir)) return []
  const items: MediaItem[] = []
  for (const name of readdirSync(dir).sort()) {
    const kind = IMAGE.test(name) ? 'image' : VIDEO.test(name) ? 'video' : null
    if (!kind) continue
    const path = join(dir, name)
    items.push({ name, kind, size: statSync(path).size, thumb: kind === 'image' ? path : await videoThumb(name) })
  }
  return items
}

/** Copies files into media/ under tidy names ("My Photo.PNG" → my-photo.png). With no paths, asks with a dialog. */
export async function importMedia(paths: string[]): Promise<MediaItem[]> {
  if (!paths.length) {
    const picked = await dialog.showOpenDialog({
      title: 'Add pictures and videos',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Pictures and videos', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'mp4', 'mov', 'm4v', 'webm', 'mkv'] }],
    })
    paths = picked.filePaths
  }
  const dir = folder()
  mkdirSync(dir, { recursive: true })
  const skipped: string[] = []
  for (const src of paths) {
    if (!IMAGE.test(src) && !VIDEO.test(src)) {
      skipped.push(basename(src))
      continue
    }
    const ext = extname(src).toLowerCase()
    const stem = slugify(basename(src, extname(src))) || 'media'
    let name = `${stem}${ext}`
    for (let i = 2; existsSync(join(dir, name)); i++) name = `${stem}-${i}${ext}`
    copyFileSync(src, join(dir, name))
    if (VIDEO.test(name)) ignoreVideos()
  }
  if (skipped.length) throw new Error(`Only pictures and videos can be added; skipped ${skipped.join(', ')}.`)
  return listMedia()
}

/** To the Trash, not deleted: a scene may still use it. */
export async function removeMedia(name: string): Promise<MediaItem[]> {
  const path = join(folder(), basename(name))
  if (existsSync(path)) await shell.trashItem(path)
  return listMedia()
}

/** A frame from half a second in, made once per video. */
async function videoThumb(name: string): Promise<string | undefined> {
  const out = join(thumbs(), `${name}.png`)
  if (existsSync(out)) return out
  mkdirSync(thumbs(), { recursive: true })
  try {
    await (await runRunner('default', ['frame', join(folder(), name), '0.5', out, '--width', '320'])).done
    return out
  } catch {
    return undefined // still listed, just without a picture
  }
}

/** Videos stay out of the version history (pictures go in); older projects get the rule on first import. */
function ignoreVideos(): void {
  const file = join(requireProject().path, '.gitignore')
  const rules = existsSync(file) ? readFileSync(file, 'utf8') : ''
  if (rules.includes('media/*.mp4')) return
  appendFileSync(file, '\n# Your videos in media/ are usually big; pictures are kept in the history.\n' + ['mp4', 'mov', 'm4v', 'webm', 'mkv'].map((e) => `media/*.${e}`).join('\n') + '\n')
}
