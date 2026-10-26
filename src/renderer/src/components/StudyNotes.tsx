import { Check, Clock3, Eye, NotebookPen, Pencil, Sparkles, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { t } from '../lib/i18n'
import { errorText, toast, useStore } from '../store'
import { seekStudy } from './StudyPlayer'
import { Markdown } from './Markdown'

/** Notes belong to this video on disk. AI revisions are proposals, never silent replacements. */
export function StudyNotes({ dir }: { dir: string }) {
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [preview, setPreview] = useState(false)
  const [saved, setSaved] = useState(true)
  const [busy, setBusy] = useState(false)
  const [proposal, setProposal] = useState<string | null>(null)
  const [previous, setPrevious] = useState<string | null>(null)
  const current = useRef({ dir, text: '', dirty: false })
  const area = useRef<HTMLTextAreaElement>(null)
  const active = useRef(true)
  const flush = () => {
    const value = current.current
    if (!value.dirty) return
    const snapshot = value.text
    value.dirty = false
    void api.saveStudyNotes(value.dir, snapshot).then(() => { if (active.current && snapshot === current.current.text) setSaved(true) }, (e) => { value.dirty = true; toast(errorText(e), 'error') })
  }
  useEffect(() => {
    active.current = true
    void api.studyNotes(dir).then((value) => {
      if (!active.current) return
      current.current = { dir, text: value, dirty: false }
      setText(value); setLoaded(true)
    }, (e) => toast(errorText(e), 'error'))
    window.addEventListener('beforeunload', flush)
    return () => { active.current = false; flush(); window.removeEventListener('beforeunload', flush) }
  }, [dir])
  useEffect(() => { const timer = setTimeout(flush, 350); return () => clearTimeout(timer) }, [text])
  const change = (value: string) => { current.current.text = value; current.current.dirty = true; setText(value); setSaved(false) }
  return <section className="study-notes" aria-label={t('Your notes')}>
    <header><span><NotebookPen /><strong>{t('Your notes')}</strong></span><small>{saved ? <><Check />{t('Saved on this device')}</> : t('Saving…')}</small></header>
    <div className="study-notes-toolbar">
      <button className={`btn small ghost ${preview ? '' : 'active'}`} disabled={!loaded} onClick={() => { setPreview(false); area.current?.focus() }}><Pencil />{t('Write')}</button>
      <button className={`btn small ghost ${preview ? 'active' : ''}`} disabled={!loaded} onClick={() => setPreview(true)}><Eye />{t('Preview')}</button>
      <span />
      <button className="btn small ghost" disabled={!loaded || preview} title={t('Insert current timestamp')} onClick={() => {
        const at = useStore.getState().watchTime ?? 0
        const stamp = `[${Math.floor(at / 60)}:${String(Math.floor(at % 60)).padStart(2, '0')}] `
        const el = area.current, start = el?.selectionStart ?? text.length, end = el?.selectionEnd ?? start
        change(text.slice(0, start) + stamp + text.slice(end))
        requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + stamp.length, start + stamp.length) })
      }}><Clock3 /></button>
      <button className="btn small" disabled={!text.trim() || busy || !loaded} onClick={async () => {
        setBusy(true); flush()
        try { const next = await api.refineStudyNotes(dir, text); if (active.current) setProposal(next) }
        catch (e) { toast(errorText(e), 'error') }
        finally { if (active.current) setBusy(false) }
      }}>{busy ? <span className="spinner" /> : <Sparkles />}{t('Refine notes')}</button>
    </div>
    {preview ? <div className="md study-notes-preview">{text ? text.split(/(\[\d+:\d{2}\])/).map((part, i) => /^\[\d+:\d{2}\]$/.test(part) ? <button key={i} className="study-note-time" onClick={() => { const [m, s] = part.slice(1, -1).split(':').map(Number); seekStudy(m * 60 + s) }}>{part}</button> : <Markdown key={i} text={part} />) : <p className="faint">{t('Your ideas, in your own words.')}</p>}</div>
      : <textarea ref={area} className="study-notes-input" disabled={!loaded} value={text} onChange={(e) => change(e.target.value)} onBlur={flush} placeholder={t('Capture an idea, a question or a formula… Use $…$ for mathematics.')} aria-label={t('Video notes')} />}
    {previous !== null && <button className="link-btn" onClick={() => { change(previous); setPrevious(null) }}><Undo2 />{t('Undo refinement')}</button>}
    {proposal !== null && <div className="study-notes-proposal"><span className="eyebrow">{t('Suggested revision')}</span><div className="md"><Markdown text={proposal} /></div><div><button className="btn small" onClick={() => setProposal(null)}>{t('Keep my notes')}</button><button className="btn small primary" onClick={() => { setPrevious(text); change(proposal); setProposal(null); setPreview(true) }}>{t('Use this revision')}</button></div></div>}
  </section>
}
