import type { ReactNode } from 'react'
import { studyProgressSummary } from '../../../shared/study-playback'
import { useStudyProgress } from '../lib/study-progress'
import { format, t as uiText } from '../lib/i18n'

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

/** Use the same saved position as Resume, without replacing an unfinished video's production state. */
export function StudyRowProgress({ dir, available, children }: { dir: string; available: boolean; children: ReactNode }) {
  const progress = useStudyProgress(dir)
  const summary = available && progress && (progress.completed || progress.position > 0) ? studyProgressSummary(progress) : null
  return <>
    <span className="ex-row-state">{summary && summary.remaining > 0 ? format('{0} left', [clock(summary.remaining)]) : children}</span>
    {summary && <span className="study-lesson-progress" role="progressbar" aria-label={uiText('Video position')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(summary.percent)} aria-valuetext={`${clock(Math.floor(progress!.completed ? progress!.duration : progress!.position))} / ${clock(Math.ceil(progress!.duration))}`}>
      <span style={{ width: `${summary.percent}%` }} />
    </span>}
  </>
}
