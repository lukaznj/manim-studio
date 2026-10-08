import { Captions, Check, CircleAlert, Download, FileVideo, FolderOpen, Image } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { closeDialog, errorText, useStore } from '../store'
import { Modal, ProgressLine } from './ui'

export function ExportDialog() {
  const open = useStore((s) => s.dialog?.kind === 'export')
  const project = useStore((s) => s.project)
  const timeline = useStore((s) => s.timeline)
  const final = useStore((s) => s.finalRender)
  const exportState = useStore((s) => s.exportState)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && !running) {
      setResult(null)
      setError(null)
      useStore.setState({ exportState: null })
    }
  }, [open])

  const start = async () => {
    setRunning(true)
    setError(null)
    try {
      setResult(await api.exportVideo())
    } catch (e) {
      setError(errorText(e))
    } finally {
      setRunning(false)
    }
  }

  const portrait = project?.meta.aspect === '9:16'
  const res = portrait ? '1080 × 1920' : '1920 × 1080'
  const fps = project?.meta.fps ?? 30
  const progress = final.status === 'rendering' && timeline?.duration ? (final.t ?? 0) / timeline.duration : undefined

  return (
    <Modal
      open={open}
      onClose={() => !running && closeDialog()}
      title="Izvoz videa"
      icon={<Download className="head-icon" />}
      width={520}
      footer={
        result ? (
          <>
            <button className="btn ghost" onClick={closeDialog}>
              Zatvori
            </button>
            <button className="btn primary" onClick={() => void api.reveal(result)}>
              <FolderOpen /> Prikaži u mapi
            </button>
          </>
        ) : (
          <>
            <button className="btn ghost" disabled={running} onClick={closeDialog}>
              Odustani
            </button>
            <button className="btn primary" disabled={running || !timeline} onClick={() => void start()}>
              {running ? <span className="spinner" /> : <Download />} {running ? 'Izvozim…' : 'Izvezi'}
            </button>
          </>
        )
      }
    >
      <div className="modal-body export">
        <ul className="export-files">
          <li>
            <FileVideo /> <strong>Video</strong> <span className="mono faint">.mp4 · {res} · {fps} fps</span>
          </li>
          <li>
            <Captions /> <strong>Titlovi</strong> <span className="mono faint">.vtt + .srt, iz naracije</span>
          </li>
          <li>
            <Image /> <strong>Sličica</strong> <span className="mono faint">.jpg, kadar s najviše sadržaja</span>
          </li>
        </ul>
        {running && (
          <div className="export-progress">
            <div className="hint">
              {exportState?.stage === 'package'
                ? 'Spremam datoteke…'
                : `Renderiram u punoj kvaliteti${progress !== undefined ? ` · ${Math.round(progress * 100)}%` : '…'}`}
            </div>
            <ProgressLine value={exportState?.stage === 'package' ? 1 : progress} />
            <p className="hint">Puni render traje dulje od pregleda; nepromijenjeni dijelovi se ne crtaju ponovno.</p>
          </div>
        )}
        {result && (
          <div className="export-done">
            <Check /> Spremljeno: <span className="mono">{result}</span>
          </div>
        )}
        {error && (
          <div className="export-error">
            <CircleAlert /> {error}
          </div>
        )}
        {!running && !result && !error && <p className="hint">Datoteke idu u mapu „exports” unutar projekta.</p>}
      </div>
    </Modal>
  )
}
