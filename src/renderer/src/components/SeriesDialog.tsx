import { ArrowDown, ArrowUp, Check, Circle, FileText, Library, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { DEFAULT_TONE, TONES } from '../../../shared/tone'
import type { Aspect, Effort, SeriesPlan, SeriesPlanProgress, Theme, Tone, VoiceSettings } from '../../../shared/types'
import { api } from '../lib/api'
import { closeDialog, errorText, toast, useStore } from '../store'
import { ModelPicker } from './ChatPane'
import { ExportOn } from './ExportDialog'
import { VoiceForm, voiceProblem } from './SettingsDialog'
import { Modal, Tabs } from './ui'

/**
 * Series mode (src/main/series.ts): a batch of PDFs, such as a course's lectures, becomes a series of
 * videos. Claude proposes the episodes and a series bible; you edit and accept; Studio makes them.
 */
export function SeriesDialog() {
  const open = useStore((s) => s.dialog?.kind === 'series')
  const defaultVoice = useStore((s) => s.settings?.defaultVoice)
  const hasKey = useStore((s) => !!s.settings?.hasElevenLabsKey)
  const omnivoice = useStore((s) => s.setup?.omnivoice)
  const codex = useStore((s) => s.settings?.agent === 'codex')
  const agents = useStore((s) => s.settings?.seriesAgents || 3)
  const [pdfs, setPdfs] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [aspect, setAspect] = useState<Aspect>('16:9')
  const [theme, setTheme] = useState<Theme>('dark')
  const [tone, setTone] = useState<Tone>(DEFAULT_TONE)
  const [voice, setVoice] = useState<VoiceSettings>({ provider: 'elevenlabs', language: 'en' })
  const [unattended, setUnattended] = useState(true)
  const settings = useStore((s) => s.settings)
  const [model, setModel] = useState('')
  const [effort, setEffort] = useState<Effort>('high')
  const [server, setServer] = useState<string | undefined>()
  const [plan, setPlan] = useState<SeriesPlan | null>(null)
  const [busy, setBusy] = useState<'planning' | 'starting' | null>(null)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<SeriesPlanProgress | null>(null)
  const cancelled = useRef(false)

  useEffect(() => {
    if (!open) return
    setPdfs([])
    setTitle('')
    setInstructions('')
    setModel(settings?.claudeModel ?? '')
    setEffort(settings?.claudeEffort || 'high')
    setPlan(null)
    setBusy(null)
    if (defaultVoice) setVoice(defaultVoice)
  }, [open]) // a fresh form each time

  const language = voice.language
  // Checked before planning, so a series never gets made without a voice.
  const voiceIssue = voiceProblem(voice, hasKey, omnivoice)

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
    setProgress(null)
    cancelled.current = false
    const off = api.on('series-plan', setProgress)
    try {
      setPlan(
        await api.planSeries({
          pdfs,
          title: title.trim() || undefined,
          instructions: instructions.trim() || undefined,
          language,
          tone,
          model: model || undefined,
          effort,
        }),
      )
    } catch (e) {
      if (!cancelled.current) toast(errorText(e), 'error')
    } finally {
      off()
      setBusy(null)
    }
  }
  const cancelPlan = () => {
    cancelled.current = true
    void api.cancelSeriesPlan()
  }

  const start = async () => {
    if (!plan || voiceIssue) return
    setBusy('starting')
    try {
      await api.startSeries({
        model: model || undefined,
        effort,
        plan: { ...plan, instructions: instructions.trim() || undefined },
        pdfs,
        aspect,
        theme,
        tone,
        language,
        voice,
        export: { themes: [theme], languages: [], languageVideos: false, server },
        unattended,
      })
      closeDialog()
      toast(
        unattended
          ? codex
            ? `Making ${plan.episodes.length} episodes, one after another.`
            : `Making ${plan.episodes.length} episodes. Home shows how each one is going.`
          : `Created ${plan.episodes.length} episodes. Here's the first.`,
        'ok',
      )
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
      onClose={() => (busy === 'planning' ? cancelPlan() : closeDialog())}
      title={plan ? 'The series plan' : 'New series'}
      icon={<Library className="head-icon" />}
      width={760}
      footer={
        plan ? (
          <>
            <button className="btn ghost" disabled={!!busy} onClick={() => setPlan(null)}>
              Back
            </button>
            <button
              className="btn primary"
              disabled={!!busy || !plan.episodes.length || !!voiceIssue}
              title={voiceIssue ?? undefined}
              onClick={() => void start()}
            >
              {busy === 'starting' && <span className="spinner" />}
              {unattended ? `Make all ${plan.episodes.length} episodes` : `Create ${plan.episodes.length} episodes`}
            </button>
          </>
        ) : (
          <>
            <button className="btn ghost" onClick={busy === 'planning' ? cancelPlan : closeDialog}>
              {busy === 'planning' ? 'Stop planning' : 'Cancel'}
            </button>
            <button className="btn primary" disabled={!pdfs.length || !!busy || !!voiceIssue} title={voiceIssue ?? undefined} onClick={() => void makePlan()}>
              {busy === 'planning' ? <span className="spinner" /> : <Library />} {busy === 'planning' ? 'Planning…' : 'Plan the episodes'}
            </button>
          </>
        )
      }
    >
      {busy === 'planning' ? (
        <PlanProgress pdfs={pdfs.map(name)} progress={progress} />
      ) : !plan ? (
        <div className="modal-body quick-form">
          <p className="hint">
            Add a course's material, one PDF per lecture for example. Claude reads it all and proposes the episodes: usually one per PDF, merged or split where
            that makes better videos. You review the plan before anything is made.
          </p>
          <div className="field">
            <label htmlFor="series-title">Series title</label>
            <input
              id="series-title"
              className="input"
              data-autofocus
              placeholder="Optional: Claude names it from the material"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="series-instructions">How to make it</label>
            <textarea
              id="series-instructions"
              className="textarea series-instructions"
              rows={3}
              placeholder="Optional. For example: I'm revising this before a new subject, so keep it intuitive and don't go deep into the formulas."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
            <span className="hint">Claude plans the episodes with it, and every episode follows it (series.md keeps it).</span>
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
          <div className="np-voice set-group">
            <div className="eyebrow">Narration</div>
            <VoiceForm voice={voice} onChange={setVoice} inProject={false} />
          </div>
          {voiceIssue && <div className="quick-warning">{voiceIssue} The episodes are made without you, so the voice has to be ready first.</div>}
          {!codex && (
            <div className="field">
              <span className="label">Claude model</span>
              <ModelPicker
                model={model}
                effort={effort}
                onChange={(m, e) => {
                  setModel(m)
                  if (e) setEffort(e)
                }}
              />
              <span className="hint">
                For planning and every episode of this series; the chat keeps its own. Opus and higher effort cost much more of your plan.
              </span>
            </div>
          )}
          {unattended && <ExportOn value={server} onChange={setServer} />}
          <label className="export-check">
            <input type="checkbox" checked={unattended} onChange={(e) => setUnattended(e.target.checked)} />
            <span>
              Make every episode now, unattended{' '}
              <span className="hint">
                {codex
                  ? 'One after another, each exported when it’s done.'
                  : `The scripts are written in order, and each video starts as soon as its script is ready, ${agents} agents at a time (Settings → Agent); each is exported when it’s done.`}{' '}
                Off: the episodes are created, and you make each in the editor.
              </span>
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
                  <textarea
                    className="textarea"
                    rows={2}
                    value={ep.summary}
                    onChange={(e) => setEpisode(i, { summary: e.target.value })}
                    aria-label={`Episode ${i + 1} summary`}
                  />
                  <span className="hint">
                    {ep.sources.map((s) => `${s.file}${s.pages ? ` p. ${s.pages}` : ''}`).join(' · ') || 'No source pages'}
                    {ep.buildsOn?.length ? ` · builds on ${ep.buildsOn.join(', ')}` : ''}
                  </span>
                </div>
                <div className="series-episode-actions">
                  <button
                    className="icon-btn"
                    disabled={i === 0}
                    onClick={() => setPlan({ ...plan, episodes: move(plan.episodes, i, -1) })}
                    aria-label="Earlier"
                  >
                    <ArrowUp />
                  </button>
                  <button
                    className="icon-btn"
                    disabled={i === plan.episodes.length - 1}
                    onClick={() => setPlan({ ...plan, episodes: move(plan.episodes, i, 1) })}
                    aria-label="Later"
                  >
                    <ArrowDown />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => setPlan({ ...plan, episodes: plan.episodes.filter((_, j) => j !== i) })}
                    aria-label="Remove this episode"
                  >
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

/** What planning is doing: each PDF as it's read, then the episodes as the agent writes them. */
function PlanProgress({ pdfs, progress }: { pdfs: string[]; progress: SeriesPlanProgress | null }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const clock = (since = now) => {
    const s = Math.max(0, Math.round((now - since) / 1000))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }
  const reading = !progress || progress.stage === 'reading'
  const pages = progress?.read.reduce((n, r) => n + r.pages, 0) ?? 0
  const episodes = progress?.episodes ?? []
  return (
    <div className="modal-body series-progress" aria-live="polite">
      <div className="series-progress-head">
        <strong>
          {reading
            ? `Reading PDF ${progress?.index ?? 1} of ${pdfs.length}`
            : progress.stage === 'bible'
              ? 'Writing the series bible'
              : episodes.length
                ? `Planning episode ${episodes.length}`
                : 'Claude is reading the material and planning'}
        </strong>
        <span className="mono faint">{clock(progress?.startedAt)}</span>
      </div>
      {reading && (
        <ol className="quick-steps">
          {pdfs.map((file, i) => {
            const read = progress?.read[i]
            const state = read ? 'done' : reading && (progress?.index ?? 1) === i + 1 ? 'now' : 'todo'
            return (
              <li key={i} className={state}>
                {state === 'done' ? <Check /> : state === 'now' ? <span className="spinner" /> : <Circle />}
                <span className="series-progress-name">{file}</span>
                {read && <span className="mono faint">{read.pages} pages</span>}
              </li>
            )
          })}
        </ol>
      )}
      {!reading && (
        <>
          <div className="series-progress-head">
            <span className="muted">
              Read {pdfs.length} PDFs, {pages} pages.{' '}
              {!episodes.length
                ? 'The episodes appear here as Claude writes them; this usually takes a few minutes.'
                : progress.stage === 'bible'
                  ? `The ${episodes.length} episodes:`
                  : `Episodes so far (${episodes.length}):`}
            </span>
          </div>
          {episodes.length > 0 && (
            <ol className="series-progress-episodes">
              {episodes.map((t, i) => (
                <li key={i}>
                  <span className="series-number mono">{i + 1}</span> {t}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  )
}
