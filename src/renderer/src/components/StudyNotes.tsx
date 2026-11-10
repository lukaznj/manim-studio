import { Clock3, NotebookPen, Sparkles, Undo2, Video } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import { format, t } from '../lib/i18n'
import { errorText, jumpToMoment, toast, useStore } from '../store'
import { seekStudy } from './StudyPlayer'
import { Markdown } from './Markdown'

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const folderName = (dir: string) => dir.split(/[\\/]/).filter(Boolean).pop() ?? ''
// A moment in a note: [6:40](study:v.<lesson folder>.400). An empty folder (and the older plain [6:40]) is this video.
const MOMENT = /^v\.([a-zA-Z0-9._-]*)\.(\d+)$/
const withMoments = (text: string) => text.replace(/\[(\d+):(\d{2})\](?!\()/g, (_, m: string, s: string) => `[${m}:${s}](study:v..${Number(m) * 60 + Number(s)})`)

/**
 * The viewer's notes on this video, saved as they type. They read as formatted text; a click edits
 * them in place. Moments link to any lesson of the course, like the chat's. AI revisions are proposals.
 */
export function StudyNotes({ dir }: { dir: string }) {
  const prompt = t('What would you like to remember?')
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const [proposal, setProposal] = useState<string | null>(null)
  const [previous, setPrevious] = useState<string | null>(null)
  const current = useRef({ dir, text: '', dirty: false })
  const caret = useRef<number | null>(null) // where a moment goes: the last cursor position
  const area = useRef<HTMLTextAreaElement>(null)
  const active = useRef(true)
  const episodes = useStore((s) => s.watchSeries?.episodes)
  const lessons = useMemo(() => episodes?.filter((e) => e.video || e.dir === dir) ?? [], [episodes, dir])
  const flush = () => {
    const value = current.current
    if (!value.dirty) return
    value.dirty = false
    void api.saveStudyNotes(value.dir, value.text).catch((e) => { value.dirty = true; toast(errorText(e), 'error') })
  }
  useEffect(() => {
    active.current = true
    void api.studyNotes(dir).then((value) => {
      if (!active.current) return
      current.current = { dir, text: value, dirty: false }
      setText(value)
      setLoaded(true)
    }, (e) => toast(errorText(e), 'error'))
    window.addEventListener('beforeunload', flush)
    return () => { active.current = false; flush(); window.removeEventListener('beforeunload', flush) }
  }, [dir])
  useEffect(() => { const timer = setTimeout(flush, 350); return () => clearTimeout(timer) }, [text])
  // The field grows with the text, so editing never scrolls inside the card.
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = '0'
    el.style.height = `${el.scrollHeight}px`
  }, [text, editing])
  const change = (value: string) => { current.current.text = value; current.current.dirty = true; setText(value) }
  const edit = () => {
    if (!loaded) return
    setEditing(true)
    requestAnimationFrame(() => { const el = area.current; if (el) { el.focus(); const at = caret.current ?? el.value.length; el.setSelectionRange(at, at) } })
  }
  const insertMoment = (lesson: string, at: number) => {
    const link = `[${clock(at)}](study:v.${lesson === dir ? '' : folderName(lesson)}.${Math.floor(at)}) `
    const start = caret.current ?? text.length
    const before = text.slice(0, start)
    change(before + (before && !/\s$/.test(before) ? ' ' : '') + link + text.slice(start))
    caret.current = start + link.length + (before && !/\s$/.test(before) ? 1 : 0)
    setPicking(false)
  }
  const moment = (id: string) => {
    const m = MOMENT.exec(id)
    if (!m) return null
    const lesson = m[1] ? lessons.find((e) => folderName(e.dir) === m[1]) : undefined
    const at = Number(m[2])
    const here = !m[1] || lesson?.dir === dir
    return (
      <button className="study-reference-link" onClick={(e) => {
        e.stopPropagation()
        if (here) seekStudy(at, true)
        else if (lesson) void jumpToMoment(lesson.dir, at)
      }} disabled={!here && !lesson}>
        <Video /><span>{here || !lesson ? clock(at) : `${format('Lesson {0}', [lesson.number])} · ${clock(at)}`}</span>
      </button>
    )
  }

  return (
    <section className="study-notes" aria-label={t('Your notes')}>
      <header>
        <strong><NotebookPen />{t('Your notes')}</strong>
        <div className="study-notes-actions">
          <button className="icon-btn" disabled={!loaded} title={t('Insert a moment')} aria-label={t('Insert a moment')} aria-expanded={picking} onMouseDown={(e) => e.preventDefault()} onClick={() => setPicking((v) => !v)}><Clock3 /></button>
          <button className="icon-btn" disabled={!text.trim() || busy || !loaded} title={t('Refine notes')} aria-label={t('Refine notes')} onClick={async () => {
            setBusy(true); flush()
            try { const next = await api.refineStudyNotes(dir, text); if (active.current) setProposal(next) }
            catch (e) { toast(errorText(e), 'error') }
            finally { if (active.current) setBusy(false) }
          }}>{busy ? <span className="spinner" /> : <Sparkles />}</button>
        </div>
      </header>
      {picking && <MomentPicker dir={dir} lessons={lessons} onInsert={insertMoment} onCancel={() => setPicking(false)} />}
      {editing ? (
        <textarea ref={area} className="study-notes-body study-notes-input" value={text} onChange={(e) => change(e.target.value)}
          onSelect={(e) => (caret.current = e.currentTarget.selectionStart)}
          onBlur={(e) => { caret.current = e.currentTarget.selectionStart; flush(); setEditing(false) }}
          onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
          placeholder={prompt} aria-label={t('Video notes')} />
      ) : (
        <div className={`study-notes-body md ${text ? '' : 'is-empty'}`} role="textbox" tabIndex={0} aria-label={t('Video notes')}
          onClick={(e) => !(e.target as HTMLElement).closest('a, button') && !window.getSelection()?.toString() && edit()}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), edit())}>
          {text ? <Markdown text={withMoments(text)} reference={moment} /> : <p>{prompt}</p>}
        </div>
      )}
      {previous !== null && <button className="link-btn" onClick={() => { change(previous); setPrevious(null) }}><Undo2 />{t('Undo refinement')}</button>}
      {proposal !== null && (
        <div className="study-notes-proposal">
          <div className="md"><Markdown text={withMoments(proposal)} reference={moment} /></div>
          <div>
            <button className="btn small ghost" onClick={() => setProposal(null)}>{t('Keep my notes')}</button>
            <button className="btn small primary" onClick={() => { setPrevious(text); change(proposal); setProposal(null) }}>{t('Use this revision')}</button>
          </div>
        </div>
      )}
    </section>
  )
}

/** Which lesson and when: the one playing, now, unless changed. */
function MomentPicker({ dir, lessons, onInsert, onCancel }: { dir: string; lessons: { dir: string; number: number; title: string }[]; onInsert: (lesson: string, at: number) => void; onCancel: () => void }) {
  const [lesson, setLesson] = useState(dir)
  const [time, setTime] = useState(() => clock(useStore.getState().watchTime ?? 0))
  const parsed = /^(\d+):([0-5]\d)$/.exec(time.trim())
  const at = parsed ? Number(parsed[1]) * 60 + Number(parsed[2]) : null
  return (
    <form className="study-moment-picker" onSubmit={(e) => { e.preventDefault(); if (at !== null) onInsert(lesson, at) }} onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      {lessons.length > 1 && (
        <select className="input" value={lesson} onChange={(e) => setLesson(e.target.value)} aria-label={t('Lesson')}>
          {lessons.map((e) => <option key={e.dir} value={e.dir}>{format('Lesson {0}', [e.number])} · {e.title}</option>)}
        </select>
      )}
      <input className="input mono" value={time} onChange={(e) => setTime(e.target.value)} aria-label={t('Time')} aria-invalid={at === null} autoFocus onFocus={(e) => e.target.select()} />
      <button className="btn small primary" disabled={at === null}>{t('Insert')}</button>
    </form>
  )
}
