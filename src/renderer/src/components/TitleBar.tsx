import { t as uiText, format } from '../lib/i18n'
import { ArrowDownToLine, Check, Zap, ChevronLeft, History, Pause, Play, RefreshCw, Settings, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { api } from '../lib/api'
import { shortcut } from '../lib/platform'
import { closeProject, openDialog, openProject, openExerciseSet, pausePreview, renderProgress, useStore } from '../store'
import { ExportsMenu } from './ExportsMenu'
import { HistoryPopover } from './HistoryPopover'
import { ProgressLine, Ring, Wordmark } from './ui'

export function TitleBar() {
  const project = useStore((s) => s.project)
  const screen = useStore((s) => s.screen)
  const exerciseSet = useStore((s) => s.exerciseSet)
  const watchSeries = useStore((s) => s.watchSeries)
  const render = useStore((s) => s.render)
  const dirty = useStore((s) => s.dirty)
  const platform = useStore((s) => s.app?.platform)
  const historyOpen = useStore((s) => s.historyOpen)
  const setHistoryOpen = (open: boolean) => useStore.setState({ historyOpen: open })

  const progress = render.status === 'rendering' ? renderProgress(render).fraction : undefined
  const words = renderProgress(render)

  return (
    <header className={`titlebar ${platform === 'darwin' ? 'mac' : 'other'}`}>
      <div className="titlebar-left">
        {screen === 'study' && (watchSeries || exerciseSet) ? (
          <>
            <button className="icon-btn no-drag" onClick={() => void closeProject()} aria-label={uiText('Back to projects')} title={uiText('Back to projects')}>
              <ChevronLeft />
            </button>
            <div className="crumb">
              <span className="faint">{uiText('Projects')}</span>
              <span className="faint">/</span>
              <strong>{watchSeries?.title ?? exerciseSet!.title}</strong>
            </div>
          </>
        ) : screen === 'editor' && project ? (
          <>
            {project.meta.exercise ? (
              <button
                className="icon-btn no-drag"
                onClick={() => void openExerciseSet(project.meta.exercise!.set, project.path)}
                aria-label={uiText('Back to the exercises')}
                title={uiText('Back to the exercises')}
              >
                <ChevronLeft />
              </button>
            ) : (
              <button
                className="icon-btn no-drag"
                onClick={() => void closeProject()}
                aria-label={uiText('Back to projects')}
                title={uiText('Back to projects')}
              >
                <ChevronLeft />
              </button>
            )}
            <div className="crumb">
              <span className="faint">{project.meta.exercise ? project.meta.exercise.title : uiText('Projects')}</span>
              <span className="faint">/</span>
              <strong>{project.meta.name}</strong>
              {dirty && <span className="dirty-dot" title={format('Unsaved changes ({0})', [shortcut('S')])} />}
              <span className="badge">{project.meta.aspect}</span>
            </div>
          </>
        ) : (
          <Wordmark />
        )}
      </div>

      <div className="titlebar-right no-drag">
        {render.status === 'rendering' && (
          <span className={`render-pill ${render.paused ? 'paused' : ''}`} title={words.title}>
            {render.paused ? <Pause /> : <span className="spinner" />}
            {words.label}
            {words.detail && <span className="mono">{words.detail}</span>}
            <button
              className="pill-btn"
              onClick={() => void pausePreview(!render.paused)}
              title={render.paused ? uiText('Resume the render') : uiText('Pause the render')}
              aria-label={render.paused ? uiText('Resume the render') : uiText('Pause the render')}
            >
              {render.paused ? <Play /> : <Pause />}
            </button>
            <button className="pill-btn" onClick={() => void api.cancelRender()} title={uiText('Stop the render')} aria-label={uiText('Stop the render')}>
              <X />
            </button>
          </span>
        )}
        <PlanningPill />
        <QuickPill />
        <ExportsMenu />
        <UpdatePill />
        {screen === 'editor' && (
          <div className="popover-anchor">
            <button className={`icon-btn ${historyOpen ? 'on' : ''}`} onClick={() => setHistoryOpen(!historyOpen)} title={uiText('Version history')}>
              <History />
            </button>
            {historyOpen && <HistoryPopover onClose={() => setHistoryOpen(false)} />}
          </div>
        )}
        {/* On macOS, Settings… is ⌘, in the menu bar (src/main/menu.ts), the standard place. */}
        {platform !== 'darwin' && (
          <button className="icon-btn" data-tour="settings" onClick={() => openDialog({ kind: 'settings' })} title={uiText('Settings')}>
            <Settings />
          </button>
        )}
      </div>
      {render.status === 'rendering' && <ProgressLine value={progress} className="titlebar-progress" />}
    </header>
  )
}

/** Persistent access while a background task is out of sight. */
function PlanningPill() {
  const state = useStore((s) => s.seriesPlanning)
  const open = useStore((s) => s.dialog?.kind === 'series')
  if (!state || open) return null
  return <button className="exports-pill busy" onClick={() => openDialog({ kind: 'series' })}>
    {state === 'working' ? <span className="spinner" /> : <Check />} {uiText(state === 'working' ? 'Planning the series' : 'Review the series plan')}
  </button>
}
function QuickPill() {
  const runs = useStore((s) => s.quickRuns)
  const current = useStore((s) => s.screen === 'editor' && !s.quickEditor ? s.project?.path : null)
  const menu = useRef<HTMLDivElement>(null)
  const id = useId()
  const visible = runs.filter((run) => run.project !== current && run.state !== 'done')
  if (!visible.length) return null
  const working = visible.filter((run) => run.state === 'working').length
  const open = (project: string) => { menu.current?.hidePopover(); void openProject(project) }
  return <>
    <button className={`exports-pill ${working ? 'busy' : ''}`} popoverTarget={id} onClick={(event) => {
      const box = event.currentTarget.getBoundingClientRect()
      if (menu.current) { menu.current.style.top = `${box.bottom + 8}px`; menu.current.style.left = `${Math.max(12, Math.min(box.right - 340, window.innerWidth - 352))}px` }
    }}>{working ? <span className="spinner" /> : <Zap />}{uiText('Quick video')}<span className="badge">{visible.length}</span></button>
    <div id={id} ref={menu} popover="auto" className="quick-jobs-menu">
      <strong>{uiText('Quick video')}</strong>
      {[...visible].reverse().map((run) => <button key={run.id} onClick={() => open(run.project)}>
        {run.state === 'working' ? <span className="spinner" /> : <Zap />}<span><strong>{run.name}</strong><small>{uiText(run.state === 'working' ? 'Video in progress' : 'Continue video')}</small></span>
      </button>)}
    </div>
  </>
}

function UpdatePill() {
  const update = useStore((s) => s.update)
  const releasesUrl = useStore((s) => s.app?.releasesUrl)
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => setDismissed(false), [update.state])

  if (dismissed) return null
  if (update.state === 'available')
    return (
      <button className="update-pill" onClick={() => void api.downloadUpdate()} title={update.notes}>
        <ArrowDownToLine /> {uiText(' Update to ')}
        {update.version}
      </button>
    )
  if (update.state === 'downloading')
    return (
      <span className="update-pill busy">
        <Ring value={update.percent / 100} size={15} /> {uiText(' Downloading ')}
        {Math.round(update.percent)}%
      </span>
    )
  if (update.state === 'ready')
    return (
      <button className="update-pill ready" onClick={() => void api.installUpdate()}>
        <RefreshCw /> {uiText(' Restart to update to ')}
        {update.version}
      </button>
    )
  if (update.state === 'error' && update.manualUrl)
    return (
      <button
        className="update-pill"
        onClick={() => void api.openExternal(update.manualUrl ?? releasesUrl ?? '')}
        onContextMenu={() => setDismissed(true)}
        title={update.message}
      >
        <ArrowDownToLine /> {uiText(' Download the update manually')}
      </button>
    )
  return null
}
