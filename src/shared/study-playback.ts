/** Local playback history is independent of export filenames and watched marks. */
export interface StudyProgress {
  position: number
  duration: number
  completed: boolean
}

/** Sidebar history needs both a valid position and duration; legacy numeric entries resume only. */
export function readStudyProgress(raw: string | null): StudyProgress | null {
  try {
    const value = JSON.parse(raw ?? 'null') as StudyProgress | null
    if (!value || !Number.isFinite(value.position) || value.position < 0 || !Number.isFinite(value.duration) || value.duration <= 0) return null
    return { position: Math.min(value.position, value.duration), duration: value.duration, completed: value.completed === true }
  } catch { return null }
}

export function studyProgressSummary(progress: StudyProgress): { percent: number; remaining: number } {
  return { percent: progress.completed ? 100 : Math.min(99, progress.position / progress.duration * 100), remaining: progress.completed ? 0 : Math.ceil(Math.max(0, progress.duration - progress.position)) }
}

export function resumePosition(raw: string | null, duration: number): number {
  if (!raw || !Number.isFinite(duration) || duration <= 0) return 0
  try {
    const value: unknown = JSON.parse(raw)
    const position = typeof value === 'number' ? value : (value as StudyProgress | null)?.completed ? 0 : (value as StudyProgress | null)?.position
    return typeof position === 'number' && Number.isFinite(position) && position >= 0 ? Math.min(position, Math.max(0, duration - 0.05)) : 0
  } catch {
    return 0
  }
}

/** Stop at an unfinished lesson rather than silently skipping part of the course. */
export function nextStudyEpisode<T extends { dir: string; video?: string; state?: string }>(episodes: T[], current: string): T | undefined {
  const index = episodes.findIndex((episode) => episode.dir === current)
  const next = index < 0 ? undefined : episodes[index + 1]
  return next?.video && next.state !== 'making' && next.state !== 'failed' ? next : undefined
}
