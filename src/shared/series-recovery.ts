import type { ExportOptions, SeriesRun } from './types'

export interface SeriesCheckpoint { run: SeriesRun; exportOptions: ExportOptions }
const states = new Set(['waiting', 'script', 'scripted', 'scene', 'check', 'export', 'done', 'failed', 'stopped'])

export function isSeriesCheckpoint(value: unknown): value is SeriesCheckpoint {
  const saved = value as SeriesCheckpoint | null
  return !!saved && !!saved.run && typeof saved.run.folder === 'string' && typeof saved.run.title === 'string'
    && ['working', 'paused', 'stopped', 'done', 'queued'].includes(saved.run.state)
    && Array.isArray(saved.run.episodes) && saved.run.episodes.length > 0
    && saved.run.episodes.every((ep) => typeof ep.dir === 'string' && typeof ep.title === 'string' && states.has(ep.state) && Array.isArray(ep.warnings))
    && !!saved.exportOptions && Array.isArray(saved.exportOptions.themes) && Array.isArray(saved.exportOptions.languages)
}

/** Recovery never spends account usage without Continue. Finished episodes and user holds survive. */
export function recoverSeries(run: SeriesRun): SeriesRun {
  const recovered = structuredClone(run)
  if (recovered.state === 'working' || recovered.state === 'paused') recovered.state = 'stopped'
  delete recovered.agents // never restore the old concurrency ceiling
  for (const ep of recovered.episodes) {
    ep.activity = undefined
    ep.limitedUntil = undefined
  }
  return recovered
}
