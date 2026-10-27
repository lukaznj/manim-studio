import type { EpisodeRun, ExportJob, SeriesRun } from './types'

export const EPISODE_LABEL: Record<EpisodeRun['state'], string> = {
  waiting: 'Waiting for its script', script: 'Writing the script', scripted: 'Script ready', scene: 'Making the video',
  check: 'Checking the render', export: 'Exporting', done: 'Ready to watch', failed: 'Didn’t finish', stopped: 'Stopped',
}

export function episodePresentation(run: SeriesRun, ep: EpisodeRun, job?: ExportJob) {
  const finished = ep.state === 'done' || ep.state === 'failed'
  const remote = ep.state === 'export' && !!job?.options?.server && job.state === 'running'
  const held = !finished && (run.state === 'stopped' || (!remote && (!!ep.held || run.state === 'paused' || !!job?.paused)))
  const active = !held && (run.state === 'working' || (remote && run.state === 'paused')) && ['script', 'scene', 'check', 'export'].includes(ep.state)
  const phase = ep.state === 'failed' ? ep.failedAt ?? 'script' : ep.state
  const stage = { waiting: 0, script: 0, scripted: 1, scene: 1, check: 2, export: 3, done: 4, failed: 0, stopped: 0 }[phase]
  const label = ep.state === 'export' && job?.phase === 'rendering' ? 'Rendering'
    : ep.state === 'export' && job?.phase === 'assembling' ? 'Assembling' : EPISODE_LABEL[ep.state]
  return { finished, held, active, stage, label, prefix: held ? run.state === 'stopped' ? 'Stopped' : 'Paused' : undefined,
    percent: ep.state === 'export' && job?.percent !== undefined ? Math.round(Math.max(0, Math.min(1, job.percent)) * 100) : undefined }
}

/** A preview/partial export never makes an unfinished lesson ready for the study UI. */
export function lessonIsBuilding(ep?: EpisodeRun, state?: string): boolean {
  return ep ? ep.state !== 'done' : state === 'making' || state === 'failed'
}

export function seriesStatus(run: SeriesRun): string {
  return run.state === 'working' ? 'Making a series' : run.state === 'paused' ? 'Series paused' : run.state === 'stopped' ? 'Stopped' : run.episodes.some((ep) => ep.state === 'failed') ? 'Didn’t finish' : 'Ready to watch'
}

/** Keep recovery discoverable, but finished successful courses do not need a production screen. */
export const productionVisible = (run: SeriesRun, developer = false): boolean => developer || run.state !== 'done' || run.episodes.some((episode) => episode.state !== 'done')
