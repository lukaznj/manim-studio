import { Sparkles, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Commit } from '../../../shared/types'
import { api } from '../lib/api'
import { ago } from '../lib/time'
import { errorText, renderNow, toast } from '../store'

export function HistoryPopover({ onClose }: { onClose: () => void }) {
  const [commits, setCommits] = useState<Commit[] | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.history().then(setCommits).catch(() => setCommits([]))
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose()
    setTimeout(() => window.addEventListener('mousedown', onDown))
    return () => window.removeEventListener('mousedown', onDown)
  }, [onClose])

  const restore = async (oid: string) => {
    try {
      await api.restore(oid)
      toast('Vraćeno. Prethodno stanje je spremljeno kao nova verzija.', 'ok')
      onClose()
      void renderNow()
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  return (
    <div className="popover history" ref={ref}>
      <div className="popover-head">
        <strong>Povijest verzija</strong>
        <span className="hint">Spremi se nakon svakog uspješnog rendera i svakog Claudeovog odgovora.</span>
      </div>
      <div className="history-list">
        {commits === null && <div className="hint pad">Učitavam…</div>}
        {commits?.length === 0 && <div className="hint pad">Još nema verzija.</div>}
        {commits?.map((c, i) => (
          <div key={c.oid} className="history-row">
            <span className={`who ${c.author === 'Claude' ? 'claude' : ''}`}>{c.author === 'Claude' ? <Sparkles /> : <UserRound />}</span>
            <div className="history-text">
              <div className="history-msg">{c.message}</div>
              <div className="faint">
                {ago(c.at)} · <span className="mono">{c.oid.slice(0, 7)}</span>
              </div>
            </div>
            {confirm === c.oid ? (
              <button className="btn small primary" onClick={() => void restore(c.oid)}>
                Potvrdi
              </button>
            ) : (
              <button className="btn small ghost" onClick={() => setConfirm(c.oid)} title={i === 0 ? 'Odbaci nespremljene i nesnimljene promjene' : undefined}>
                Vrati
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
