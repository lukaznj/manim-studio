import type { ExerciseSet, WatchSeries } from './types'

export interface StudySelection { dir?: string; production?: boolean }

/** A standalone player needs navigation only after related content has been requested. */
export function studyLibraryNeeded(series: WatchSeries | null, exercises: ExerciseSet | null): boolean {
  if (!series || series.episodes.length !== 1 || series.episodes[0].dir !== series.folder) return true
  return series.episodes[0].followUps.length > 0 || !!series.exercises || !!exercises
}

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
