import { CircleAlert, Download, FolderOpen, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ExportJob } from '../../../shared/types'
import { api } from '../lib/api'
import { revealLabel } from '../lib/platform'
import { useStore } from '../store'
import { ProgressLine, Ring } from './ui'

const active = (j: ExportJob) => j.state === 'running' || j.state === 'waiting'

/** The export queue in the title bar, on every screen: exports keep going while you open other projects. */
export function ExportsMenu() {
  const jobs = useStore((s) => s.exports)
  const [open, setOpen] = useState(false)
  if (!jobs.length) return null
  const running = jobs.find((j) => j.state === 'running')
  const waiting = jobs.filter((j) => j.state === 'waiting').length
  const failed = jobs.some((j) => j.state === 'failed')
  const label = running ? (running.percent !== undefined ? `Exporting ${Math.round(running.percent * 100)}%` : 'Exporting…') : waiting ? `${waiting} waiting` : 'Exports'

  return (
    <div className="popover-anchor">
      <button className={`exports-pill ${running ? 'busy' : ''} ${failed ? 'failed' : ''}`} onClick={() => setOpen(!open)} title="Exports">
        {running ? <Ring value={running.percent ?? 0} size={15} /> : failed ? <CircleAlert /> : <Download />}
        {label}
        {running && waiting > 0 && <span className="faint">+{waiting}</span>}
      </button>
      {open && <ExportsPopover jobs={jobs} onClose={() => setOpen(false)} />}
    </div>
  )
}

function ExportsPopover({ jobs, onClose }: { jobs: ExportJob[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => !ref.current?.closest('.popover-anchor')?.contains(e.target as Node) && onClose()
    setTimeout(() => window.addEventListener('mousedown', onDown))
    return () => window.removeEventListener('mousedown', onDown)
  }, [onClose])

  return (
    <div className="popover exports" ref={ref}>
      <div className="popover-head exports-head">
        <div>
          <strong>Exports</strong>
          <div className="hint">One at a time, in the background. A notification says when each is done.</div>
        </div>
        {jobs.some((j) => !active(j)) && (
          <button className="link-btn" onClick={() => void api.clearExports()}>
            Clear finished
          </button>
        )}
      </div>
      <div className="exports-list">
        {[...jobs].reverse().map((j) => (
          <div key={j.id} className={`export-job ${j.state}`}>
            <div className="export-job-text">
              <strong>{j.name}</strong>
              <span className="hint">{status(j)}</span>
              {j.state === 'running' && <ProgressLine value={j.percent} />}
              {j.result?.warnings.map((w) => (
                <span key={w} className="export-job-warning">
                  <CircleAlert /> {w}
                </span>
              ))}
            </div>
            <div className="export-job-actions">
              {j.result && (
                <button className="icon-btn" onClick={() => void api.reveal(j.result!.files[0] ?? j.result!.folder)} title={revealLabel}>
                  <FolderOpen />
                </button>
              )}
              <button className="icon-btn" onClick={() => void api.cancelExport(j.id)} title={active(j) ? 'Stop this export' : 'Remove from the list'}>
                <X />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function status(j: ExportJob): string {
  switch (j.state) {
    case 'waiting':
      return 'Waiting for the export before it'
    case 'running':
      return `${j.stage ?? 'Starting'}${j.percent !== undefined ? ` · ${Math.round(j.percent * 100)}%` : ''}`
    case 'done':
      return `Done · ${j.result?.files.length ?? 0} files in ${j.result?.folder.split(/[\\/]/).pop()}`
    case 'failed':
      return `Failed: ${j.error}`
    case 'cancelled':
      return 'Stopped'
  }
}
