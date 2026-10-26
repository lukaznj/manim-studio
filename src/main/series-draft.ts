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
