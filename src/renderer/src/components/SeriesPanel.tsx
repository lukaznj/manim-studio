import { t as uiText, format } from '../lib/i18n'
import { Check, Circle, CircleAlert, FolderOpen, Pause, Play, Square, X } from 'lucide-react'
import { useEffect } from 'react'
import type { EpisodeRun } from '../../../shared/types'
import { modelName } from '../../../shared/usage'
import { api } from '../lib/api'
import { revealLabel } from '../lib/platform'
import { errorText, openProject, refreshProjects, toast, useStore } from '../store'
import { configuredAuth, LimitSwitch } from './LimitSwitch'

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

const dollars = (n: number) => `$${n < 10 ? n.toFixed(2) : n.toFixed(0)}`

/** A series being made unattended (src/main/series.ts), on Home: every episode's state, cost and controls. */
export function SeriesPanel() {
  const run = useStore((s) => s.series)
  const exports = useStore((s) => s.exports)
  const settings = useStore((s) => s.settings)
  const count = run?.episodes.filter((e) => e.state === 'done').length
  useEffect(() => void refreshProjects(), [run?.folder, count]) // new episodes, fresh thumbnails
  if (!run) return null

  const working = run.state === 'working'
  const scripting = run.episodes.findIndex((e) => e.state === 'script')
  const made = run.episodes.filter((e) => e.state === 'done').length
  const failed = run.episodes.filter((e) => e.state === 'failed').length
  const cost = (run.planningCostUSD ?? 0) + run.episodes.reduce((s, e) => s + (e.costUSD ?? 0), 0)
  const status =
    run.state === 'paused'
      ? 'Paused: the agents stopped where they were and carry on when you resume. Exports keep going.'
      : run.state === 'stopped'
        ? `Stopped with ${made} of ${run.episodes.length} episodes made. Continue carries on where each one stopped, also after you quit the app.`
        : run.state === 'done'
          ? `${made} of ${run.episodes.length} episodes made${failed ? `, ${failed} didn’t finish: open one to see why, and ask Claude to finish it` : ''}.`
          : scripting >= 0
            ? `One agent writes the scripts in order, so each episode builds on the ones before (episode ${scripting + 1} of ${run.episodes.length}); ${run.agents > 1 ? `${run.agents - 1 === 1 ? 'the other makes' : `the other ${run.agents - 1} make`} each video as soon as its script is ready` : 'the videos follow once the scripts are written'}.`
            : `The scripts are written; the videos are being made, ${run.agents} at a time. Each is exported as soon as it passes the check.`

  return (
    <section className="setup series-panel" aria-live="polite" data-tour="home-progress">
      <div className="setup-head">
        <span className="eyebrow">{working ? uiText('Making a series') : run.state === 'paused' ? uiText('Series paused') : uiText('Series')}</span>
        <h2>{run.title}</h2>
        <p className="muted">
          {run.metrics && working ? uiText('Measuring one episode at a time, from script through export. HTML reports appear as episodes finish.') : status}
        </p>
        <p
          className="faint series-cost"
          title={uiText(
            'What these agent turns would cost on the API. On a Claude plan they count against its limits instead; the relative sizes show where the usage went.',
          )}
        >
          {run.episodes.some((ep) => ep.assignment)
            ? uiText('Episode model comparison')
            : modelName(run.model || (run.agent === 'codex' ? 'Codex default' : run.agent === 'antigravity' ? 'Gemini default' : 'claude-sonnet-5-5'))}
          {run.effort ? format(', {0} effort', [run.effort]) : ''} · {dollars(cost)} {uiText(' at API prices so far')}
          {run.planningCostUSD ? format(' (planning {0})', [dollars(run.planningCostUSD)]) : ''}
        </p>
      </div>
      {working &&
        (() => {
          // The plan's limit holds back the episodes on this series' own agent; another can take over.
          const waiting = run.episodes.filter((e) => e.limitedUntil && !e.assignment)
          if (!waiting.length) return null
          const agent = run.agent ?? settings?.agent ?? 'claude'
          return (
            <LimitSwitch
              until={Math.min(...waiting.map((e) => e.limitedUntil!))}
              current={{ agent, auth: run.auth ?? configuredAuth(settings, agent) }}
              onSwitch={(to) => api.switchSeriesAgent(to)}
            />
          )
        })()}
      <ol className="quick-steps series-run">
        {run.episodes.map((ep, i) => {
          const job = exports.find((j) => j.id === ep.exportJob)
          const active = ['script', 'scene', 'check', 'export'].includes(ep.state)
          // Stopping cancels the exports too; a pause lets them finish.
          const held = active && (ep.held || run.state === 'stopped' || (run.state === 'paused' && ep.state !== 'export'))
          const finished = ep.state === 'done' || ep.state === 'failed'
          const cls = ep.state === 'done' ? 'done' : ep.state === 'failed' ? 'failed' : active && !held ? 'now' : 'todo'
          return (
            <li key={ep.dir} className={cls}>
              {cls === 'done' ? (
                <Check />
              ) : cls === 'failed' ? (
                <CircleAlert />
              ) : cls === 'now' ? (
                <span className="spinner" />
              ) : held || ep.held ? (
                <Pause />
              ) : (
                <Circle />
              )}
              <span className="mono faint">{i + 1}</span>
              <div className="series-run-body">
                <span className="series-run-title">{ep.title}</span>
                {run.metrics?.timing && ep.elapsedMs !== undefined && (
                  <span className="hint">{format('Elapsed: {0}', [`${Math.floor(ep.elapsedMs / 60000)}m ${Math.round((ep.elapsedMs % 60000) / 1000)}s`])}</span>
                )}
                {ep.assignment && (
                  <span className="hint">
                    {ep.assignment.agent === 'claude' ? 'Claude' : ep.assignment.agent === 'codex' ? 'Codex' : 'Antigravity'} · {modelName(ep.assignment.model)}
                    {ep.assignment.effort ? ` · ${ep.assignment.effort}` : ''}
                  </span>
                )}
                <span className="series-run-state">
                  {ep.held ? uiText('Paused · ') : held ? `${run.state === 'stopped' ? 'Stopped' : 'Paused'} · ` : ''}
                  {LABEL[ep.state]}
                  {ep.state === 'export' && job?.percent !== undefined ? ` ${Math.round(job.percent * 100)}%` : ''}
                  {ep.state === 'failed' && ep.error ? `: ${ep.error}` : ''}
                  {active && !held && ep.activity && ep.state !== 'export' ? ` · ${ep.activity}` : ''}
                </span>
              </div>
              {!!ep.costUSD && (
                <span className="mono faint series-run-cost" title={uiText('This episode’s agent turns at API prices; its chat’s Usage shows each step.')}>
                  {dollars(ep.costUSD)}
                </span>
              )}
              {!finished && (ep.held || working) && (
                <button
                  className="icon-btn"
                  onClick={() => void api.pauseEpisode(ep.dir, !ep.held)}
                  title={ep.held ? uiText('Resume this episode') : uiText('Pause this episode')}
                  aria-label={ep.held ? uiText('Resume this episode') : uiText('Pause this episode')}
                >
                  {ep.held ? <Play /> : <Pause />}
                </button>
              )}
              <button
                className="btn small ghost"
                onClick={() => void openProject(ep.dir)}
                title={active && !held ? uiText('Watch its renders; the chat waits until the agent is done') : undefined}
              >
                {uiText('Open')}
              </button>
              {ep.report && (
                <button className="btn small" onClick={() => void api.openEpisodeReport(ep.dir).catch((e) => toast(errorText(e), 'error'))}>
                  {uiText('HTML report')}
                </button>
              )}
            </li>
          )
        })}
      </ol>
      <div className="series-panel-actions">
        {run.report && (
          <button className="btn" onClick={() => void api.openEpisodeReport(run.folder).catch((e) => toast(errorText(e), 'error'))}>
            {uiText('Open series report')}
          </button>
        )}
        <button className="btn ghost" onClick={() => void api.reveal(run.folder)}>
          <FolderOpen /> {revealLabel}
        </button>
        {working && (
          <button className="btn" onClick={() => void api.pauseSeries(true)}>
            <Pause /> {uiText(' Pause the series')}
          </button>
        )}
        {run.state === 'paused' && (
          <button className="btn primary" onClick={() => void api.pauseSeries(false)}>
            <Play /> {uiText(' Resume')}
          </button>
        )}
        {(working || run.state === 'paused') && (
          <button className="btn" onClick={() => void api.stopSeries()}>
            <Square /> {uiText(' Stop')}
          </button>
        )}
        {run.state === 'stopped' && (
          <button className="btn primary" onClick={() => void api.continueSeries().catch((e) => toast(errorText(e), 'error'))}>
            <Play /> {uiText(' Continue')}
          </button>
        )}
        {!working && run.state !== 'paused' && (
          <button className="btn" onClick={() => void api.dismissSeries()}>
            <X /> {uiText(' Dismiss')}
          </button>
        )}
      </div>
    </section>
  )
}
