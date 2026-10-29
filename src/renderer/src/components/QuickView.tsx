import { Check, CircleAlert, FolderOpen, Play, RotateCcw, Square, Zap, ArrowLeft, Globe } from 'lucide-react'
import { modelName } from '../../../shared/usage'
import { api } from '../lib/api'
import { t, format } from '../lib/i18n'
import { revealLabel } from '../lib/platform'
import { canEdit, closeProject, errorText, openDialog, openWatch, toast, useStore } from '../store'
import { ProductionStages } from './ProductionStages'
import { AccountPlanUsage } from './AccountPlanUsage'

/** A production page, never the owner of the agent's lifetime or current project. */
export function QuickView() {
  const editing = useStore((s) => canEdit(s))
  const run = useStore((s) => s.quick)!
  const job = useStore((s) => s.exports.find((j) => j.id === run.exportJob))
  const working = run.state === 'working'
  const stage = { setup: 0, sources: 0, script: 0, scene: 1, check: 2, export: 3, done: 4 }[run.step]
  const resume = () => { void api.resumeQuick(run.project).catch((e) => toast(errorText(e), 'error')) }
  return <section className="quick-view">
    <div className="quick-card creation-page">
      <header className="production-head">
        <div><span className="eyebrow"><Zap />{t('Quick video')}</span><h1>{run.name}</h1></div>
        <button className="btn ghost" onClick={() => void closeProject()}><ArrowLeft />{t('Back to projects')}</button>
      </header>
      <p className="muted">{t(working ? 'Your video is being made in the background. Keep studying or work on another project; Studio will notify you when it is ready.' : run.state === 'done' ? 'Your video is ready.' : 'The project keeps what was made so far. Continue from the unfinished step.')}</p>
      <div className="creation-status">
        <span className={run.state === 'done' ? 'creation-ready' : ''}>{run.state === 'done' ? <Check /> : working ? <span className="spinner" /> : <CircleAlert />}</span>
        <div role="status"><strong>{t(run.state === 'done' ? 'Ready to watch' : run.state === 'stopped' ? 'Stopped' : run.state === 'failed' ? 'Didn’t finish' : run.step === 'sources' ? 'Reading the sources' : 'Making the video')}</strong>
          {working && run.activity && <p>{t(run.activity)}</p>}
          {run.route && <small>{run.route.agent === 'claude' ? 'Claude' : run.route.agent === 'codex' ? 'Codex' : 'Antigravity'} · {modelName(run.route.model || 'default')}</small>}
        </div>
      </div>
      <ProductionStages project={run.project} stage={stage} active={working} job={job} />
      <p className="hint creation-estimate">{t('Writing progress estimates completed sections, not time remaining. Rendering and assembly report their own progress.')}</p>
      {run.error && <div className="quick-error"><CircleAlert />{run.error}</div>}
      {!!run.warnings.length && <ul className="quick-warnings">{run.warnings.map((warning) => <li key={warning}><CircleAlert />{warning}</li>)}</ul>}
      <div className="quick-actions">
        {working ? <button className="btn" onClick={() => void api.stopQuick(run.project)}><Square />{t('Stop')}</button> : <>
          {run.state !== 'done' && <button className="btn primary" onClick={resume}><RotateCcw />{t('Continue')}</button>}
          {run.state === 'done' && <button className="btn primary" onClick={() => void openWatch(run.project)}><Play />{t('Watch it')}</button>}
          {editing && <button className="btn ghost" onClick={() => useStore.setState({ quickEditor: true })}>{t('Open in the editor')}</button>}
          {run.result && <button className="btn" onClick={() => void api.reveal(run.result!.files[0] ?? run.result!.folder)}><FolderOpen />{revealLabel}</button>}
          <button className="btn ghost" onClick={() => openDialog({ kind: 'quick' })}><Zap />{t('Make another')}</button>
        </>}
      </div>
      <details className="production-usage"><summary><Globe />{t('Creation settings')}</summary><p className="hint">{format('{0} PDF sources', [run.sources ?? 0])} · {t('Web research available')}</p>{run.route && <AccountPlanUsage agent={run.route.agent} auth={run.route.auth} />}</details>
    </div>
  </section>
}
