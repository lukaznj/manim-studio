import { ArrowUp, Camera, Check, CircleAlert, Film, Loader, RotateCcw, Sparkles, Square, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ChatMessage, ChatPart } from '../../../shared/types'
import { api } from '../lib/api'
import { openDialog, refreshClaude, selectClips, sendChat, toast, errorText, useStore } from '../store'

const SUGGESTIONS = [
  'Make an intro: a title, a short preview of the topic, and narration.',
  'Explain step by step how to solve a quadratic equation.',
  'Check the whole video: overlaps, pacing, legibility.',
  'Slow down the selected part and add a pause after the result.',
]

export function ChatPane() {
  const claude = useStore((s) => s.claude)
  const chat = useStore((s) => s.chat)
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
        <div className="file-tab">
          <Sparkles className="claude-mark" /> Claude Agent
        </div>
        <div className="pane-actions">
          {claude?.loggedIn && (
            <span className="faint account-chip" title={claude.email}>
              {claude.subscription ? `${claude.subscription}` : claude.email}
            </span>
          )}
          <button
            className="icon-btn"
            title="New conversation"
            disabled={busy || chat.length === 0}
            onClick={() => {
              if (confirm('Start a new conversation? Claude forgets the context of this project’s current one.')) void api.chatReset()
            }}
          >
            <RotateCcw />
          </button>
        </div>
      </div>

      {!claude?.loggedIn ? (
        <SignIn />
      ) : (
        <>
          <div className="chat-list" ref={list}>
            {chat.length === 0 && <Intro />}
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

function SignIn() {
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

  return (
    <div className="chat-signin">
      <Sparkles className="signin-mark" />
      <h3>Sign in to use Claude</h3>
      <p className="muted">
        Claude writes and fixes the scene, looks at the frames and checks the layout. Studio runs Claude Code with your own Claude account: sign-in
        happens in your browser, usage counts against your plan, and the app never sees your password or tokens.
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
        <button className="link-btn" onClick={() => openDialog({ kind: 'settings', tab: 'account' })}>
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

function Message({ message: m, streaming, busy }: { message: ChatMessage; streaming?: string; busy: boolean }) {
  if (m.role === 'user') {
    const text = m.parts.find((p) => p.kind === 'text')
    return (
      <div className="msg user">
        {(m.context || m.frame) && (
          <div className="msg-attach">
            {m.frame && <img src={m.frame} alt="Preview frame" />}
            {m.context && (
              <span className="context-chip">
                <Film /> {m.context.start.toFixed(1)}–{m.context.end.toFixed(1)} s{m.context.lines.length ? ` · L${[...new Set(m.context.lines)].join(', ')}` : ''}
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
  const area = useRef<HTMLTextAreaElement>(null)

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
    const ok = await sendChat(value.trim(), frame && !!timeline)
    if (ok) setText('')
  }

  return (
    <div className="composer">
      {useStore.getState().chat.length === 0 && (
        <div className="suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="suggestion" onClick={() => setText(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <div className={`composer-box ${busy ? 'busy' : ''}`}>
        <div className="composer-attach">
          {sel && (
            <span className="context-chip">
              <Film /> {sel}
              <button onClick={() => selectClips([])} aria-label="Clear the selection">
                <X />
              </button>
            </span>
          )}
          {timeline && (
            <button className={`attach-toggle ${frame ? 'on' : ''}`} onClick={() => setFrame((f) => !f)} title="Attach the current preview frame">
              <Camera /> Frame
            </button>
          )}
        </div>
        <textarea
          ref={area}
          className="composer-input"
          rows={2}
          placeholder={busy ? 'Claude is working…' : 'What should I make? (Enter sends, Shift+Enter for a new line)'}
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
          <button className="link-btn" onClick={() => openDialog({ kind: 'settings', tab: 'account' })}>
            Model and account
          </button>
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

/** Just enough markdown for Claude's replies: paragraphs, lists, code, bold, inline code. */
function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  const lines = text.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('```')) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++])
      i++
      blocks.push(
        <pre key={blocks.length} className="md-code mono">
          {code.join('\n')}
        </pre>,
      )
      continue
    }
    if (/^\s*([-*]|\d+\.)\s/.test(line)) {
      const items: string[] = []
      const ordered = /^\s*\d+\./.test(line)
      while (i < lines.length && /^\s*([-*]|\d+\.)\s/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s/, ''))
      const List = ordered ? 'ol' : 'ul'
      blocks.push(
        <List key={blocks.length}>
          {items.map((it, k) => (
            <li key={k}>{inline(it)}</li>
          ))}
        </List>,
      )
      continue
    }
    if (/^#{1,4}\s/.test(line)) {
      blocks.push(<p key={blocks.length} className="md-h">{inline(line.replace(/^#+\s/, ''))}</p>)
      i++
      continue
    }
    if (!line.trim()) {
      i++
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('```') && !/^\s*([-*]|\d+\.)\s/.test(lines[i])) para.push(lines[i++])
    blocks.push(<p key={blocks.length}>{inline(para.join(' '))}</p>)
  }
  return <>{blocks}</>
}

function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((seg, k) => {
    if (seg.startsWith('`') && seg.endsWith('`')) return <code key={k}>{seg.slice(1, -1)}</code>
    if (seg.startsWith('**') && seg.endsWith('**')) return <strong key={k}>{seg.slice(2, -2)}</strong>
    return seg
  })
}
