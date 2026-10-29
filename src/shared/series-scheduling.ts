import type { EpisodeRun, SeriesRun } from './types'

/** Queue intent survives restart, but only an explicitly enabled session may start paid work. */
export function nextQueuedSeries(runs: SeriesRun[], enabled: boolean): SeriesRun | undefined {
  if (!enabled || runs.some((run) => run.state === 'working')) return undefined
  return runs.filter((run) => run.state === 'queued').sort((a, b) => (a.queuedAt ?? 0) - (b.queuedAt ?? 0))[0]
}

/** Scripts keep their order; every independent ready video may start, with no agent ceiling. */
export function nextSeriesTask(episodes: EpisodeRun[], active: ReadonlyMap<string, 'script' | 'video'>): { episode: EpisodeRun; kind: 'script' | 'video' } | null {
  const eligible = (episode: EpisodeRun) => !episode.held && !active.has(episode.dir)
  if (![...active.values()].includes('script')) {
    const episode = episodes.find((ep) => eligible(ep) && (ep.state === 'waiting' || ep.state === 'script'))
    if (episode) return { episode, kind: 'script' }
  }
  const episode = episodes.find((ep) => eligible(ep) && ['scripted', 'scene', 'check'].includes(ep.state))
  return episode ? { episode, kind: 'video' } : null
}
