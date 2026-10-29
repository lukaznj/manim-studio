import { Check, ChevronRight, Circle, CircleAlert, Clapperboard, Code2, FileText, FolderOpen, Gauge, Hourglass, Pause, Play, RotateCcw, Square, X } from 'lucide-react'
import { useState } from 'react'
import type { EpisodeRun, FollowUp, SeriesRun, WatchEpisode } from '../../../shared/types'
import { episodePresentation, seriesStatus } from '../../../shared/series-presentation'
import { modelName } from '../../../shared/usage'
import { api } from '../lib/api'
import { t, format } from '../lib/i18n'
import { revealLabel } from '../lib/platform'
import { canEdit, errorText, selectStudied, showSeriesProduction, toast, useStore } from '../store'
import { AccountPlanUsage } from './AccountPlanUsage'
import { configuredAuth, LimitSwitch } from './LimitSwitch'
import { ProductionStages, useProductionProgress } from './ProductionStages'
import { phasePercent } from '../../../shared/production-progress'

const dollars = (n: number) => `$${n < 10 ? n.toFixed(2) : n.toFixed(0)}`
const perform = (action: () => Promise<unknown>) => { void action().catch((error) => toast(errorText(error), 'error')) }

export function ProductionIcon({ run, episode }: { run: SeriesRun; episode: EpisodeRun }) {
  const job = useStore((s) => s.exports.find((j) => j.id === episode.exportJob))
  const { active, held } = episodePresentation(run, episode, job)
  return episode.state === 'done' ? <Check /> : episode.state === 'failed' ? <CircleAlert /> : held ? <Pause /> : episode.limitedUntil ? <Hourglass /> : active ? <span className="spinner" /> : <Circle />
}

export function EpisodeStatus({ run, episode, activity = false }: { run: SeriesRun; episode: EpisodeRun; activity?: boolean }) {
  const job = useStore((s) => s.exports.find((j) => j.id === episode.exportJob))
  const view = episodePresentation(run, episode, job)
  const progress = useProductionProgress(episode.dir, view.active && !episode.limitedUntil, view.stage)
  const writing = episode.state === 'script' || episode.state === 'scene' ? phasePercent(progress[episode.state]) : undefined
  return <>{view.prefix && <>{t(view.prefix)} · </>}{t(view.label)}{view.percent !== undefined ? <> · {view.percent}%</> : writing !== undefined && <> · {writing}% {t('Estimated').toLocaleLowerCase()}</>}
    {activity && view.active && episode.activity && episode.state !== 'export' && <> · {t(episode.activity)}</>}</>
}

/** The sidebar entry stays available while watching completed lessons or browsing exercises. */
export function ProductionNavigation({ run, selected, onClick }: { run: SeriesRun; selected: boolean; onClick: () => void }) {
  const made = run.episodes.filter((ep) => ep.state === 'done').length
  const limited = run.state === 'working' && run.episodes.some((ep) => ep.limitedUntil && !ep.held)
  return (
    <button className={`production-nav ${selected ? 'on' : ''} ${limited ? 'limited' : ''}`} onClick={onClick} aria-current={selected ? 'page' : undefined}>
      <Clapperboard />
      <span><strong>{t('Production')}</strong><small>{t(seriesStatus(run))} · {made}/{run.episodes.length}</small></span>
      {limited ? <CircleAlert /> : <ChevronRight />}
    </button>
  )
}

function SeriesActions({ run }: { run: SeriesRun }) {
  const current = useStore((s) => s.seriesRuns.some((active) => active.folder === run.folder))
  const developer = useStore((s) => s.settings?.developerMode)
  const [busy, setBusy] = useState(false)
  const resume = async () => {
    setBusy(true)
    try { await api.continueSeries(run.folder) } catch (error) { toast(errorText(error), 'error') } finally { setBusy(false) }
  }
  return (
    <div className="production-actions">
      {current && run.state === 'working' && <button className="btn" onClick={() => perform(() => api.pauseSeries(true, run.folder))}><Pause />{t('Pause the series')}</button>}
      {current && run.state === 'paused' && <button className="btn primary" onClick={() => perform(() => api.pauseSeries(false, run.folder))}><Play />{t('Resume')}</button>}
      {(run.state === 'queued' || run.state === 'stopped' || (run.state === 'done' && run.episodes.some((ep) => ep.state === 'failed'))) &&
        <button className="btn primary" disabled={busy} onClick={() => void resume()}>{busy ? <span className="spinner" /> : <Play />}{t(run.state === 'queued' ? 'Start now' : run.state === 'done' ? 'Try again' : 'Continue')}</button>}
      {current && (run.state === 'working' || run.state === 'paused') && <button className="btn" onClick={() => perform(() => api.stopSeries(run.folder))}><Square />{t('Stop')}</button>}
      <button className="icon-btn" title={revealLabel} aria-label={revealLabel} onClick={() => perform(() => api.reveal(run.folder))}><FolderOpen /></button>
      {developer && run.report && <button className="btn small" onClick={() => perform(() => api.openEpisodeReport(run.folder))}><FileText />{t('Open series report')}</button>}
      {current && (run.state === 'done' || run.state === 'stopped' || run.state === 'queued') && <button className="icon-btn" title={t('Dismiss')} aria-label={t('Dismiss')} onClick={() => perform(async () => { await api.dismissSeries(run.folder) })}><X /></button>}
    </div>
  )
}

export function SeriesLimit({ run }: { run: SeriesRun }) {
  const settings = useStore((s) => s.settings)
  const current = useStore((s) => s.seriesRuns.some((active) => active.folder === run.folder))
  const waiting = run.episodes.filter((ep) => ep.limitedUntil && !ep.held && ['script', 'scene', 'check'].includes(ep.state))
  if (!current || run.state !== 'working' || !waiting.length) return null
  const ep = waiting[0]
  const agent = ep.assignment?.agent ?? run.agent ?? settings?.agent ?? 'claude'
  const auth = ep.assignment ? ep.assignmentAuth ?? configuredAuth(settings, agent) : run.auth ?? configuredAuth(settings, agent)
  return <LimitSwitch until={Math.min(...waiting.map((episode) => episode.limitedUntil!))} current={{ agent, auth }} onSwitch={(route) => api.switchSeriesAgent(route, run.folder)} />
}

function EpisodeActions({ run, episode }: { run: SeriesRun; episode: EpisodeRun }) {
  const current = useStore((s) => s.seriesRuns.some((active) => active.folder === run.folder))
  const developer = useStore((s) => s.settings?.developerMode)
  const remote = useStore((s) => !!s.exports.find((job) => job.id === episode.exportJob && job.state === 'running' && job.options.server))
  const [retrying, setRetrying] = useState(false)
  const retry = async () => {
    setRetrying(true)
    try { await api.retrySeriesEpisode(episode.dir) } catch (error) { toast(errorText(error), 'error') } finally { setRetrying(false) }
  }
  return <div className="production-episode-actions">
    {episode.state === 'failed' && <button className="btn small" disabled={retrying} onClick={() => void retry()}>{retrying ? <span className="spinner" /> : <RotateCcw />}{t('Try again')}</button>}
    {current && !remote && !['done', 'failed'].includes(episode.state) && (run.state === 'working' || episode.held) &&
      <button className="icon-btn" aria-label={t(episode.held ? 'Resume this episode' : 'Pause this episode')} title={t(episode.held ? 'Resume this episode' : 'Pause this episode')} onClick={() => perform(() => api.pauseEpisode(episode.dir, !episode.held))}>{episode.held ? <Play /> : <Pause />}</button>}
    {developer && episode.report && <button className="btn small ghost" onClick={() => perform(() => api.openEpisodeReport(episode.dir))}><FileText />{t('HTML report')}</button>}
  </div>
}

function ProductionDetails({ run }: { run: SeriesRun }) {
  const settings = useStore((s) => s.settings)
  const [expanded, setExpanded] = useState(false)
  const providers = [...new Set(run.episodes.map((ep) => ep.assignment?.agent ?? run.agent ?? settings?.agent ?? 'claude'))]
  const estimates = [...(run.planningCostUSD !== undefined ? [run.planningApiEstimateUSD] : []), ...run.episodes.filter((ep) => ep.costUSD !== undefined).map((ep) => ep.apiEstimateUSD)]
  const cost = estimates.length && estimates.every((value): value is number => typeof value === 'number') ? estimates.reduce((total, value) => total + value, 0) : null
  return <details className="production-usage" onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary><Gauge />{t('Usage')}<ChevronRight /></summary>
    {expanded && <div>
      {providers.map((agent) => <AccountPlanUsage key={agent} agent={agent} auth={agent === run.agent ? run.auth ?? configuredAuth(settings, agent) : configuredAuth(settings, agent)} />)}
      {settings?.developerMode && <p className="hint">
        {run.episodes.some((ep) => ep.assignment) ? t('Episode model comparison') : modelName(run.model || 'default')}
        {run.effort ? format(', {0} effort', [run.effort]) : ''}
        {cost !== null && cost > 0 && <> · {dollars(cost)} {t('API-equivalent estimate')}{run.planningApiEstimateUSD ? format(' (planning {0})', [dollars(run.planningApiEstimateUSD)]) : ''}</>}
      </p>}
    </div>}
  </details>
}

/** Production belongs to the course. The library only links here. */
export function SeriesOverview({ run }: { run: SeriesRun }) {
  const developer = useStore((s) => s.settings?.developerMode)
  const made = run.episodes.filter((ep) => ep.state === 'done').length
  return <section className="production-page" data-tour="home-progress">
    <header className="production-head">
      <div><span className="eyebrow">{t('Production')}</span><h1>{t(seriesStatus(run))}</h1></div>
      <SeriesActions run={run} />
    </header>
    <div className="production-summary">
      <div><strong>{made}<span> / {run.episodes.length}</span></strong><span role="status">{format('{0} of {1} episodes made.', [made, run.episodes.length])}</span></div>
      <progress value={made} max={run.episodes.length} aria-label={t('Production')} />
      {run.state === 'stopped' && <p className="hint">{format('Stopped with {0} of {1} episodes made. Continue carries on where each one stopped, also after you quit the app.', [made, run.episodes.length])}</p>}
      {developer && run.metrics && <p className="hint">{t('Measuring one episode at a time, from script through export. HTML reports appear as episodes finish.')}</p>}
    </div>
    <SeriesLimit run={run} />
    <ol className="production-episodes">
      {run.episodes.map((episode, i) => <li key={episode.dir} className={`production-episode state-${episode.state}`}>
        <button className="production-episode-open" onClick={() => perform(() => selectStudied(episode.dir))}>
          <span className="production-episode-icon"><ProductionIcon run={run} episode={episode} /></span>
          <span className="production-episode-copy"><small>{format('Lesson {0}', [i + 1])}</small><strong>{episode.title}</strong><span><EpisodeStatus run={run} episode={episode} activity /></span></span>
          <ChevronRight />
        </button>
        <EpisodeActions run={run} episode={episode} />
        {developer && (episode.assignment || episode.apiEstimateUSD || episode.elapsedMs !== undefined) && <div className="production-episode-debug hint">
          {episode.assignment && <span>{episode.assignment.agent} · {modelName(episode.assignment.model)} · {episode.assignment.effort}</span>}
          {!!episode.apiEstimateUSD && <span>{dollars(episode.apiEstimateUSD)} {t('API-equivalent estimate')}</span>}
          {run.metrics?.timing && episode.elapsedMs !== undefined && <span>{format('Elapsed: {0}', [`${Math.floor(episode.elapsedMs / 60000)}m ${Math.round((episode.elapsedMs % 60000) / 1000)}s`])}</span>}
        </div>}
      </li>)}
    </ol>
    <ProductionDetails run={run} />
  </section>
}

/** An unfinished episode gets space for its task and recovery, never an empty player or tutor. */
export function EpisodeProduction({ run, episode, number }: { run: SeriesRun; episode: EpisodeRun; number: number }) {
  const editing = useStore((s) => canEdit(s))
  const job = useStore((s) => s.exports.find((j) => j.id === episode.exportJob))
  const view = episodePresentation(run, episode, job)
  return <section className="production-page episode-production">
    <header className="production-head">
      <div><button className="link-btn production-back" onClick={showSeriesProduction}><Clapperboard />{t('Production')}</button><span className="eyebrow">{format('Lesson {0}', [number])}</span><h1>{episode.title}</h1></div>
      <EpisodeActions run={run} episode={episode} />
    </header>
    <SeriesLimit run={run} />
    <div className={`production-task ${view.held ? 'held' : ''} ${episode.state === 'failed' ? 'failed' : ''}`}>
      <span className="production-task-icon"><ProductionIcon run={run} episode={episode} /></span>
      <div role="status"><h2><EpisodeStatus run={run} episode={episode} /></h2>
        {view.active && !episode.limitedUntil && (episode.activity || job?.stage) && <p>{t(episode.state === 'export' ? job?.stage ?? 'Exporting' : episode.activity ?? view.label)}</p>}
        {episode.error && <p className="production-error">{episode.error}</p>}
      </div>
      {view.percent !== undefined && <progress value={view.percent} max={100} aria-label={t(view.label)} />}
    </div>
    <ProductionStages project={episode.dir} stage={view.stage} active={view.active} job={job} />
    <p className="hint">{t('Writing progress estimates completed sections, not time remaining. Rendering and assembly report their own progress.')}</p>
    <SeriesActions run={run} />
    {editing && (episode.state === 'failed' || run.state === 'stopped') && <button className="btn ghost production-editor" onClick={() => useStore.setState({ screen: 'editor' })}><Code2 />{t('Open in editor')}</button>}
  </section>
}

/** Added lessons and follow-ups have their own background job rather than a series run. */
export function LessonProduction({ episode, followUp, dir }: { episode: WatchEpisode; followUp?: FollowUp; dir: string }) {
  const failed = (followUp?.state ?? episode.state) === 'failed'
  const editing = useStore((s) => canEdit(s))
  return <section className="production-page episode-production">
    <header className="production-head"><div><span className="eyebrow">{format('Lesson {0}', [episode.number])}</span><h1>{followUp?.request ?? episode.title}</h1></div></header>
    <div className={`production-task ${failed ? 'failed' : ''}`}><span className="production-task-icon">{failed ? <CircleAlert /> : <span className="spinner" />}</span><div role="status"><h2>{t(failed ? 'Didn’t finish' : 'Making the video')}</h2><p>{followUp?.error ?? episode.error ?? followUp?.activity ?? episode.activity ?? t('Your lesson is being made. You can keep studying while it finishes.')}</p></div></div>
    <ProductionStages project={dir} active={!failed} />
    <div className="production-actions">
      {failed && <button className="btn primary" onClick={() => perform(() => followUp ? api.retryFollowUp(dir) : api.retryCourseLesson(dir))}><RotateCcw />{t('Try again')}</button>}
      {editing && failed && <button className="btn" onClick={() => useStore.setState({ screen: 'editor' })}><Code2 />{t('Open in editor')}</button>}
      <button className="btn ghost" onClick={() => perform(() => api.reveal(dir))}><FolderOpen />{revealLabel}</button>
    </div>
  </section>
}
