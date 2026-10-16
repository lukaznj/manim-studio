import { ArrowUp, Camera, Check, ChevronDown, CircleAlert, Download, FileText, Film, Gauge, Loader, RotateCcw, Sparkles, Square, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { pageRanges } from '../../../shared/pages'
import type { ChatMessage, ChatPart, Effort, ModelOption, PlanUsage, SourceRef } from '../../../shared/types'
import { modelName } from '../../../shared/usage'
import { api } from '../lib/api'
import { ProjectCost } from './UsageDialog'
import { resetTime } from '../lib/time'
import { errorText, installComponent, openDialog, refreshClaude, selectClips, sendChat, toast, updateSettings, useStore } from '../store'
import { addSources, attachSource } from './SourcesPane'
import { Markdown } from './Markdown'

/** "notes.pdf · p. 3–5" */
const sourceLabel = (s: SourceRef) => (s.pages?.length ? `${s.name} · p. ${pageRanges(s.pages)}` : s.name)

const SUGGESTIONS = [
  'Make an intro: a title, a short preview of the topic, and narration.',
  'Explain step by step how to solve a quadratic equation.',
  'Check the whole video: overlaps, pacing, legibility.',
  'Slow down the selected part and add a pause after the result.',
]

/** The chat; `head` replaces its title (the study screen puts its Transcript and Chat tabs there). */
export function ChatPane({ head }: { head?: React.ReactNode } = {}) {
  const claude = useStore((s) => s.claude)
  const codex = useStore((s) => s.settings?.agent === 'codex')
  const all = useStore((s) => s.chat)
  // On the exercises screen the chat is the student's: the agents' own turns stay out of it.
  const exercise = useStore((s) => s.screen === 'study') // studying a finished video
  const watching = useStore((s) => s.screen === 'study' && !s.project?.meta.exercise)
  const chat = useMemo(() => (exercise ? all.filter((m) => !m.auto) : all), [all, exercise])
  const busy = useStore((s) => s.chatBusy)
  const streaming = useStore((s) => s.streaming)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = list.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [chat, streaming])

  return (
    <div className="chat-pane">
      <div className="pane-head">
        {head ?? (
          <div className="file-tab">
            <Sparkles className="claude-mark" /> {codex ? 'Codex' : 'Claude Agent'}
          </div>
        )}
        <div className="pane-actions">
          <ProjectCost />
          <UsageMeter />
          <button
            className="icon-btn"
            title="New conversation"
            disabled={busy || chat.length === 0}
            onClick={() => {
              if (confirm(`Start a new conversation? ${codex ? 'Codex' : 'Claude'} forgets the context of this project’s current one.`)) void api.chatReset()
            }}
          >
            <RotateCcw />
          </button>
        </div>
      </div>

      {!claude?.loggedIn ? (
        codex ? (
          <CodexSignIn />
        ) : (
          <SignIn />
        )
      ) : (
        <>
          <div className="chat-list" ref={list}>
            {chat.length === 0 && (watching ? <WatchIntro /> : exercise ? <ExerciseIntro /> : <Intro />)}
            {chat.map((m) => (
              <Message key={m.id} message={m} streaming={streaming[m.id]} busy={busy} />
            ))}
          </div>
          <Composer />
        </>
      )}
    </div>
  )
}

/** How much of the Claude plan is used: the tightest limit here, every limit in the tooltip and in Settings. */
export const usageLines = (usage: PlanUsage) =>
  usage.windows.map((w) => `${w.label}: ${Math.round(w.percent)}% used${w.resetsAt ? `, resets ${resetTime(w.resetsAt)}` : ''}`)

export const usageLevel = (percent: number) => (percent >= 90 ? 'hot' : percent >= 70 ? 'warm' : '')

function UsageMeter() {
  const usage = useStore((s) => s.usage)
  if (!usage) return null
  const top = usage.windows.reduce((a, b) => (b.percent > a.percent ? b : a))
  return (
    <button
      className={`usage-chip ${usageLevel(top.percent)}`}
      title={`Your Claude plan (shared with claude.ai and Claude Desktop)\n${usageLines(usage).join('\n')}`}
      aria-label={`Claude plan: ${Math.round(top.percent)}% of the ${top.label.toLowerCase()} used`}
      onClick={() => openDialog({ kind: 'settings', tab: 'account' })}
    >
      <span className="usage-bar">
        <span style={{ width: `${Math.min(100, top.percent)}%` }} />
      </span>
      {Math.round(top.percent)}%
    </button>
  )
}

/** Codex instead of Claude (Settings → Agent): install its CLI, then sign in with ChatGPT or use an API key. */
function CodexSignIn() {
  const setup = useStore((s) => s.setup)
  const progress = useStore((s) => s.setupProgress.codex)
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => api.on('claude-login', (e) => e.url && setUrl(e.url)), [])
  const state = setup?.codex ?? 'missing'

  const login = async () => {
    setBusy(true)
    setUrl(null)
    try {
      const status = await api.claudeLogin()
      await refreshClaude()
      if (!status.loggedIn) toast('Sign-in wasn’t completed.', 'error')
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (state !== 'ready')
    return (
      <div className="chat-signin">
        <Sparkles className="signin-mark" />
        <h3>Install Codex</h3>
        <p className="muted">
          Studio is set to use Codex, OpenAI's agent, instead of Claude. Its program is a one-time download of about 140 MB, straight from OpenAI's npm package.
        </p>
        <button className="btn primary" disabled={state === 'installing'} onClick={() => void installComponent('codex').then(refreshClaude)}>
          {state === 'installing' ? <span className="spinner" /> : <Download />}{' '}
          {state === 'installing' ? `Installing…${progress !== undefined ? ` ${Math.round(progress * 100)}%` : ''}` : 'Install Codex'}
        </button>
        {state === 'error' && <p className="hint">{setup?.errors.codex}</p>}
        <button className="link-btn" onClick={() => void updateSettings({ agent: 'claude' }).then(refreshClaude)}>
          Use Claude instead
        </button>
      </div>
    )

  return (
    <div className="chat-signin">
      <Sparkles className="signin-mark" />
      <h3>Sign in to use Codex</h3>
      <p className="muted">
        Codex writes and fixes the scene, renders it and looks at the frames. It signs in with your ChatGPT account in your browser, and usage counts against
        your plan; Studio never sees your password or tokens.
      </p>
      <button className="btn primary" disabled={busy} onClick={() => void login()}>
        {busy ? <span className="spinner" /> : <Sparkles />} {busy ? 'Waiting for the browser…' : 'Sign in with ChatGPT'}
      </button>
      {busy && url && (
        <p className="hint">
          Didn’t a browser open?{' '}
          <a href="#" onClick={() => void api.openExternal(url)}>
            Open the sign-in link
          </a>
        </p>
      )}
      {!busy && (
        <button className="link-btn" onClick={() => openDialog({ kind: 'settings', tab: 'account' })}>
          Use an OpenAI API key instead
        </button>
      )}
    </div>
  )
}

function SignIn() {
  const settings = useStore((s) => s.settings)
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [needsCode, setNeedsCode] = useState(false)
  const [code, setCode] = useState('')

  useEffect(
    () =>
      api.on('claude-login', (e) => {
        if (e.url) setUrl(e.url)
        if (e.needsCode) setNeedsCode(true)
      }),
    [],
  )

  const login = async () => {
    setBusy(true)
    setUrl(null)
    try {
      const status = await api.claudeLogin()
      await refreshClaude()
      if (!status.loggedIn) toast('Sign-in wasn’t completed.', 'error')
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy(false)
      setNeedsCode(false)
    }
  }

  const useKey = async (claudeAuth: 'account' | 'api-key') => {
    await updateSettings({ claudeAuth })
    await refreshClaude()
    if (claudeAuth === 'api-key') openDialog({ kind: 'settings', tab: 'account' })
  }

  if (settings?.claudeAuth === 'api-key')
    return (
      <div className="chat-signin">
        <Sparkles className="signin-mark" />
        <h3>Add your Anthropic API key</h3>
        <p className="muted">Studio is set to use an API key from console.anthropic.com, billed per use. Add it in Settings → Agent.</p>
        <button className="btn primary" onClick={() => openDialog({ kind: 'settings', tab: 'account' })}>
          Open Claude settings
        </button>
        <button className="link-btn" onClick={() => void useKey('account')}>
          Sign in with a Claude account instead
        </button>
      </div>
    )

  return (
    <div className="chat-signin">
      <Sparkles className="signin-mark" />
      <h3>Sign in to use Claude</h3>
      <p className="muted">
        Claude writes and fixes the scene, looks at the frames and checks the layout. Studio runs Claude Code with your own Claude account: sign-in happens in
        your browser, usage counts against your plan, and the app never sees your password or tokens.
      </p>
      <button className="btn primary" disabled={busy} onClick={() => void login()}>
        {busy ? <span className="spinner" /> : <Sparkles />} {busy ? 'Waiting for the browser…' : 'Sign in'}
      </button>
      {busy && url && (
        <p className="hint">
          Didn’t a browser open?{' '}
          <a href="#" onClick={() => void api.openExternal(url)}>
            Open the sign-in link
          </a>
        </p>
      )}
      {!busy && (
        <button className="link-btn" onClick={() => void useKey('api-key')}>
          Use an Anthropic API key instead
        </button>
      )}
      {busy && needsCode && (
        <div className="code-entry">
          <input className="input mono" placeholder="Paste the code from the browser" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn" onClick={() => void api.claudeLoginCode(code)}>
            Confirm
          </button>
        </div>
      )}
    </div>
  )
}

function Intro() {
  return (
    <div className="chat-intro">
      <p className="muted">
        Describe what the video should show. Claude edits <span className="mono">scene.py</span>, renders it and looks at the frames before it says it’s done.
      </p>
      <p className="hint">Select clips on the timeline so Claude knows which part you mean.</p>
    </div>
  )
}

const EXERCISE_QUESTIONS = [
  'Why does this method work here?',
  'Explain the hardest step more slowly.',
  'What would change if the numbers were different?',
  'Give me a similar exercise to practise on.',
]

const WATCH_QUESTIONS = [
  'Explain what’s on screen right now more slowly.',
  'Why does this step work?',
  'Give me a short exercise to practise this.',
  'Summarise this episode in five points.',
]

function WatchIntro() {
  return (
    <div className="chat-intro">
      <p className="muted">Ask about anything in the video. Studio tells the agent where you paused and what was on screen and said there, so “this part” is enough.</p>
      <div className="suggestions">
        {WATCH_QUESTIONS.map((q) => (
          <button key={q} className="suggestion" onClick={() => useStore.setState({ chatDraft: q })}>
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}

function ExerciseIntro() {
  return (
    <div className="chat-intro">
      <p className="muted">Ask anything about this exercise: a step you don’t follow, why a method works, a similar one to practise. The answer comes right away, without a new video.</p>
      <div className="suggestions">
        {EXERCISE_QUESTIONS.map((q) => (
          <button key={q} className="suggestion" onClick={() => useStore.setState({ chatDraft: q })}>
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}

function Message({ message: m, streaming, busy }: { message: ChatMessage; streaming?: string; busy: boolean }) {
  if (m.role === 'user') {
    const text = m.parts.find((p) => p.kind === 'text')
    return (
      <div className="msg user">
        {(m.context || m.frame || m.source) && (
          <div className="msg-attach">
            {m.frame && <img src={m.frame} alt="Preview frame" />}
            {m.source && (
              <span className="context-chip">
                <FileText /> {sourceLabel(m.source)}
              </span>
            )}
            {m.context && (
              <span className="context-chip">
                <Film /> {m.context.start.toFixed(1)}–{m.context.end.toFixed(1)} s
                {m.context.lines.length ? ` · L${[...new Set(m.context.lines)].join(', ')}` : ''}
              </span>
            )}
          </div>
        )}
        <div className="msg-text">{text?.kind === 'text' && text.text}</div>
      </div>
    )
  }
  if (m.role === 'error')
    return (
      <div className="msg error">
        <CircleAlert /> {m.parts[0]?.kind === 'text' && m.parts[0].text}
      </div>
    )

  const last = m.parts.at(-1)
  const working = busy && !streaming && (!last || last.kind === 'tool')
  return (
    <div className="msg assistant">
      {m.parts.map((p, i) => (
        <Part key={i} part={p} />
      ))}
      {streaming && (
        <div className="msg-text md">
          <Markdown text={streaming} />
          <span className="caret" />
        </div>
      )}
      {working && (
        <div className="thinking">
          <span />
          <span />
          <span />
        </div>
      )}
    </div>
  )
}

function Part({ part }: { part: ChatPart }) {
  if (part.kind === 'text')
    return (
      <div className="msg-text md">
        <Markdown text={part.text} />
      </div>
    )
  return (
    <div className={`tool-chip ${part.status}`}>
      {part.status === 'running' ? <Loader className="spin" /> : part.status === 'ok' ? <Check /> : <X />}
      <span>{part.summary}</span>
    </div>
  )
}

function Composer() {
  const busy = useStore((s) => s.chatBusy)
  const timeline = useStore((s) => s.timeline)
  const selection = useStore((s) => s.selection)
  const [text, setText] = useState('')
  const [frame, setFrame] = useState(true)
  const exercise = useStore((s) => s.screen === 'study') // a student's questions: the moment, not clips
  const area = useRef<HTMLTextAreaElement>(null)
  const draft = useStore((s) => s.chatDraft)
  const source = useStore((s) => s.chatSource)
  const [dropping, setDropping] = useState(false)

  useEffect(() => {
    if (draft === null) return
    setText(draft)
    useStore.setState({ chatDraft: null })
    area.current?.focus()
  }, [draft])

  const sel = useMemo(() => {
    const clips = selection.map((i) => timeline?.clips[i]).filter(Boolean)
    if (!clips.length) return null
    const start = Math.min(...clips.map((c) => c!.start))
    const end = Math.max(...clips.map((c) => c!.end))
    return `${clips.length === 1 ? '1 clip' : `${clips.length} clips`} · ${start.toFixed(1)}–${end.toFixed(1)} s`
  }, [selection, timeline])

  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(220, el.scrollHeight)}px`
  }, [text])

  const send = async (value = text) => {
    if (!value.trim() || busy) return
    const ok = await sendChat(value.trim(), frame && !!timeline && !exercise)
    if (ok) setText('')
  }

  return (
    <div className="composer">
      {useStore.getState().chat.length === 0 && useStore.getState().screen !== 'study' && (
        <div className="suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="suggestion" onClick={() => setText(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <div
        className={`composer-box ${busy ? 'busy' : ''} ${dropping ? 'dropping' : ''}`}
        onDragOver={(e) => {
          if (![...e.dataTransfer.items].some((i) => i.kind === 'file')) return
          e.preventDefault()
          setDropping(true)
        }}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropping(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDropping(false)
          const pdfs = [...e.dataTransfer.files].filter((f) => /\.pdf$/i.test(f.name)).map((f) => api.pathForFile(f))
          if (!pdfs.length) return toast('Drop a PDF here to give it to Claude. Pictures and videos go in Media.', 'info')
          void addSources(pdfs).then((r) => r?.added[0] && attachSource(r.added[0]))
        }}
      >
        <div className="composer-attach">
          {source && (
            <span className="context-chip">
              <FileText /> {sourceLabel(source)}
              <button onClick={() => useStore.setState({ chatSource: null })} aria-label="Don’t attach the PDF">
                <X />
              </button>
            </span>
          )}
          {sel && (
            <span className="context-chip">
              <Film /> {sel}
              <button onClick={() => selectClips([])} aria-label="Clear the selection">
                <X />
              </button>
            </span>
          )}
          {timeline && !exercise && (
            <button className={`attach-toggle ${frame ? 'on' : ''}`} onClick={() => setFrame((f) => !f)} title="Attach the current preview frame">
              <Camera /> Frame
            </button>
          )}
        </div>
        <textarea
          ref={area}
          className="composer-input"
          rows={2}
          placeholder={busy ? 'Claude is working…' : exercise ? 'Ask about what you’re watching (Enter sends)' : 'What should I make? (Enter sends, Shift+Enter for a new line)'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <div className="composer-foot">
          <ModelControls />
          {busy ? (
            <button className="send-btn stop" onClick={() => void api.chatInterrupt()} title="Stop">
              <Square />
            </button>
          ) : (
            <button className="send-btn" disabled={!text.trim()} onClick={() => void send()} title="Send (Enter)">
              <ArrowUp />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const EFFORTS: Record<Effort, string> = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max' }

/**
 * Which model Claude runs and how hard it thinks; a change applies to the current conversation.
 * Effort is always a real level: medium unless chosen, which is what Claude Code ran at by default.
 */
export function ModelControls() {
  const settings = useStore((s) => s.settings)
  if (!settings) return null
  // The chosen agent's own model and effort (Settings → Agent).
  const codex = settings.agent === 'codex'
  return (
    <ModelPicker
      model={codex ? settings.codexModel : settings.claudeModel}
      effort={(codex ? settings.codexEffort : settings.claudeEffort) || 'high'}
      onChange={(m, e) =>
        void updateSettings(codex ? { codexModel: m, ...(e ? { codexEffort: e } : {}) } : { claudeModel: m, ...(e ? { claudeEffort: e } : {}) })
      }
    />
  )
}

/** A model and an effort from what the account can use (the chat's, and a series' own). */
export function ModelPicker({
  model,
  effort: savedEffort,
  onChange: save,
}: {
  model: string
  effort: Effort
  onChange: (model: string, effort: Effort | null) => void
}) {
  const models = useStore((s) => s.models)
  const list: ModelOption[] = models.length ? [...models] : [{ value: '', label: 'Default model', description: '', efforts: [] }]
  // A model picked under another account still shows, so the picker never claims the wrong one.
  if (!list.some((m) => m.value === model)) list.push({ value: model, label: modelName(model), description: '', efforts: [] })
  const current = list.find((m) => m.value === model)!
  const effortFor = (efforts: Effort[]): Effort | null =>
    efforts.includes(savedEffort) ? savedEffort : efforts.includes('medium') ? 'medium' : (efforts[0] ?? null)
  // Until the account's models load, show the saved level rather than "no effort setting".
  const efforts: Effort[] = models.length ? current.efforts : [savedEffort]
  const effort = effortFor(efforts)

  // The agent would quietly lower an effort the new model doesn't offer; pick one it does.
  const pickModel = (value: string) => save(value, effortFor(list.find((m) => m.value === value)?.efforts ?? []))

  return (
    <div className="model-controls">
      <label className="chip-select" title={current.description || 'Model'}>
        <Sparkles />
        <select aria-label="Model" value={model} onChange={(e) => pickModel(e.target.value)}>
          {list.map((m) => (
            <option key={m.value} value={m.value} title={m.description}>
              {m.label}
            </option>
          ))}
        </select>
        <ChevronDown className="chev" />
      </label>
      <label
        className="chip-select"
        title={effort ? 'How much the agent thinks before acting. Higher is slower and uses more of your plan.' : 'This model has no effort setting'}
      >
        <Gauge />
        <select aria-label="Effort" value={effort ?? ''} disabled={!effort} onChange={(e) => save(model, e.target.value as Effort)}>
          {effort ? (
            efforts.map((e) => (
              <option key={e} value={e}>
                {EFFORTS[e]} effort
              </option>
            ))
          ) : (
            <option value="">No effort setting</option>
          )}
        </select>
        <ChevronDown className="chev" />
      </label>
    </div>
  )
}
