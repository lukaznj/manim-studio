// Projects whose folder was moved: the user points at one again, and the others moved with it
// are found by name next to it. Plain fs, so it runs under node:test.
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const isProject = (dir: string) => existsSync(join(dir, 'project.json'))

/** Where a moved project in `recent` now is, given that `from` turned out to be at `to`. */
function candidates(missing: string, from: string, to: string): string[] {
  const name = basename(missing)
  const oldParent = dirname(missing)
  const out = [join(dirname(to), name)] // moved next to it
  // Its folder moved with it, e.g. a series folder next to the project that was found again.
  if (oldParent !== dirname(from)) out.push(join(dirname(to), basename(oldParent), name))
  // It sat in a folder next to the one that moved, and that folder moved along too.
  if (dirname(oldParent) === dirname(dirname(from))) out.push(join(dirname(dirname(to)), basename(oldParent), name))
  return out
}

/**
 * Replaces `from` with `to` in the recent projects list, then looks for the other missing projects
 * next to `to`, one level, by folder name. Returns the new list and every [old, new] pair.
 */
export function relocate(recent: string[], from: string, to: string): { recent: string[]; moved: [string, string][] } {
  const moved: [string, string][] = [[from, to]]
  const taken = new Set([...recent.filter(isProject), to])
  for (const missing of recent) {
    if (missing === from || isProject(missing)) continue
    const found = candidates(missing, from, to).find((dir) => !taken.has(dir) && isProject(dir))
    if (found) {
      moved.push([missing, found])
      taken.add(found)
    }
  }
  const map = new Map(moved)
  const out: string[] = []
  for (const p of recent) {
    const next = map.get(p) ?? p
    if (!out.includes(next)) out.push(next)
  }
  return { recent: out, moved }
}

/** The series folder an episode at `dir` should point at, when its stored one is gone; else null. */
export function movedSeriesFolder(dir: string): string | null {
  try {
    const folder = (JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')) as { series?: { folder?: string } }).series?.folder
    if (!folder || existsSync(join(folder, 'series.json'))) return null
    return existsSync(join(dirname(dir), 'series.json')) ? dirname(dir) : null
  } catch {
    return null
  }
}
