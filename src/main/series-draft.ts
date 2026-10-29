import { createHash } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { SeriesDraft } from '../shared/types'
import { paths } from './paths'
import { readAtomicJson, writeAtomicJson } from './atomic-json'

const file = () => join(paths.userData(), 'series-draft.json')
export function seriesDraft(): SeriesDraft | null {
  return readAtomicJson(file(), (value): value is SeriesDraft => {
    const draft = value as SeriesDraft | null
    return !!draft?.request && Array.isArray(draft.request.pdfs) && typeof draft.request.language === 'string'
  })
}

export function saveSeriesDraft(draft: SeriesDraft | null): void {
  // A tombstone also replaces the backup, so a discarded/started draft cannot reappear.
  writeAtomicJson(file(), draft)
  if (!draft) writeAtomicJson(file(), null)
}

/** Explicitly saved and attempted plans survive replacement of the current editing draft. */
export function saveSeriesPlan(draft: SeriesDraft): SeriesDraft {
  if (!draft.plan?.title || !Array.isArray(draft.plan.episodes) || !draft.plan.episodes.length) throw new Error('Plan the episodes before saving.')
  const id = createHash('sha256').update(JSON.stringify({ request: draft.request, plan: draft.plan })).digest('hex').slice(0, 32)
  const saved = { ...draft, id, savedAt: Date.now() }
  writeAtomicJson(join(paths.userData(), 'series-plans', `${id}.json`), saved)
  return saved
}

export function savedSeriesPlans(): SeriesDraft[] {
  const folder = join(paths.userData(), 'series-plans')
  if (!existsSync(folder)) return []
  return readdirSync(folder).filter((name) => /^[a-f0-9]{32}\.json$/.test(name)).flatMap((name) => {
    const plan = readAtomicJson(join(folder, name), (v): v is SeriesDraft => !!v && typeof v === 'object' && !!(v as SeriesDraft).plan?.title && Array.isArray((v as SeriesDraft).plan?.episodes) && Array.isArray((v as SeriesDraft).request?.pdfs))
    return plan ? [plan] : []
  }).sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))
}
