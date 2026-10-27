import { readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { ProjectMeta } from '../shared/types'
const json = <T>(file: string): T | null => { try { return JSON.parse(readFileSync(file, 'utf8')) as T } catch { return null } }

/** Real paths prevent a course manifest or symlink from admitting files outside that course. */
export function studyPath(root: string, ...parts: string[]): string | null {
  try {
    const file = resolve(root, ...parts), inside = relative(realpathSync(root), realpathSync(file))
    return inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside) ? file : null
  } catch { return null }
}
export function studyCourseRoot(dir: string, meta: ProjectMeta): string | null {
  const exercise = meta.exercise?.set && studyPath(dirname(meta.exercise.set), dir) ? json<{ course?: string }>(join(meta.exercise.set, 'exercises.json')) : null
  const root = meta.series?.folder ?? exercise?.course
  if (!root || !studyPath(root, dir)) return null
  const course = json<{ episodes: string[] }>(join(root, 'series.json'))
  if (!Array.isArray(course?.episodes)) return null
  const names = course.episodes.filter((name) => typeof name === 'string' && basename(name) === name && name !== '..')
  const original = names.some((name) => resolve(root, name) === resolve(dir))
  const extra = !!meta.extra && names.includes(meta.extra.of) && !!studyPath(join(root, 'extras'), dir)
  const exerciseHere = exercise?.course === root && !!meta.exercise && !!studyPath(join(root, 'exercises'), dir)
  return original || extra || exerciseHere ? root : null
}
