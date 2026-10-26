import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { ExportResult } from '../shared/types'
import { readAtomicJson } from './atomic-json.ts'

/** A durable receipt closes the gap between export completion and the next series checkpoint. */
export function completedExport(project: string, id: string): ExportResult | null {
  if (!/^[\w-]+$/.test(id)) return null
  return readAtomicJson(join(project, '.studio', 'completed-exports', `${id}.json`), (value): value is ExportResult => {
    const result = value as ExportResult | null
    return !!result && typeof result.folder === 'string' && Array.isArray(result.files) && result.files.length > 0
      && Array.isArray(result.warnings) && result.files.every((file) => typeof file === 'string' && existsSync(file)
        && statSync(file).isFile() && (/\.(srt|vtt)$/i.test(file) || statSync(file).size > 0))
  })
}
