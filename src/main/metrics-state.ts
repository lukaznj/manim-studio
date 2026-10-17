import type { ProjectMeta } from '../shared/types'

// Export snapshots retain the series reference, so their narration is charged to the source episode.
const voices = new Map<string, string>()
const key = (meta: ProjectMeta) => (meta.series ? `${meta.series.folder}:${meta.series.episode}` : '')
export const voiceMetricsFile = (meta: ProjectMeta): string | undefined => voices.get(key(meta))
export function bindVoiceMetrics(meta: ProjectMeta, file?: string): void {
  if (file) voices.set(key(meta), file)
  else voices.delete(key(meta))
}
