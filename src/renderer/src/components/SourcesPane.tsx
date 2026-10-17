import { t as uiText, format } from '../lib/i18n'
import { ArrowLeft, FilePlus, FileText, FolderOpen, Paperclip, Plus, ScanText, Sparkles, Trash2, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { pageRanges } from '../../../shared/pages'
import type { SourceImport, SourceItem } from '../../../shared/types'
import { api } from '../lib/api'
import { editorBridge } from '../lib/editor-bridge'
import { revealLabel } from '../lib/platform'
import { errorText, toast, useStore } from '../store'

/** Page pictures load in batches: a textbook has hundreds of pages. */
const BATCH = 24
const THUMB_WIDTH = 220

const size = (bytes: number) => (bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} kB`)

/** A Python name for a page: ("class-notes.pdf", 3) → class_notes_p3. */
const variable = (name: string, page: number) => {
  const v = name
    .replace(/\.pdf$/i, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
  return `${/^[0-9]/.test(v) || !v ? `pdf_${v}` : v}_p${page}`
}

/** Hands a PDF (or some pages) to the chat box, with a draft for the user to finish. */
export function attachSource(name: string, pages?: number[], draft?: string) {
  useStore.setState({ chatSource: { name, pages: pages?.length ? pages : undefined }, ...(draft ? { chatDraft: draft } : {}) })
}

/** Imports PDFs (dropped or picked) and says what arrived. Returns null when it failed (and said so). */
export async function addSources(paths: string[]): Promise<SourceImport | null> {
  try {
    const result = await api.importSources(paths)
    const { added } = result
    if (added.length) toast(added.length === 1 ? `${added[0]} is in sources/` : `${added.length} PDFs are in sources/`, 'ok')
    const broken = result.items.find((i) => added.includes(i.name) && i.error)
    if (broken) toast(broken.error!, 'error')
    return result
  } catch (e) {
    toast(errorText(e), 'error')
    return null
  }
}

/** The PDFs a video is made from (sources/): drop or add them, look through their pages, hand them to Claude. */
export function SourcesPane() {
  const project = useStore((s) => s.project)
  const [items, setItems] = useState<SourceItem[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setItems(null)
    setOpen(null)
    void api.listSources().then(setItems, (e) => toast(errorText(e), 'error'))
  }, [project?.path])

  const add = async (paths: string[]) => {
    setBusy(true)
    const result = await addSources(paths)
    setItems(result?.items ?? (await api.listSources()))
    setBusy(false)
  }

  const remove = async (item: SourceItem) => {
    if (!confirm(`Move “${item.name}” to the Trash? A scene that shows its pages won’t render until you put it back.`)) return
    setItems(await api.removeSource(item.name))
  }

  const current = open ? items?.find((i) => i.name === open) : undefined

  return (
    <div
      className={`media-pane sources-pane ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        void add([...e.dataTransfer.files].map((f) => api.pathForFile(f)))
      }}
    >
      {current?.pages ? (
        <Pages item={current} onBack={() => setOpen(null)} />
      ) : items && items.length === 0 ? (
        <div className="media-empty">
          <FileText />
          <p>
            <strong>{uiText('Your PDFs')}</strong>
            <br />
            <span className="muted">
              {uiText('Notes, worksheets, a textbook chapter. Claude reads them and makes the video from them, and can show their pages in it.')}
            </span>
          </p>
          <button className="btn" onClick={() => void add([])} disabled={busy}>
            {busy ? <span className="spinner" /> : <Plus />} {uiText(" Add PDFs")}
          </button>
        </div>
      ) : (
        <div className="source-list">
          {items === null && <div className="faint source-loading">{uiText('Reading PDFs…')}</div>}
          {items?.map((item) => (
            <div key={item.name} className="source-card">
              <button className="source-thumb" onClick={() => item.pages && setOpen(item.name)} disabled={!item.pages} title={uiText('Look through the pages')}>
                {item.thumb ? <img src={`${api.mediaUrl(item.thumb)}?v=${item.size}`} alt="" /> : <FileText />}
              </button>
              <div className="source-body">
                <span className="media-name mono" title={item.name}>
                  {item.name}
                </span>
                {item.title && <span className="source-title">{item.title}</span>}
                <span className="faint">
                  {item.pages ? `${item.pages} ${item.pages === 1 ? 'page' : 'pages'} · ` : ''}
                  {size(item.size)}
                </span>
                {item.error ? (
                  <span className="source-note error">
                    <TriangleAlert /> {item.error}
                  </span>
                ) : (
                  !!item.noText?.length && (
                    <span className="source-note" title={uiText('Claude looks at these pages as pictures instead of reading their text')}>
                      <ScanText />{' '}
                      {item.noText.length === item.pages ? uiText('Scanned: no text layer') : format('No text on page {0}', [pageRanges(item.noText)])}
                    </span>
                  )
                )}
                <div className="media-actions">
                  <button
                    className="btn small"
                    disabled={!item.pages}
                    onClick={() => attachSource(item.name, undefined, 'Make a video from this PDF: ')}
                    title={uiText('Attach it to the chat and ask Claude for a video')}
                  >
                    <Sparkles /> {uiText(" Make a video")}
                  </button>
                  <button className="btn small ghost" disabled={!item.pages} onClick={() => setOpen(item.name)} title={uiText('Look through the pages')}>
                    <FileText /> {uiText(" Pages")}
                  </button>
                  <button className="icon-btn" onClick={() => project && void api.reveal(`${project.path}/sources/${item.name}`)} title={revealLabel}>
                    <FolderOpen />
                  </button>
                  <button className="icon-btn" onClick={() => void remove(item)} title={uiText('Move to the Trash')}>
                    <Trash2 />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {items && (
            <button className="media-add source-add" onClick={() => void add([])} disabled={busy}>
              {busy ? <span className="spinner" /> : <FilePlus />} {uiText(" Add PDFs")}
            </button>
          )}
        </div>
      )}
      {dragging && <div className="media-drop">{uiText('Drop to add to sources/')}</div>}
    </div>
  )
}

/** One PDF's pages: pick some to attach to the chat, or put one into the scene. */
function Pages({ item, onBack }: { item: SourceItem; onBack: () => void }) {
  const count = item.pages ?? 0
  const [thumbs, setThumbs] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const anchor = useRef<number | null>(null) // the last page clicked without Shift

  const more = async (from: number) => {
    setLoading(true)
    try {
      const pages = Array.from({ length: Math.min(BATCH, count - from) }, (_, i) => from + i + 1)
      const paths = await api.sourcePages(item.name, pages, THUMB_WIDTH)
      setThumbs((t) => [...t.slice(0, from), ...paths])
    } catch (e) {
      toast(errorText(e), 'error')
    }
    setLoading(false)
  }

  useEffect(() => {
    setThumbs([])
    setSelected([])
    void more(0)
    // A new PDF starts over.
  }, [item.name, item.size])

  const pick = (page: number, range: boolean) => {
    if (range && anchor.current !== null) {
      const [a, b] = anchor.current < page ? [anchor.current, page] : [page, anchor.current]
      setSelected((s) => [...new Set([...s, ...Array.from({ length: b - a + 1 }, (_, i) => a + i)])])
    } else {
      setSelected((s) => (s.includes(page) ? s.filter((p) => p !== page) : [...s, page]))
      anchor.current = page
    }
  }

  const insert = (page: number) => {
    const v = variable(item.name, page)
    useStore.setState({ leftTab: 'code' })
    requestAnimationFrame(
      () =>
        editorBridge.insertLines([`${v} = pdf_page("${item.name}", ${page})`, `self.play(FadeIn(${v}), run_time=0.6)`]) ||
        toast('Click in scene.py where it should go, then try again.', 'info'),
    )
  }

  const sorted = [...selected].sort((a, b) => a - b)
  return (
    <div className="source-pages">
      <div className="source-pages-head">
        <button className="icon-btn" onClick={onBack} title={uiText('Back to all PDFs')} aria-label={uiText('Back to all PDFs')}>
          <ArrowLeft />
        </button>
        <span className="media-name mono" title={item.name}>
          {item.name}
        </span>
        <span className="faint">
          {selected.length ? format('{0} selected', [selected.length]) : uiText('Click pages to pick them; Shift-click for a range')}
        </span>
      </div>
      <div className="page-grid">
        {thumbs.map((path, i) => (
          <button
            key={path}
            className={`page-thumb ${selected.includes(i + 1) ? 'on' : ''}`}
            onClick={(e) => pick(i + 1, e.shiftKey)}
            aria-pressed={selected.includes(i + 1)}
            title={format('Page {0}', [i + 1])}
          >
            <img src={api.mediaUrl(path)} alt="" loading="lazy" />
            <span className="page-num">{i + 1}</span>
          </button>
        ))}
      </div>
      {thumbs.length < count && (
        <button className="btn ghost small page-more" disabled={loading} onClick={() => void more(thumbs.length)}>
          {loading ? <span className="spinner" /> : null} {loading ? uiText('Loading pages…') : format('Show more pages ({0} of {1})', [thumbs.length, count])}
        </button>
      )}
      {selected.length > 0 && (
        <div className="page-bar">
          <span className="mono">p. {pageRanges(sorted)}</span>
          <button className="btn small primary" onClick={() => attachSource(item.name, sorted, 'Make a video from these pages: ')}>
            <Paperclip /> {uiText(" Attach to chat")}
          </button>
          {selected.length === 1 && (
            <button
              className="btn small"
              onClick={() => insert(sorted[0])}
              title={uiText('Show this page in the video: put pdf_page() into scene.py below the cursor')}
            >
              <Plus /> {uiText(" Show in video")}
            </button>
          )}
          <button className="btn small ghost" onClick={() => setSelected([])}>
            {uiText('Clear')}
          </button>
        </div>
      )}
    </div>
  )
}
