import { t as uiText, format } from '../lib/i18n'
import { ArrowDownToLine, ChevronLeft, History, Pause, Play, RefreshCw, Settings, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { shortcut } from '../lib/platform'
import { closeProject, openDialog, openExerciseSet, pausePreview, renderProgress, useStore } from '../store'
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

/** Back to quick mode's progress, when you went to look at the editor meanwhile. */
function QuickPill() {
  const show = useStore((s) => s.quickEditor && s.quick?.state === 'working' && s.quick.project === s.project?.path)
  if (!show) return null
  return (
    <button className="exports-pill busy" onClick={() => useStore.setState({ quickEditor: false })}>
      <span className="spinner" /> {uiText(' Quick mode · Show progress')}
    </button>
  )
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
