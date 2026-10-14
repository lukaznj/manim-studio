import { ArrowDown, ArrowUp, FileText, Library, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DEFAULT_TONE, TONES } from '../../../shared/tone'
import type { Aspect, SeriesPlan, Theme, Tone } from '../../../shared/types'
import { api } from '../lib/api'
import { LANGUAGES, languageName } from '../lib/languages'
import { closeDialog, errorText, toast, useStore } from '../store'
import { Modal, Tabs } from './ui'

/**
 * Series mode (src/main/series.ts): a batch of PDFs, such as a course's lectures, becomes a series of
 * videos. Claude proposes the episodes and a series bible; you edit and accept; Studio makes them.
 */
export function SeriesDialog() {
  const open = useStore((s) => s.dialog?.kind === 'series')
  const defaultVoice = useStore((s) => s.settings?.defaultVoice)
  const [pdfs, setPdfs] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [aspect, setAspect] = useState<Aspect>('16:9')
  const [theme, setTheme] = useState<Theme>('dark')
  const [tone, setTone] = useState<Tone>(DEFAULT_TONE)
  const [language, setLanguage] = useState('en')
  const [unattended, setUnattended] = useState(true)
  const [plan, setPlan] = useState<SeriesPlan | null>(null)
  const [busy, setBusy] = useState<'planning' | 'starting' | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!open) return
    setPdfs([])
    setTitle('')
    setPlan(null)
    setBusy(null)
    if (defaultVoice) setLanguage(defaultVoice.language)
  }, [open]) // a fresh form each time

  const add = (paths: string[]) => setPdfs((p) => [...p, ...paths.filter((x) => /\.pdf$/i.test(x) && !p.includes(x))])
  const move = <T,>(list: T[], i: number, by: number) => {
    const next = [...list]
    const [item] = next.splice(i, 1)
    next.splice(i + by, 0, item)
    return next
  }
  const name = (p: string) => p.split(/[\\/]/).pop() ?? p

  const makePlan = async () => {
    setBusy('planning')
    try {
      setPlan(await api.planSeries({ pdfs, title: title.trim() || undefined, language, tone }))
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy(null)
    }
  }

  const start = async () => {
    if (!plan) return
    setBusy('starting')
    try {
      await api.startSeries({
        plan,
        pdfs,
        aspect,
        theme,
        tone,
        language,
        voice: defaultVoice ? { ...defaultVoice, language } : undefined,
        export: { themes: [theme], languages: [], languageVideos: false },
        unattended,
      })
      closeDialog()
      toast(unattended ? `Making ${plan.episodes.length} episodes, one after another.` : `Created ${plan.episodes.length} episodes. Here's the first.`, 'ok')
    } catch (e) {
      toast(errorText(e), 'error')
      setBusy(null)
    }
  }

  const setEpisode = (i: number, patch: Partial<SeriesPlan['episodes'][number]>) =>
    setPlan((p) => p && { ...p, episodes: p.episodes.map((e, j) => (j === i ? { ...e, ...patch } : e)) })

  return (
    <Modal
      open={open}
      onClose={() => busy !== 'planning' && closeDialog()}
      title={plan ? 'The series plan' : 'New series'}
      icon={<Library className="head-icon" />}
      width={760}
      footer={
        plan ? (
          <>
            <button className="btn ghost" disabled={!!busy} onClick={() => setPlan(null)}>
              Back
            </button>
            <button className="btn primary" disabled={!!busy || !plan.episodes.length} onClick={() => void start()}>
              {busy === 'starting' && <span className="spinner" />}
              {unattended ? `Make all ${plan.episodes.length} episodes` : `Create ${plan.episodes.length} episodes`}
            </button>
          </>
        ) : (
          <>
            <button className="btn ghost" disabled={busy === 'planning'} onClick={closeDialog}>
              Cancel
            </button>
            <button className="btn primary" disabled={!pdfs.length || !!busy} onClick={() => void makePlan()}>
              {busy === 'planning' ? <span className="spinner" /> : <Library />} {busy === 'planning' ? 'Claude is reading and planning…' : 'Plan the episodes'}
            </button>
          </>
        )
      }
    >
      {!plan ? (
        <div className="modal-body quick-form">
          <p className="hint">
            Add a course's material, one PDF per lecture for example. Claude reads it all and proposes the episodes: usually one per PDF, merged or split where that
            makes better videos. You review the plan before anything is made.
          </p>
          <div className="field">
            <label htmlFor="series-title">Series title</label>
            <input id="series-title" className="input" data-autofocus placeholder="Optional: Claude names it from the material" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div
            className={`series-pdfs ${dragging ? 'dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              add([...e.dataTransfer.files].map((f) => api.pathForFile(f)))
            }}
          >
            {pdfs.map((p, i) => (
              <div key={p} className="series-pdf" title={p}>
                <span className="mono faint">{i + 1}</span>
                <FileText />
                <span className="series-pdf-name">{name(p)}</span>
                <button className="icon-btn" disabled={i === 0} onClick={() => setPdfs(move(pdfs, i, -1))} aria-label="Earlier">
                  <ArrowUp />
                </button>
                <button className="icon-btn" disabled={i === pdfs.length - 1} onClick={() => setPdfs(move(pdfs, i, 1))} aria-label="Later">
                  <ArrowDown />
                </button>
                <button className="icon-btn" onClick={() => setPdfs(pdfs.filter((x) => x !== p))} aria-label={`Remove ${name(p)}`}>
                  <X />
                </button>
              </div>
            ))}
            <div className="series-add">
              <button className="btn small" onClick={() => void api.pickPdfs().then(add)}>
                <Plus /> Add PDFs
              </button>
              <span className="hint">{pdfs.length ? 'In course order: drag more in, or reorder with the arrows.' : 'or drop them here, in course order.'}</span>
            </div>
          </div>
          <div className="quick-row">
            <div className="field">
              <span className="label">Format</span>
              <Tabs
                radio="Format"
                value={aspect}
                onChange={setAspect}
                items={[
                  { value: '16:9', label: '16:9 landscape' },
                  { value: '9:16', label: '9:16 portrait' },
                ]}
              />
            </div>
            <div className="field">
              <label htmlFor="series-lang">Language</label>
              <select id="series-lang" className="select" value={language} onChange={(e) => setLanguage(e.target.value)}>
                {(LANGUAGES.includes(language) ? LANGUAGES : [language, ...LANGUAGES]).map((code) => (
                  <option key={code} value={code}>
                    {languageName.of(code)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="quick-row">
            <div className="field">
              <span className="label">Tone</span>
              <Tabs radio="Tone" value={tone} onChange={setTone} items={TONES.map((t) => ({ value: t.value, label: t.label }))} />
            </div>
            <div className="field">
              <span className="label">Theme</span>
              <Tabs
                radio="Theme"
                value={theme}
                onChange={setTheme}
                items={[
                  { value: 'dark', label: 'Dark' },
                  { value: 'light', label: 'Light' },
                ]}
              />
            </div>
          </div>
          <label className="export-check">
            <input type="checkbox" checked={unattended} onChange={(e) => setUnattended(e.target.checked)} />
            <span>
              Make every episode now, unattended <span className="hint">In quick mode, one after another, each exported when it's done. Off: the episodes are created, and you make each in the editor.</span>
            </span>
          </label>
        </div>
      ) : (
        <div className="modal-body series-plan">
          <div className="field">
            <label htmlFor="series-plan-title">Series title</label>
            <input id="series-plan-title" className="input" value={plan.title} onChange={(e) => setPlan({ ...plan, title: e.target.value })} />
          </div>
          <ol className="series-episodes">
            {plan.episodes.map((ep, i) => (
              <li key={i} className="series-episode">
                <span className="series-number mono">{i + 1}</span>
                <div className="series-episode-body">
                  <input className="input" value={ep.title} onChange={(e) => setEpisode(i, { title: e.target.value })} aria-label={`Episode ${i + 1} title`} />
                  <textarea className="textarea" rows={2} value={ep.summary} onChange={(e) => setEpisode(i, { summary: e.target.value })} aria-label={`Episode ${i + 1} summary`} />
                  <span className="hint">
                    {ep.sources.map((s) => `${s.file}${s.pages ? ` p. ${s.pages}` : ''}`).join(' · ') || 'No source pages'}
                    {ep.buildsOn?.length ? ` · builds on ${ep.buildsOn.join(', ')}` : ''}
                  </span>
                </div>
                <div className="series-episode-actions">
                  <button className="icon-btn" disabled={i === 0} onClick={() => setPlan({ ...plan, episodes: move(plan.episodes, i, -1) })} aria-label="Earlier">
                    <ArrowUp />
                  </button>
                  <button className="icon-btn" disabled={i === plan.episodes.length - 1} onClick={() => setPlan({ ...plan, episodes: move(plan.episodes, i, 1) })} aria-label="Later">
                    <ArrowDown />
                  </button>
                  <button className="icon-btn" onClick={() => setPlan({ ...plan, episodes: plan.episodes.filter((_, j) => j !== i) })} aria-label="Remove this episode">
                    <Trash2 />
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <details className="series-bible">
            <summary>The series bible (series.md): audience, notation, visual vocabulary</summary>
            <textarea className="textarea" rows={12} value={plan.bible} onChange={(e) => setPlan({ ...plan, bible: e.target.value })} />
          </details>
        </div>
      )}
    </Modal>
  )
}
