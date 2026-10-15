import { Check, Circle, CircleAlert, FolderOpen, Square, X } from 'lucide-react'
import { useEffect } from 'react'
import type { EpisodeRun } from '../../../shared/types'
import { api } from '../lib/api'
import { revealLabel } from '../lib/platform'
import { openProject, refreshProjects, useStore } from '../store'

const LABEL: Record<EpisodeRun['state'], string> = {
  waiting: 'Waiting for its script',
  script: 'Writing the script',
  scripted: 'Script ready; its video starts when an agent is free',
  scene: 'Making the video',
  check: 'Checking the render',
  export: 'Exporting',
  done: 'Done',
  failed: 'Didn’t finish',
  stopped: 'Stopped',
}

/** A series being made unattended (src/main/series.ts runSeries), on Home: every episode's state. */
export function SeriesPanel() {
  const run = useStore((s) => s.series)
  const exports = useStore((s) => s.exports)
  const count = run?.episodes.filter((e) => e.state === 'done').length
  useEffect(() => void refreshProjects(), [run?.folder, count]) // new episodes, fresh thumbnails
  if (!run) return null

  const working = run.state === 'working'
  const scripting = run.episodes.findIndex((e) => e.state === 'script')
  const made = run.episodes.filter((e) => e.state === 'done').length
  const failed = run.episodes.filter((e) => e.state === 'failed').length
  const status = !working
    ? run.state === 'stopped'
      ? `Stopped. ${made} of ${run.episodes.length} episodes were made; the others keep what was done so far.`
      : `${made} of ${run.episodes.length} episodes made${failed ? `, ${failed} didn’t finish: open one to see why, and ask Claude to finish it` : ''}.`
    : scripting >= 0
      ? `One agent writes the scripts in order, so each episode builds on the ones before (episode ${scripting + 1} of ${run.episodes.length}); ${run.agents > 1 ? `${run.agents - 1 === 1 ? 'the other makes' : `the other ${run.agents - 1} make`} each video as soon as its script is ready` : 'the videos follow once the scripts are written'}.`
      : `The scripts are written; the videos are being made, ${run.agents} at a time. Each is exported as soon as it passes the check.`

  return (
    <section className="setup series-panel" aria-live="polite">
      <div className="setup-head">
        <span className="eyebrow">{working ? 'Making a series' : 'Series'}</span>
        <h2>{run.title}</h2>
        <p className="muted">{status}</p>
      </div>
      <ol className="quick-steps series-run">
        {run.episodes.map((ep, i) => {
          const job = exports.find((j) => j.id === ep.exportJob)
          const busy = ['script', 'scene', 'check', 'export'].includes(ep.state)
          const cls = ep.state === 'done' ? 'done' : ep.state === 'failed' ? 'failed' : busy ? 'now' : 'todo'
          return (
            <li key={ep.dir} className={cls}>
              {cls === 'done' ? <Check /> : cls === 'failed' ? <CircleAlert /> : cls === 'now' ? <span className="spinner" /> : <Circle />}
              <span className="mono faint">{i + 1}</span>
              <div className="series-run-body">
                <span className="series-run-title">{ep.title}</span>
                <span className="series-run-state">
                  {LABEL[ep.state]}
                  {ep.state === 'export' && job?.percent !== undefined ? ` ${Math.round(job.percent * 100)}%` : ''}
                  {ep.state === 'failed' && ep.error ? `: ${ep.error}` : ''}
                  {busy && ep.activity && ep.state !== 'export' ? ` · ${ep.activity}` : ''}
                </span>
              </div>
              <button
                className="btn small ghost"
                onClick={() => void openProject(ep.dir)}
                title={busy ? 'Watch its renders; the chat waits until the agent is done' : undefined}
              >
                Open
              </button>
            </li>
          )
        })}
      </ol>
      <div className="series-panel-actions">
        <button className="btn ghost" onClick={() => void api.reveal(run.folder)}>
          <FolderOpen /> {revealLabel}
        </button>
        {working ? (
          <button className="btn" onClick={() => void api.stopSeries()}>
            <Square /> Stop the series
          </button>
        ) : (
          <button className="btn" onClick={() => void api.dismissSeries()}>
            <X /> Dismiss
          </button>
        )}
      </div>
    </section>
  )
}
