import { Pencil } from 'lucide-react'
import { useRef, useState } from 'react'
import { api } from '../lib/api'
import { t as uiText } from '../lib/i18n'
import { errorText, refreshProjects, toast, useStore } from '../store'

/** A series' title in its folder view; the pencil turns it into a field (Enter saves, Escape cancels). */
export function SeriesTitle({ folder, title }: { folder: string; title: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const cancelled = useRef(false) // Escape: the field's blur mustn't save
  const save = async () => {
    const name = draft?.trim()
    setDraft(null)
    if (cancelled.current || !name || name === title) return
    try {
      await api.renameSeries(folder, name)
      await refreshProjects()
      if (useStore.getState().watchSeries?.folder === folder) {
        const watchSeries = await api.watchSeries(folder)
        if (useStore.getState().watchSeries?.folder === folder) useStore.setState({ watchSeries })
      }
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }
  if (draft === null)
    return (
      <>
        <strong>{title}</strong>
        <button
          className="icon-btn"
          onClick={() => {
            cancelled.current = false
            setDraft(title)
          }}
          aria-label={uiText('Rename series')}
          title={uiText('Rename series')}
        >
          <Pencil />
        </button>
      </>
    )
  return (
    <input
      className="input series-rename"
      autoFocus
      aria-label={uiText('Series title')}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => void save()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          cancelled.current = true
          setDraft(null)
        }
      }}
    />
  )
}
