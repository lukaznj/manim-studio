import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** A file name from a title, safe on every system, and free in the folder ("Name (2).mp4"). */
export function freeName(folder: string, title: string, ext: string, taken: (path: string) => boolean = existsSync): string {
  const base =
    title
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/, '')
      .slice(0, 120) || 'Video'
  for (let n = 1; ; n++) {
    const path = join(folder, `${base}${n > 1 ? ` (${n})` : ''}${ext}`)
    if (!taken(path)) return path
  }
}
