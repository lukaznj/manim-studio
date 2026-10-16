// Whether a video was watched (episodes, follow-ups, exercises): in the project's .studio/, so it
// stays with the project folder. Marked when the player passes 90%, or by hand.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const file = (dir: string) => join(dir, '.studio', 'watched.json')

export function isWatched(dir: string): boolean {
  try {
    return existsSync(file(dir)) && (JSON.parse(readFileSync(file(dir), 'utf8')) as { watched?: boolean }).watched === true
  } catch {
    return false
  }
}

export function writeWatched(dir: string, watched: boolean): void {
  mkdirSync(join(dir, '.studio'), { recursive: true })
  writeFileSync(file(dir), JSON.stringify({ watched, at: new Date().toISOString() }))
}
