import { ArrowUp, Camera, Check, CircleAlert, Film, Loader, RotateCcw, Sparkles, Square, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ChatMessage, ChatPart } from '../../../shared/types'
import { api } from '../lib/api'
import { openDialog, refreshClaude, selectClips, sendChat, toast, errorText, useStore } from '../store'

const SUGGESTIONS = [
  'Napravi uvod: naslov, kratka najava teme i naracija.',
  'Objasni korak po korak kako se rješava kvadratna jednadžba.',
  'Provjeri cijeli video: preklapanja, tempo, čitljivost.',
  'Uspori odabrani dio i dodaj pauzu nakon rezultata.',
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
          <Sparkles className="claude-mark" /> Claude
        </div>
        <div className="pane-actions">
          {claude?.loggedIn && (
            <span className="faint account-chip" title={claude.email}>
              {claude.subscription ? `${claude.subscription}` : claude.email}
            </span>
          )}
          <button
            className="icon-btn"
            title="Novi razgovor"
            disabled={busy || chat.length === 0}
            onClick={() => {
              if (confirm('Započeti novi razgovor? Claude zaboravlja dosadašnji kontekst ovog projekta.')) void api.chatReset()
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
      if (!status.loggedIn) toast('Prijava nije dovršena.', 'error')
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
      <h3>Prijavi se s Claude računom</h3>
      <p className="muted">
        Claude piše i popravlja scenu, gleda kadrove i provjerava raspored. Prijava se otvara u pregledniku kod Anthropica, a potrošnja ide na tvoj Claude
        plan. Aplikacija ne vidi tvoju lozinku ni token.
      </p>
      <button className="btn primary" disabled={busy} onClick={() => void login()}>
        {busy ? <span className="spinner" /> : <Sparkles />} {busy ? 'Čekam preglednik…' : 'Prijavi se'}
      </button>
      {busy && url && (
        <p className="hint">
          Preglednik se nije otvorio?{' '}
          <a href="#" onClick={() => void api.openExternal(url)}>
            Otvori poveznicu za prijavu
          </a>
        </p>
      )}
      {busy && needsCode && (
        <div className="code-entry">
          <input className="input mono" placeholder="Zalijepi kod iz preglednika" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn" onClick={() => void api.claudeLoginCode(code)}>
            Potvrdi
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
        Opiši što video treba pokazati. Claude uređuje <span className="mono">scene.py</span>, renderira i gleda kadrove prije nego kaže da je gotovo.
      </p>
      <p className="hint">Odaberi klipove na vremenskoj crti da Claude zna o kojem dijelu govoriš.</p>
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
            {m.frame && <img src={m.frame} alt="Kadar" />}
            {m.context && (
              <span className="context-chip">
                <Film /> {m.context.start.toFixed(1)}–{m.context.end.toFixed(1)} s{m.context.lines.length ? ` · r. ${[...new Set(m.context.lines)].join(', ')}` : ''}
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
    return `${clips.length === 1 ? '1 klip' : `${clips.length} klipa`} · ${start.toFixed(1)}–${end.toFixed(1)} s`
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
              <button onClick={() => selectClips([])} aria-label="Makni odabir">
                <X />
              </button>
            </span>
          )}
          {timeline && (
            <button className={`attach-toggle ${frame ? 'on' : ''}`} onClick={() => setFrame((f) => !f)} title="Priloži trenutni kadar pregleda">
              <Camera /> Kadar
            </button>
          )}
        </div>
        <textarea
          ref={area}
          className="composer-input"
          rows={2}
          placeholder={busy ? 'Claude radi…' : 'Što da napravim? (Enter šalje, Shift+Enter novi red)'}
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
            Model i račun
          </button>
          {busy ? (
            <button className="send-btn stop" onClick={() => void api.chatInterrupt()} title="Zaustavi">
              <Square />
            </button>
          ) : (
            <button className="send-btn" disabled={!text.trim()} onClick={() => void send()} title="Pošalji (Enter)">
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
