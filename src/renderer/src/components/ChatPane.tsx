import { t as uiText, format } from '../lib/i18n'
import { ArrowUp, Camera, Check, ChevronDown, CircleAlert, Clock3, Download, FileText, Film, Gauge, ListChecks, Loader, Plus, RotateCcw, ScanLine, Settings2, Sparkles, Square, Video, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { pageRanges } from '../../../shared/pages'
import type { ChatMessage, ChatPart, Effort, ModelOption, PlanUsage, SourceRef } from '../../../shared/types'
import { modelName } from '../../../shared/usage'
import { api } from '../lib/api'
import { ProjectUsage } from './UsageDialog'
import { resetTime } from '../lib/time'
import { errorText, installComponent, openDialog, prepareStudyAction, refreshClaude, refreshUsage, selectClips, selectStudied, sendChat, toast, updateSettings, useStore, watchAdditionalVideo } from '../store'
import { addSources, attachSource } from './SourcesPane'
import { Markdown } from './Markdown'

/** "notes.pdf · p. 3–5" */
const sourceLabel = (s: SourceRef) => (s.pages?.length ? `${s.name} · p. ${pageRanges(s.pages)}` : s.name)

/** The chat; `head` replaces its title (the study screen puts its Transcript and Chat tabs there). */
export function ChatPane({ head, embedded = false }: { head?: React.ReactNode; embedded?: boolean } = {}) {
  const claude = useStore((s) => s.claude)
  const agent = useStore((s) => s.settings?.agent ?? 'claude')
  const codex = agent === 'codex'
  const agentName = codex ? 'Codex' : agent === 'antigravity' ? 'Antigravity' : 'Claude'
  const all = useStore((s) => s.chat)
  // On the exercises screen the chat is the student's: the agents' own turns stay out of it.
  const exercise = useStore((s) => s.screen === 'study') // studying a finished video
  const chat = useMemo(() => (exercise ? all.filter((m) => !m.auto) : all), [all, exercise])
  const busy = useStore((s) => s.chatBusy)
  const streaming = useStore((s) => s.streaming)
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    void refreshUsage()
    const timer = setInterval(() => void refreshUsage(), 60_000)
    return () => clearInterval(timer)
  }, [agent, claude?.loggedIn])

  useEffect(() => {
    const el = list.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [chat, streaming])

  return (
    <div className={`chat-pane ${exercise ? 'study-chat' : ''}`}>
      <div className="pane-head">
        {embedded ? (
          <span className="study-chat-provider"><Sparkles />{agentName}</span>
        ) : (
          (head ?? (
            <div className="file-tab">
              <Sparkles className="claude-mark" /> {agent === 'claude' ? uiText('Claude Agent') : agentName}
            </div>
          ))
        )}
        <div className="pane-actions">
          {!exercise && <ProjectUsage />}
          <UsageMeter />
          <button
            className="icon-btn"
            title={uiText('New conversation')}
            disabled={busy || chat.length === 0}
            onClick={() => {
              if (confirm(uiText('Start a new conversation? The assistant will forget this conversation.'))) void api.chatReset()
            }}
          >
            <RotateCcw />
          </button>
        </div>
      </div>

      {!claude?.loggedIn ? (
        codex ? (
          <CodexSignIn />
        ) : agent === 'antigravity' ? (
          <AntigravitySignIn />
        ) : (
          <SignIn />
        )
      ) : (
        <>
          <div className="chat-list" ref={list}>
            {chat.length === 0 && (exercise ? <StudyIntro /> : <Intro />)}
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
  usage.windows.map((w) => `${w.label.split(' · ').map(uiText).join(' · ')}: ${format('{0}% used', [Math.round(w.percent)])}${w.resetsAt ? `, ${format('resets {0}', [resetTime(w.resetsAt)])}` : ''}`)

export const usageLevel = (percent: number) => (percent >= 90 ? 'hot' : percent >= 70 ? 'warm' : '')

function UsageMeter() {
  const usage = useStore((s) => s.usage)
  if (!usage?.windows.length) return null
  const top = usage.windows.reduce((a, b) => (b.percent > a.percent ? b : a))
  return (
    <button
      className={`usage-chip ${usageLevel(top.percent)}`}
      title={format('Account-wide plan usage · shared with other apps\n{0}', [usageLines(usage).join('\n')])}
      aria-label={format('Plan usage: {0}% of the {1} used', [Math.round(top.percent), top.label.toLowerCase()])}
      onClick={() => openDialog({ kind: 'settings', tab: 'accounts' })}
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
        <h3>{uiText('Install Codex')}</h3>
        <p className="muted">
          {uiText(
            "Studio is set to use Codex, OpenAI's agent, instead of Claude. Its program is a one-time download of about 140 MB, straight from OpenAI's npm package.",
          )}
        </p>
        <button className="btn primary" disabled={state === 'installing'} onClick={() => void installComponent('codex').then(refreshClaude)}>
          {state === 'installing' ? <span className="spinner" /> : <Download />}{' '}
          {state === 'installing' ? format('Installing…{0}', [progress !== undefined ? ` ${Math.round(progress * 100)}%` : '']) : uiText('Install Codex')}
        </button>
        {state === 'error' && <p className="hint">{setup?.errors.codex}</p>}
        <button className="link-btn" onClick={() => void updateSettings({ agent: 'claude' }).then(refreshClaude)}>
          {uiText('Use Claude instead')}
        </button>
      </div>
    )

  return (
    <div className="chat-signin">
      <Sparkles className="signin-mark" />
      <h3>{uiText('Sign in to use Codex')}</h3>
      <p className="muted">
        {uiText(
          'Codex writes and fixes the scene, renders it and looks at the frames. It signs in with your ChatGPT account in your browser, and usage counts against your plan; Studio never sees your password or tokens.',
        )}
      </p>
      <button className="btn primary" disabled={busy} onClick={() => void login()}>
        {busy ? <span className="spinner" /> : <Sparkles />} {busy ? uiText('Waiting for the browser…') : uiText('Sign in with ChatGPT')}
      </button>
      {busy && url && (
        <p className="hint">
          {uiText('Didn’t a browser open?')}{' '}
          <a href="#" onClick={() => void api.openExternal(url)}>
            {uiText('Open the sign-in link')}
          </a>
        </p>
      )}
      {!busy && (
        <button className="link-btn" onClick={() => openDialog({ kind: 'settings', tab: 'accounts' })}>
          {uiText('Use an OpenAI API key instead')}
        </button>
      )}
    </div>
  )
}

/** Antigravity instead of Claude: its install and Google sign-in (with the code to paste) live in Settings → Accounts. */
function AntigravitySignIn() {
  return (
    <div className="chat-signin">
      <Sparkles className="signin-mark" />
      <h3>{uiText('Set up Antigravity')}</h3>
      <p className="muted">
        {uiText(
          "Studio is set to use Antigravity, Google's agent with Gemini 4 Argon. Install it and sign in with your Google account (or add a Gemini API key) in Settings → Accounts. It edits only this project, and Studio never sees your password or tokens.",
        )}
      </p>
      <button className="btn primary" onClick={() => openDialog({ kind: 'settings', tab: 'accounts' })}>
        <Sparkles /> {uiText(' Open Settings → Accounts')}
      </button>
      <button className="link-btn" onClick={() => void updateSettings({ agent: 'claude' }).then(refreshClaude)}>
        {uiText('Use Claude instead')}
      </button>
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
    if (claudeAuth === 'api-key') openDialog({ kind: 'settings', tab: 'accounts' })
  }

  if (settings?.claudeAuth === 'api-key')
    return (
      <div className="chat-signin">
        <Sparkles className="signin-mark" />
        <h3>{uiText('Add your Anthropic API key')}</h3>
        <p className="muted">{uiText('Studio is set to use an API key from console.anthropic.com, billed per use. Add it in Settings → Accounts.')}</p>
        <button className="btn primary" onClick={() => openDialog({ kind: 'settings', tab: 'accounts' })}>
          {uiText('Open Claude settings')}
        </button>
        <button className="link-btn" onClick={() => void useKey('account')}>
          {uiText('Sign in with a Claude account instead')}
        </button>
      </div>
    )

  return (
    <div className="chat-signin">
      <Sparkles className="signin-mark" />
      <h3>{uiText('Sign in to use Claude')}</h3>
      <p className="muted">
        {uiText(
          'Claude writes and fixes the scene, looks at the frames and checks the layout. Studio runs Claude Code with your own Claude account: sign-in happens in your browser, usage counts against your plan, and the app never sees your password or tokens.',
        )}
      </p>
      <button className="btn primary" disabled={busy} onClick={() => void login()}>
        {busy ? <span className="spinner" /> : <Sparkles />} {busy ? uiText('Waiting for the browser…') : uiText('Sign in')}
      </button>
      {busy && url && (
        <p className="hint">
          {uiText('Didn’t a browser open?')}{' '}
          <a href="#" onClick={() => void api.openExternal(url)}>
            {uiText('Open the sign-in link')}
          </a>
        </p>
      )}
      {!busy && (
        <button className="link-btn" onClick={() => void useKey('api-key')}>
          {uiText('Use an Anthropic API key instead')}
        </button>
      )}
      {busy && needsCode && (
        <div className="code-entry">
          <input className="input mono" placeholder={uiText('Paste the code from the browser')} value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn" onClick={() => void api.claudeLoginCode(code)}>
            {uiText('Confirm')}
          </button>
        </div>
      )}
    </div>
  )
}

function Intro() {
  const agent = useStore((s) => s.settings?.agent ?? 'claude')
  const name = agent === 'codex' ? 'Codex' : agent === 'antigravity' ? 'Antigravity' : 'Claude'
  return (
    <div className="chat-intro">
      <p className="muted">
        {uiText('Describe what the video should show. ')}
        {name} {uiText(' edits ')}
        <span className="mono">{uiText('scene.py')}</span>
        {uiText(', renders it and looks at the frames before it says it’s done.')}
      </p>
      <p className="hint">
        {uiText('Select clips on the timeline so ')}
        {name} {uiText(' knows which part you mean.')}
      </p>
    </div>
  )
}

function StudyIntro() {
  return (
    <div className="study-chat-empty">
      <div className="study-chat-orbit"><Sparkles /><span /><span /></div>
      <span className="eyebrow">{uiText('Your study companion')}</span>
      <h3>{uiText('Make this moment click')}</h3>
      <p>{uiText('Ask a question in your own words. The assistant can see where you paused and what is on screen.')}</p>
      <div className="study-chat-capabilities">
        <Video /><ListChecks /><ScanLine />
      </div>
      <p className="hint">{uiText('Open Study tools below to create an explanation video, practise with exercises or select part of the frame.')}</p>
    </div>
  )
}

function Message({ message: m, streaming, busy }: { message: ChatMessage; streaming?: string; busy: boolean }) {
  const additional = useStore((s) => m.videoOffer?.dir ? s.watchSeries?.episodes.flatMap((e) => e.followUps).find((f) => f.dir === m.videoOffer!.dir) : undefined)
  if (m.role === 'user') {
    const text = m.parts.find((p) => p.kind === 'text')
    return (
      <div className="msg user">
        {(m.context || m.frame || m.source) && (
          <div className="msg-attach">
            {m.frame && <img src={m.frame} alt={uiText('Preview frame')} />}
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
        {m.studyAction && <span className="study-request-kind">{m.studyAction === 'video' ? <Video /> : <ListChecks />}{m.studyAction === 'video' ? uiText('Additional video') : uiText('Practice exercises')}</span>}
        <div className="msg-text md">{text?.kind === 'text' && <Markdown text={text.text} />}</div>
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
      {m.videoOffer && <div className="study-chat-result">
        <Video />
        <div><strong>{m.videoOffer.title}</strong><span>{m.videoOffer.state === 'created' ? additional?.state === 'done' ? uiText('Ready to watch') : additional?.state === 'failed' ? uiText('Didn’t finish') : uiText('Your additional video is being made. You can keep studying.') : uiText('Would a video still help?')}</span></div>
        <button className="btn small" disabled={busy} onClick={() => {
          if (m.videoOffer?.state === 'created' && m.videoOffer.dir) void (additional?.state === 'done' ? watchAdditionalVideo(m.videoOffer.dir) : selectStudied(m.videoOffer.dir))
          else void sendChat(uiText('Create the video anyway'), false, { confirmVideo: m.id, studyAction: 'video' })
        }}>{m.videoOffer.state === 'created' ? uiText('Open') : uiText('Create the video anyway')}</button>
      </div>}
      {m.exerciseFolder && <div className="study-chat-result"><ListChecks /><div><strong>{uiText('Practice exercises')}</strong><span>{uiText('Your exercises are being prepared with checked solutions.')}</span></div><button className="btn small" onClick={() => void import('../store').then(({ openExerciseSet }) => openExerciseSet(m.exerciseFolder!))}>{uiText('Open')}</button></div>}
      {working && !m.videoOffer && !m.exerciseFolder && (
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
  const tool = useStore((s) => s.studyTool)
  const moment = useStore((s) => s.studyMoment)
  const attachment = useStore((s) => s.studyAttachment)
  const dir = useStore((s) => s.project?.path)
  useEffect(() => { setText('') }, [dir])

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
    if (ok) {
      setText('')
      useStore.setState({ studyTool: null, studyMoment: null, studyAttachment: null })
    }
  }

  return (
    <div className="composer">
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
        {exercise && (tool || attachment) && <div className="study-composer-context">
          {tool && <span className="study-tool-pill">{tool === 'video' ? <Video /> : <ListChecks />}{tool === 'video' ? uiText('Additional video') : uiText('Practice exercises')}<button aria-label={uiText('Remove action')} onClick={() => useStore.setState({ studyTool: null, ...(!attachment ? { studyMoment: null } : {}) })}><X /></button></span>}
          {moment !== null && <span className="study-moment"><Clock3 />{Math.floor(moment / 60)}:{String(Math.floor(moment % 60)).padStart(2, '0')}</span>}
          {attachment && <div className="study-frame-attachment"><img src={attachment.preview} alt={uiText('Selected frame area')} /><span>{uiText('Selected frame area')}</span><button className="icon-btn" aria-label={uiText('Remove selection')} onClick={() => useStore.setState({ studyAttachment: null, ...(!tool ? { studyMoment: null } : {}) })}><X /></button></div>}
        </div>}
        <div className="composer-attach">
          {source && (
            <span className="context-chip">
              <FileText /> {sourceLabel(source)}
              <button onClick={() => useStore.setState({ chatSource: null })} aria-label={uiText('Don’t attach the PDF')}>
                <X />
              </button>
            </span>
          )}
          {sel && (
            <span className="context-chip">
              <Film /> {sel}
              <button onClick={() => selectClips([])} aria-label={uiText('Clear the selection')}>
                <X />
              </button>
            </span>
          )}
          {timeline && !exercise && (
            <button className={`attach-toggle ${frame ? 'on' : ''}`} onClick={() => setFrame((f) => !f)} title={uiText('Attach the current preview frame')}>
              <Camera /> {uiText(' Frame')}
            </button>
          )}
        </div>
        <textarea
          ref={area}
          className="composer-input"
          rows={2}
          placeholder={
            busy
              ? uiText('The assistant is working…')
              : exercise
                ? tool === 'video' ? uiText('What should the additional video explain?') : tool === 'exercises' ? uiText('What would you like to practise?') : uiText('Ask about this moment…')
                : uiText('What should I make? (Enter sends, Shift+Enter for a new line)')
          }
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
          {exercise ? <StudyTools /> : <button className="icon-btn" title={uiText('Model and effort settings')} aria-label={uiText('Model and effort settings')} onClick={() => openDialog({ kind: 'settings', tab: 'account' })}><Settings2 /></button>}
          {busy ? (
            <button className="send-btn stop" onClick={() => void api.chatInterrupt()} title={uiText('Stop')}>
              <Square />
            </button>
          ) : (
            <button className="send-btn" disabled={!text.trim()} onClick={() => void send()} title={uiText('Send (Enter)')}>
              <ArrowUp />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function StudyTools() {
  const id = useId()
  const menu = useRef<HTMLDivElement>(null)
  const canCreateVideo = useStore((s) => !!s.project?.meta.series && !s.project.meta.extra && !s.project.meta.exercise)
  const time = useStore((s) => s.watchTime)
  const busy = useStore((s) => s.chatBusy)
  const choose = (action: 'video' | 'exercises' | 'select') => {
    menu.current?.hidePopover()
    if (action === 'select') {
      document.querySelector<HTMLVideoElement>('.study-video-stage video')?.pause()
      useStore.setState({ studySelecting: true, studyTab: 'chat' })
    } else prepareStudyAction(action)
  }
  return <>
    <button className="study-tools-trigger" popoverTarget={id} disabled={busy} onClick={(e) => {
      const r = e.currentTarget.getBoundingClientRect()
      if (menu.current) { menu.current.style.left = `${Math.min(r.left, window.innerWidth - 300)}px`; menu.current.style.bottom = `${window.innerHeight - r.top + 8}px` }
    }}><Plus /><span>{uiText('Study tools')}</span></button>
    <div ref={menu} id={id} popover="auto" className="study-tools-menu">
      <span className="eyebrow">{uiText('Learn your way')}</span>
      {canCreateVideo && <button onClick={() => choose('video')}><span><Video /></span><div><strong>{uiText('Additional explanation video')}</strong><small>{uiText('Go deeper into this moment')}</small></div></button>}
      <button onClick={() => choose('exercises')}><span><ListChecks /></span><div><strong>{uiText('Create practice exercises')}</strong><small>{uiText('Turn this concept into practice')}</small></div></button>
      <button disabled={time === null} onClick={() => choose('select')}><span><ScanLine /></span><div><strong>{uiText('Select part of the frame')}</strong><small>{uiText('Show exactly what you mean')}</small></div></button>
      <button className="study-tools-settings" onClick={() => { menu.current?.hidePopover(); openDialog({ kind: 'settings', tab: 'account' }) }}><Settings2 />{uiText('Chat model and effort')}</button>
    </div>
  </>
}

const effortLabel = (effort: Effort) => ({ low: uiText('Low effort'), medium: uiText('Medium effort'), high: uiText('High effort'), xhigh: uiText('Extra high effort'), max: uiText('Maximum effort') })[effort]

/**
 * Which model Claude runs and how hard it thinks; a change applies to the current conversation.
 * Effort is always a real level: medium unless chosen, which is what Claude Code ran at by default.
 */
export function ModelControls() {
  const settings = useStore((s) => s.settings)
  if (!settings) return null
  // The chosen agent's own model and effort (Settings → Agent).
  const agent = settings.agent
  if (agent === 'antigravity')
    return (
      <ModelPicker
        model={settings.antigravityModel}
        effort={settings.antigravityEffort || 'medium'}
        onChange={(m, e) => void updateSettings({ antigravityModel: m, ...(e ? { antigravityEffort: e } : {}) })}
      />
    )
  const codex = agent === 'codex'
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
  models: offeredModels,
}: {
  model: string
  effort: Effort
  onChange: (model: string, effort: Effort | null) => void
  models?: ModelOption[]
}) {
  const activeModels = useStore((s) => s.models)
  const models = offeredModels ?? activeModels
  const list: ModelOption[] = models.length ? [...models] : [{ value: model, label: modelName(model) || 'Default model', description: '', efforts: [] }]
  // A saved full id ("claude-sonnet-5-5") is the listed alias of the same name ("sonnet"): same model, same efforts.
  const listed = list.find((m) => m.value === model) ?? list.find((m) => m.value && m.label === modelName(model))
  // A model picked under another account still shows, so the picker never claims the wrong one; its saved effort stays.
  if (!listed) list.push({ value: model, label: modelName(model), description: '', efforts: models.length ? [savedEffort] : [] })
  const current = listed ?? list.at(-1)!
  const effortFor = (efforts: Effort[]): Effort | null =>
    efforts.includes(savedEffort) ? savedEffort : efforts.includes('medium') ? 'medium' : (efforts[0] ?? null)
  // Until the account's models load, show the saved level rather than "no effort setting".
  const efforts: Effort[] = models.length ? current.efforts : [savedEffort]
  const effort = effortFor(efforts)

  // The agent would quietly lower an effort the new model doesn't offer; pick one it does.
  const pickModel = (value: string) => save(value, effortFor(list.find((m) => m.value === value)?.efforts ?? []))

  return (
    <div className="model-controls">
      <label className="chip-select" title={current.description || uiText('Model')}>
        <Sparkles />
        <select aria-label={uiText('Model')} value={current.value} disabled={!models.length} onChange={(e) => pickModel(e.target.value)}>
          {list.map((m) => (
            <option key={m.value} value={m.value} title={m.description} disabled={!models.some((offered) => offered.value === m.value)}>
              {m.label}
            </option>
          ))}
        </select>
        <ChevronDown className="chev" />
      </label>
      <label
        className="chip-select"
        title={
          effort ? uiText('How much the agent thinks before acting. Higher is slower and uses more of your plan.') : uiText('This model has no effort setting')
        }
      >
        <Gauge />
        <select aria-label={uiText('Effort')} value={effort ?? ''} disabled={!effort} onChange={(e) => save(model, e.target.value as Effort)}>
          {effort ? (
            efforts.map((e) => (
              <option key={e} value={e}>
                {effortLabel(e)}
              </option>
            ))
          ) : (
            <option value="">{uiText('No effort setting')}</option>
          )}
        </select>
        <ChevronDown className="chev" />
      </label>
    </div>
  )
}
