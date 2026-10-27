import type { ExerciseSet, WatchSeries } from './types'

export interface StudySelection { dir?: string; production?: boolean }

/** Remembered paths must still belong to this course, including its extras and exercises. */
export function validStudySelection(series: WatchSeries, exercises: ExerciseSet | null, value: unknown): StudySelection | null {
  if (!value || typeof value !== 'object') return null
  const saved = value as StudySelection
  const overview = saved.production === true && !!series.production
  if (typeof saved.dir !== 'string') return overview ? { production: true } : null
  const belongs = series.episodes.some((episode) => episode.dir === saved.dir || episode.followUps.some((extra) => extra.dir === saved.dir))
    || exercises?.items.some((item) => item.dir === saved.dir)
  return overview ? { production: true, ...(belongs ? { dir: saved.dir } : {}) } : belongs ? { dir: saved.dir } : null
}
