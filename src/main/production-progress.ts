import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { artifactProgress, type ProductionPhase, type ProductionProgress } from '../shared/production-progress'
import { readAtomicJson, writeAtomicJson } from './atomic-json'
import { readMeta } from './projects'

const file = (dir: string) => join(dir, '.studio', 'production-progress.json')
const previews = new Map<string, { completed: number; total: number }>()
export function previewProgress(dir: string, completed: number, total: number): void {
  previews.set(dir, { completed, total })
  if (previews.size > 100) previews.delete(previews.keys().next().value!)
}
const valid = (value: unknown): value is ProductionProgress => !!value && typeof value === 'object' &&
  Object.entries(value).every(([key, p]) => ['script', 'scene', 'check'].includes(key) && p &&
    Number.isFinite(p.completed) && Number.isFinite(p.total) && p.completed >= 0 && p.total >= 0 &&
    (p.done === undefined || typeof p.done === 'boolean') && (p.detail === undefined || typeof p.detail === 'string'))
const read = (name: string) => { try { return readFileSync(name, 'utf8') } catch { return '' } }

export function productionProgress(dir: string): ProductionProgress {
  readMeta(dir)
  const inferred = artifactProgress(read(join(dir, 'script.md')), read(join(dir, 'scene.py')))
  return { ...inferred, ...(readAtomicJson(file(dir), valid) ?? {}), preview: previews.get(dir) }
}

export function reportProgress(dir: string, phase: ProductionPhase, completed: number, total: number, detail?: string): void {
  if (!['script', 'scene'].includes(phase)) throw new Error('Report progress for script or scene only.')
  if (!Number.isInteger(completed) || !Number.isInteger(total) || completed < 0 || total < 1 || completed > total || total > 1000) throw new Error('Use completed sections between 0 and total (1–1000).')
  const progress = productionProgress(dir)
  delete progress.preview
  progress[phase] = { completed, total, detail: detail?.slice(0, 180) }
  writeAtomicJson(file(dir), progress)
}

export function finishProductionPhase(dir: string, phase: ProductionPhase): void {
  const progress = productionProgress(dir)
  delete progress.preview
  progress[phase] = { ...progress[phase], completed: progress[phase]?.total || 1, total: progress[phase]?.total || 1, done: true }
  writeAtomicJson(file(dir), progress)
}

export function beginProductionPhase(dir: string, phase: ProductionPhase): void {
  const progress = productionProgress(dir)
  delete progress.preview
  // A revision reopens its phase, preserving the last useful section count.
  if (progress[phase]?.done) progress[phase] = { ...progress[phase]!, done: false }
  if (phase === 'script') { delete progress.scene; delete progress.check }
  else if (phase === 'scene') delete progress.check
  writeAtomicJson(file(dir), progress)
}
