import { t as uiText, format } from '../lib/i18n'
import { ArrowDown, ArrowUp, Check, Circle, FileText, Library, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { DEFAULT_TONE } from '../../../shared/tone'
import type { Agent, AgentSelection, Aspect, Effort, ModelOption, SeriesPlan, SeriesPlanProgress, Theme, Tone, VoiceSettings } from '../../../shared/types'
import { defaultAgentSelection } from '../../../shared/agent-selection'
import { api } from '../lib/api'
import { studying, closeDialog, errorText, toast, useStore } from '../store'
import { ModelPicker } from './ChatPane'
import { ExportOn } from './ExportDialog'
import { voiceProblem } from './SettingsDialog'
import { Modal } from './ui'

/**
 * Series mode (src/main/series.ts): a batch of PDFs, such as a course's lectures, becomes a series of
 * videos. Claude proposes the episodes and a series bible; you edit and accept; Studio makes them.
 */
export function SeriesDialog() {
  const open = useStore((s) => s.dialog?.kind === 'series')
  const defaultVoice = useStore((s) => s.settings?.defaultVoice)
  const defaults = useStore((s) => s.settings)
  const hasKey = useStore((s) => !!s.settings?.hasElevenLabsKey)
  const omnivoice = useStore((s) => s.setup?.omnivoice)
  const agents = useStore((s) => s.settings?.seriesAgents || 3)
  const [pdfs, setPdfs] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const aspect: Aspect = defaults?.defaultAspect ?? '16:9'
  const theme: Theme = defaults?.defaultTheme ?? 'dark'
  const tone: Tone = defaults?.defaultTone ?? DEFAULT_TONE
  const voice: VoiceSettings = defaultVoice ?? { provider: 'elevenlabs', language: 'en' }
  const [unattended, setUnattended] = useState(true)
  const editing = useStore((s) => !studying(s))
  const comparison = !!defaults?.developerMode && !!defaults.developerEpisodeModels && !editing
  const measuring = !!defaults?.developerMode && !!(defaults.developerUsageMetrics || defaults.developerTimingMetrics || defaults.developerResourceMetrics)
  const [catalog, setCatalog] = useState<{ agent: Agent; models: ModelOption[] }[]>([])
  const [catalogReady, setCatalogReady] = useState(false)
  const [catalogErrors, setCatalogErrors] = useState<string[]>([])
  const settings = useStore((s) => s.settings)
  const agent = settings?.agent ?? 'claude'
  const [planningCatalog, setPlanningCatalog] = useState<{ agent: Agent; models: ModelOption[]; error?: string } | null>(null)
  const [catalogAttempt, setCatalogAttempt] = useState(0)
  const planningModels = planningCatalog?.agent === agent ? planningCatalog.models : []
  const planningError = planningCatalog?.agent === agent ? planningCatalog.error : undefined
  const planningReady = planningModels.length > 0 && !planningError
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
    const selection = settings && defaultAgentSelection(settings)
    setModel(selection?.model ?? '')
    setEffort(selection?.effort || 'high')
    setPlan(null)
    setBusy(null)
  }, [open]) // a fresh form each time

  useEffect(() => {
    if (!open) return
    let active = true
    const selection = settings && defaultAgentSelection(settings)
    setModel(selection?.model ?? '')
    setEffort(selection?.effort || 'high')
    setPlanningCatalog(null)
    void api.chatModels(agent).then(
      (models) => {
        if (active)
          setPlanningCatalog({
            agent,
            models,
            error: models.length ? undefined : uiText('No models were returned. Check the selected agent in Settings → Accounts and retry.'),
          })
      },
      (error) => active && setPlanningCatalog({ agent, models: [], error: errorText(error) }),
    )
    return () => {
      active = false
    }
  }, [open, agent, catalogAttempt])

  useEffect(() => {
    if (!open || !comparison) return
    let active = true
    setCatalogReady(false)
    setCatalogErrors([])
    void Promise.all(
      (['claude', 'codex', 'antigravity'] as const).map(async (agent) => {
        try {
          const status = await api.claudeStatus(agent)
          if (!status.loggedIn) return { agent, models: [] }
          return { agent, models: (await api.chatModels(agent)).filter((m) => m.value) }
        } catch (e) {
          return { agent, models: [], error: `${AGENT_LABELS[agent]}: ${errorText(e)}` }
        }
      }),
    ).then((results) => {
      if (!active) return
      setCatalog(results.filter((r) => r.models.length))
      setCatalogErrors(results.flatMap((r) => (r.error ? [r.error] : [])))
      setCatalogReady(true)
    })
    return () => {
      active = false
    }
  }, [open, comparison])

  const selectionFor = (ep: SeriesPlan['episodes'][number]): AgentSelection | undefined => {
    if (ep.assignment) return ep.assignment
    const entry = catalog.find((c) => c.agent === settings?.agent) ?? catalog[0]
    if (!entry) return undefined
    const preferred = settings && defaultAgentSelection({ ...settings, agent: entry.agent })
    const chosen = entry.models.find((m) => m.value === (entry.agent === settings?.agent ? model : preferred?.model)) ?? entry.models[0]
    const effort = preferred?.effort ?? 'high'
    return {
      agent: entry.agent,
      model: chosen.value,
      effort: chosen.efforts.includes(effort) ? effort : chosen.efforts.includes('medium') ? 'medium' : chosen.efforts[0],
    }
  }
  const assignmentsReady =
    !comparison ||
    (catalogReady &&
      !!plan &&
      plan.episodes.every((ep) => {
        const selection = selectionFor(ep)
        return (
          selection &&
          catalog
            .find((c) => c.agent === selection.agent)
            ?.models.some((m) => m.value === selection.model && (!selection.effort || m.efforts.includes(selection.effort)))
        )
      }))

  const language = voice.language
  // Checked before planning, so a series never gets made without a voice.
  const elevenLabsCheck = useStore((s) => s.elevenLabsCheck)
  const voiceIssue = voiceProblem(voice, hasKey, omnivoice, elevenLabsCheck)

  const add = (paths: string[]) => setPdfs((p) => [...p, ...paths.filter((x) => /\.pdf$/i.test(x) && !p.includes(x))])
  const move = <T,>(list: T[], i: number, by: number) => {
    const next = [...list]
    const [item] = next.splice(i, 1)
    next.splice(i + by, 0, item)
    return next
  }
  const name = (p: string) => p.split(/[\\/]/).pop() ?? p

  const makePlan = async () => {
    if (!planningReady) return
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
        plan: {
          ...plan,
          instructions: instructions.trim() || undefined,
          episodes: plan.episodes.map((ep) => ({ ...ep, assignment: comparison ? selectionFor(ep) : undefined })),
        },
        pdfs,
        aspect,
        theme,
        tone,
        language,
        voice,
        export: { themes: [theme], languages: [], languageVideos: false, server },
        unattended: unattended || !editing,
      })
      closeDialog()
      toast(
        unattended
          ? `Making ${plan.episodes.length} episodes. Home shows how each one is going.`
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
      title={plan ? uiText('The series plan') : uiText('New series')}
      icon={<Library className="head-icon" />}
      width={760}
      footer={
        plan ? (
          <>
            <button className="btn ghost" disabled={!!busy} onClick={() => setPlan(null)}>
              {uiText('Back')}
            </button>
            <button
              className="btn primary"
              disabled={!!busy || !plan.episodes.length || !!voiceIssue || !assignmentsReady}
              title={voiceIssue ?? undefined}
              onClick={() => void start()}
            >
              {busy === 'starting' && <span className="spinner" />}
              {unattended ? format('Make all {0} episodes', [plan.episodes.length]) : format('Create {0} episodes', [plan.episodes.length])}
            </button>
          </>
        ) : (
          <>
            <button className="btn ghost" onClick={busy === 'planning' ? cancelPlan : closeDialog}>
              {busy === 'planning' ? uiText('Stop planning') : uiText('Cancel')}
            </button>
            <button
              className="btn primary"
              disabled={!pdfs.length || !!busy || !!voiceIssue || !planningReady}
              title={voiceIssue ?? undefined}
              onClick={() => void makePlan()}
            >
              {busy === 'planning' ? <span className="spinner" /> : <Library />} {busy === 'planning' ? uiText('Planning…') : uiText('Plan the episodes')}
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
            {uiText(
              "Add a course's material, one PDF per lecture for example. Your selected agent reads it all and proposes the episodes: usually one per PDF, merged or split where that makes better videos. You review the plan before anything is made.",
            )}
          </p>
          <div className="field">
            <label htmlFor="series-title">{uiText('Series title')}</label>
            <input
              id="series-title"
              className="input"
              data-autofocus
              placeholder={uiText('Optional: named from the material')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="series-instructions">{uiText('How to make it')}</label>
            <textarea
              id="series-instructions"
              className="textarea series-instructions"
              rows={3}
              placeholder={uiText("Optional. For example: I'm revising this before a new subject, so keep it intuitive and don't go deep into the formulas.")}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
            <span className="hint">{uiText('Your selected agent plans the episodes with it, and every episode follows it (series.md keeps it).')}</span>
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
                <button className="icon-btn" disabled={i === 0} onClick={() => setPdfs(move(pdfs, i, -1))} aria-label={uiText('Earlier')}>
                  <ArrowUp />
                </button>
                <button className="icon-btn" disabled={i === pdfs.length - 1} onClick={() => setPdfs(move(pdfs, i, 1))} aria-label={uiText('Later')}>
                  <ArrowDown />
                </button>
                <button className="icon-btn" onClick={() => setPdfs(pdfs.filter((x) => x !== p))} aria-label={format('Remove {0}', [name(p)])}>
                  <X />
                </button>
              </div>
            ))}
            <div className="series-add">
              <button className="btn small" onClick={() => void api.pickPdfs().then(add)}>
                <Plus /> {uiText(' Add PDFs')}
              </button>
              <span className="hint">
                {pdfs.length ? uiText('In course order: drag more in, or reorder with the arrows.') : uiText('or drop them here, in course order.')}
              </span>
            </div>
          </div>
          {voiceIssue && (
            <div className="quick-warning">
              {voiceIssue} {uiText(' The episodes are made without you, so the voice has to be ready first.')}
            </div>
          )}
          {measuring && (
            <p className="quick-warning">
              {uiText('Developer measurements are enabled. Episodes will run one at a time, through export, and produce HTML reports.')}
            </p>
          )}
          {
            <div className="field">
              <span className="label">{format('Model · {0}', [AGENT_LABELS[agent]])}</span>
              {planningError ? (
                <div className="hint" role="alert">
                  {planningError}{' '}
                  <button className="link-btn" onClick={() => setCatalogAttempt((n) => n + 1)}>
                    {uiText('Retry')}
                  </button>
                </div>
              ) : !planningReady ? (
                <span className="hint" role="status">
                  <span className="spinner" /> {uiText('Loading models…')}
                </span>
              ) : (
                <ModelPicker
                  model={model}
                  effort={effort}
                  models={planningModels}
                  onChange={(m, e) => {
                    setModel(m)
                    if (e) setEffort(e)
                  }}
                />
              )}
              <span className="hint">
                {uiText('For planning and every episode of this series; the chat keeps its own. Higher effort can take longer and use more of your plan.')}
              </span>
            </div>
          }
          {unattended && <ExportOn value={server} onChange={setServer} />}
          {editing && (
            <label className="export-check">
              <input type="checkbox" checked={unattended} onChange={(e) => setUnattended(e.target.checked)} />
              <span>
                {uiText('Make every episode now, unattended')}{' '}
                <span className="hint">
                  {format(
                    'The scripts are written in order, and each video starts as soon as its script is ready, {0} agents at a time (Settings → Agent); each is exported when it’s done.',
                    [agents],
                  )}{' '}
                  {uiText('Off: the episodes are created, and you make each in the editor.')}
                </span>
              </span>
            </label>
          )}
        </div>
      ) : (
        <div className="modal-body series-plan">
          <div className="field">
            <label htmlFor="series-plan-title">{uiText('Series title')}</label>
            <input id="series-plan-title" className="input" value={plan.title} onChange={(e) => setPlan({ ...plan, title: e.target.value })} />
          </div>
          {comparison && (
            <div className="quick-warning">
              <strong>{uiText('Episode model comparison')}</strong>
              <p className="hint">
                {uiText(
                  'Each episode uses its assigned model for the script, video and fixes. Automatic model fallback is off. Connect accounts in Settings → Accounts before planning.',
                )}
              </p>
              {!catalogReady && <p role="status">{uiText('Loading connected models…')}</p>}
              {catalogReady && !catalog.length && <p role="alert">{uiText('No connected models are available. Connect an agent account and try again.')}</p>}
              {catalogErrors.map((error) => (
                <p className="hint" key={error}>
                  {error}
                </p>
              ))}
            </div>
          )}
          <ol className="series-episodes">
            {plan.episodes.map((ep, i) => (
              <li key={i} className="series-episode">
                <span className="series-number mono">{i + 1}</span>
                <div className="series-episode-body">
                  <input
                    className="input"
                    value={ep.title}
                    onChange={(e) => setEpisode(i, { title: e.target.value })}
                    aria-label={format('Episode {0} title', [i + 1])}
                  />
                  <textarea
                    className="textarea"
                    rows={2}
                    value={ep.summary}
                    onChange={(e) => setEpisode(i, { summary: e.target.value })}
                    aria-label={format('Episode {0} summary', [i + 1])}
                  />
                  <span className="hint">
                    {ep.sources.map((s) => `${s.file}${s.pages ? ` p. ${s.pages}` : ''}`).join(' · ') || uiText('No source pages')}
                    {ep.buildsOn?.length ? format(' · builds on {0}', [ep.buildsOn.join(', ')]) : ''}
                  </span>
                  {comparison &&
                    selectionFor(ep) &&
                    (() => {
                      const selection = selectionFor(ep)!
                      const entry = catalog.find((c) => c.agent === selection.agent)
                      return (
                        <fieldset className="episode-models">
                          <legend className="hint">{format('Episode {0} model', [i + 1])}</legend>
                          <select
                            className="input"
                            aria-label={format('Episode {0} agent', [i + 1])}
                            value={selection.agent}
                            onChange={(e) => {
                              const agent = e.target.value as Agent
                              const model = catalog.find((c) => c.agent === agent)!.models[0]
                              setEpisode(i, { assignment: { agent, model: model.value, effort: model.efforts.includes('high') ? 'high' : model.efforts[0] } })
                            }}
                          >
                            {catalog.map((c) => (
                              <option key={c.agent} value={c.agent}>
                                {AGENT_LABELS[c.agent]}
                              </option>
                            ))}
                            {!entry && <option value={selection.agent}>{AGENT_LABELS[selection.agent]}</option>}
                          </select>
                          <ModelPicker
                            model={selection.model}
                            effort={selection.effort ?? 'high'}
                            models={entry?.models ?? []}
                            onChange={(model, effort) => setEpisode(i, { assignment: { ...selection, model, effort: effort ?? undefined } })}
                          />
                        </fieldset>
                      )
                    })()}
                </div>
                <div className="series-episode-actions">
                  <button
                    className="icon-btn"
                    disabled={i === 0}
                    onClick={() => setPlan({ ...plan, episodes: move(plan.episodes, i, -1) })}
                    aria-label={uiText('Earlier')}
                  >
                    <ArrowUp />
                  </button>
                  <button
                    className="icon-btn"
                    disabled={i === plan.episodes.length - 1}
                    onClick={() => setPlan({ ...plan, episodes: move(plan.episodes, i, 1) })}
                    aria-label={uiText('Later')}
                  >
                    <ArrowDown />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => setPlan({ ...plan, episodes: plan.episodes.filter((_, j) => j !== i) })}
                    aria-label={uiText('Remove this episode')}
                  >
                    <Trash2 />
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <details className="series-bible">
            <summary>{uiText('The series bible (series.md): audience, notation, visual vocabulary')}</summary>
            <textarea className="textarea" rows={12} value={plan.bible} onChange={(e) => setPlan({ ...plan, bible: e.target.value })} />
          </details>
        </div>
      )}
    </Modal>
  )
}

/** What planning is doing: each PDF as it's read, then the episodes as the agent writes them. */
const AGENT_LABELS: Record<Agent, string> = { claude: 'Claude · Anthropic', codex: 'Codex · OpenAI', antigravity: 'Antigravity · Google' }

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
            ? format('Reading PDF {0} of {1}', [progress?.index ?? 1, pdfs.length])
            : progress.stage === 'bible'
              ? uiText('Writing the series bible')
              : episodes.length
                ? format('Planning episode {0}', [episodes.length])
                : uiText('An agent is reading the material and planning')}
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
                {read && (
                  <span className="mono faint">
                    {read.pages} {uiText(' pages')}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      )}
      {!reading && (
        <>
          <div className="series-progress-head">
            <span className="muted">
              {uiText('Read ')}
              {pdfs.length} {uiText(' PDFs, ')}
              {pages} {uiText(' pages.')}{' '}
              {!episodes.length
                ? uiText('The episodes appear here as an agent writes them; this usually takes a few minutes.')
                : progress.stage === 'bible'
                  ? format('The {0} episodes:', [episodes.length])
                  : format('Episodes so far ({0}):', [episodes.length])}
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
