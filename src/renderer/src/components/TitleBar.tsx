import { ArrowDownToLine, ChevronLeft, History, RefreshCw, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { closeProject, openDialog, useStore } from '../store'
import { HistoryPopover } from './HistoryPopover'
import { ProgressLine, Ring, Wordmark } from './ui'

export function TitleBar() {
  const project = useStore((s) => s.project)
  const screen = useStore((s) => s.screen)
  const render = useStore((s) => s.render)
  const dirty = useStore((s) => s.dirty)
  const platform = useStore((s) => s.app?.platform)
  const [historyOpen, setHistoryOpen] = useState(false)

  const progress = render.status === 'rendering' && render.expected ? (render.clips ?? 0) / render.expected : undefined

  return (
    <header className={`titlebar ${platform === 'darwin' ? 'mac' : 'other'}`}>
      <div className="titlebar-left">
        {screen === 'editor' && project ? (
          <>
            <button className="icon-btn no-drag" onClick={() => void closeProject()} aria-label="Back to projects" title="Back to projects">
              <ChevronLeft />
            </button>
            <div className="crumb">
              <span className="faint">Projects</span>
              <span className="faint">/</span>
              <strong>{project.meta.name}</strong>
              {dirty && <span className="dirty-dot" title="Unsaved changes (⌘S)" />}
              <span className="badge">{project.meta.aspect}</span>
            </div>
          </>
        ) : (
          <Wordmark />
        )}
      </div>

      <div className="titlebar-right no-drag">
        {render.status === 'rendering' && (
          <span className="render-pill">
            <span className="spinner" />
            Rendering{render.expected ? ` ${render.clips ?? 0}/${render.expected}` : '…'}
          </span>
        )}
        <UpdatePill />
        {screen === 'editor' && (
          <div className="popover-anchor">
            <button className={`icon-btn ${historyOpen ? 'on' : ''}`} onClick={() => setHistoryOpen((o) => !o)} title="Version history">
              <History />
            </button>
            {historyOpen && <HistoryPopover onClose={() => setHistoryOpen(false)} />}
          </div>
        )}
        <button className="icon-btn" onClick={() => openDialog({ kind: 'settings' })} title="Settings">
          <Settings />
        </button>
      </div>
      {render.status === 'rendering' && <ProgressLine value={progress} className="titlebar-progress" />}
    </header>
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
        <ArrowDownToLine /> Update to {update.version}
      </button>
    )
  if (update.state === 'downloading')
    return (
      <span className="update-pill busy">
        <Ring value={update.percent / 100} size={15} /> Downloading {Math.round(update.percent)}%
      </span>
    )
  if (update.state === 'ready')
    return (
      <button className="update-pill ready" onClick={() => void api.installUpdate()}>
        <RefreshCw /> Restart to update to {update.version}
      </button>
    )
  if (update.state === 'error' && update.manualUrl)
    return (
      <button className="update-pill" onClick={() => void api.openExternal(update.manualUrl ?? releasesUrl ?? '')} onContextMenu={() => setDismissed(true)} title={update.message}>
        <ArrowDownToLine /> Download the update manually
      </button>
    )
  return null
}
