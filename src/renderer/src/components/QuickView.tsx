import { Check, CircleAlert, Circle, FolderOpen, Square, Zap } from 'lucide-react'
import type { QuickStep } from '../../../shared/types'
import { api } from '../lib/api'
import { revealLabel } from '../lib/platform'
import { closeProject, openDialog, useStore } from '../store'
import { ProgressLine } from './ui'

const ORDER: QuickStep[] = ['setup', 'sources', 'script', 'scene', 'check', 'export', 'done']
const STEPS: { step: QuickStep; label: string }[] = [
  { step: 'sources', label: 'Reading the sources' },
  { step: 'script', label: 'Writing the script' },
  { step: 'scene', label: 'Making the scenes' },
  { step: 'check', label: 'Checking the render' },
  { step: 'export', label: 'Exporting' },
]

/** Quick mode's progress, in place of the editor while Studio makes the video on its own. */
export function QuickView() {
  const run = useStore((s) => s.quick)!
  const timeline = useStore((s) => s.timeline)
  const job = useStore((s) => s.exports.find((j) => j.id === run.exportJob))
  const at = ORDER.indexOf(run.step)
  const working = run.state === 'working'
  const steps = STEPS.filter((s) => s.step !== 'sources' || at >= ORDER.indexOf('sources'))

  return (
    <div className="quick-view">
      <div className="quick-card">
        <div className="eyebrow">
          <Zap /> {run.series ? `${run.series.title} · episode ${run.series.episode} of ${run.series.of}` : 'Quick mode'}
        </div>
        <h1>{run.name}</h1>
        <p className="muted">
          {working
            ? 'Claude is making this video and will export it when it’s done. You can leave it running; a notification says when it’s ready.'
            : run.state === 'done'
              ? 'Your video is ready.'
              : run.state === 'stopped'
                ? 'Stopped. The project keeps what was made so far.'
                : 'It didn’t finish.'}
        </p>

        <ol className="quick-steps">
          {steps.map(({ step, label }) => {
            const i = ORDER.indexOf(step)
            const state = run.state === 'done' || i < at ? 'done' : i === at && working ? 'now' : 'todo'
            return (
              <li key={step} className={state}>
                {state === 'done' ? <Check /> : state === 'now' ? <span className="spinner" /> : <Circle />}
                <span>{label}</span>
                {step === 'export' && state === 'now' && job?.percent !== undefined && <span className="mono faint">{Math.round(job.percent * 100)}%</span>}
              </li>
            )
          })}
        </ol>
        {working && run.step === 'export' && <ProgressLine value={job?.percent} />}
        {working && run.activity && <div className="quick-activity faint">{run.activity}</div>}
        {run.error && (
          <div className="quick-error">
            <CircleAlert /> {run.error}
          </div>
        )}
        {run.warnings.length > 0 && (
          <ul className="quick-warnings">
            {run.warnings.map((w) => (
              <li key={w}>
                <CircleAlert /> {w}
              </li>
            ))}
          </ul>
        )}

        {timeline && <video className="quick-preview" src={api.mediaUrl(timeline.video)} controls preload="metadata" />}

        <div className="quick-actions">
          {working ? (
            <>
              <button className="btn ghost" onClick={() => useStore.setState({ quickEditor: true })}>
                Watch in the editor
              </button>
              <button className="btn" onClick={() => void api.stopQuick()}>
                <Square /> Stop
              </button>
            </>
          ) : (
            <>
              <button className="btn ghost" onClick={() => void closeProject()}>
                Back to projects
              </button>
              <button className="btn ghost" onClick={() => useStore.setState({ quickEditor: true })}>
                Open in the editor
              </button>
              {run.result && (
                <button className="btn" onClick={() => void api.reveal(run.result!.files[0] ?? run.result!.folder)}>
                  <FolderOpen /> {revealLabel}
                </button>
              )}
              <button className="btn primary" onClick={() => openDialog({ kind: 'quick' })}>
                <Zap /> Make another
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
