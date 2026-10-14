import { Check, NotebookPen, Pencil, Sparkles } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { scriptBody, scriptStatus, withScriptStatus } from '../../../shared/script'
import { api } from '../lib/api'
import { errorText, openDialog, sendChat, toast, useStore } from '../store'

/**
 * The video's plan, script.md (ADR 0016): Claude writes it before the code, you read it, change it
 * and approve it. Approving tells Claude to write scene.py from it.
 */
export function ScriptPane() {
  const script = useStore((s) => s.script)
  const scriptFirst = useStore((s) => !!s.project?.meta.scriptFirst)
  const chatBusy = useStore((s) => s.chatBusy)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (!editing) setDraft(script ?? '')
  }, [script, editing])

  const save = async (text: string) => {
    await api.saveScript(text)
    useStore.setState({ script: text })
  }

  const approve = async () => {
    if (!script) return
    try {
      await save(withScriptStatus(script, 'approved'))
      if (!useStore.getState().claude?.loggedIn) return toast('Approved. Sign in to your agent in the chat, then ask it to write the video.', 'info')
      if (await sendChat('I approved the script. Write scene.py from it, then render and check it.', false)) toast('Approved. Claude is writing the video from it.', 'ok')
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  if (script === null && !editing)
    return (
      <div className="script-pane empty">
        <NotebookPen />
        <p>
          <strong>No script yet</strong>
          <br />
          <span className="muted">
            {scriptFirst
              ? 'Describe the video in the chat: Claude plans it here first (the idea, each section’s narration and visuals), and writes the code once you approve.'
              : 'Script first is off for this project. Turn it on in Settings → Video, or ask Claude for a script.'}
          </span>
        </p>
        {!scriptFirst && (
          <button className="btn" onClick={() => openDialog({ kind: 'settings', tab: 'video' })}>
            Open Settings → Video
          </button>
        )}
      </div>
    )

  const status = script ? scriptStatus(script) : 'draft'
  return (
    <div className="script-pane">
      <div className="script-bar">
        <span className={`badge ${status === 'approved' ? 'mint' : 'sun'}`}>
          {status === 'approved' ? <Check /> : <Pencil />} {status === 'approved' ? 'Approved' : 'Draft'}
        </span>
        <span className="grow" />
        {editing ? (
          <>
            <button className="btn small ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button
              className="btn small"
              onClick={() =>
                void save(draft).then(
                  () => setEditing(false),
                  (e) => toast(errorText(e), 'error'),
                )
              }
            >
              Save
            </button>
          </>
        ) : (
          <>
            <button className="btn small ghost" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </button>
            {status === 'draft' && (
              <button className="btn small primary" disabled={chatBusy} onClick={() => void approve()} title={chatBusy ? 'Claude is still working' : undefined}>
                <Sparkles /> Approve and make the video
              </button>
            )}
          </>
        )}
      </div>
      {editing ? (
        <textarea className="script-editor" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck autoFocus />
      ) : (
        <article className="script-view">{renderScript(scriptBody(script ?? ''))}</article>
      )}
    </div>
  )
}

/** The script's Markdown, as far as the format uses it: headings, quotes, lists, **bold**, *italic*, `code`. */
function renderScript(md: string): ReactNode[] {
  const out: ReactNode[] = []
  const lines = md.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    if (line.startsWith('# ')) out.push(<h2 key={i}>{inline(line.slice(2))}</h2>)
    else if (line.startsWith('## ')) out.push(<h3 key={i}>{inline(line.slice(3))}</h3>)
    else if (line.startsWith('### ')) out.push(<h4 key={i}>{inline(line.slice(4))}</h4>)
    else if (line.startsWith('>')) {
      const quote: string[] = []
      for (; i < lines.length && lines[i].startsWith('>'); i++) quote.push(lines[i].replace(/^>\s?/, ''))
      i--
      out.push(<blockquote key={i}>{quote.map((q, j) => <p key={j}>{inline(q)}</p>)}</blockquote>)
    } else if (/^\s*[-*] /.test(line)) {
      const items: string[] = []
      for (; i < lines.length && /^\s*[-*] /.test(lines[i]); i++) items.push(lines[i].replace(/^\s*[-*] /, ''))
      i--
      out.push(<ul key={i}>{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>)
    } else out.push(<p key={i}>{inline(line)}</p>)
  }
  return out
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : part.startsWith('`') && part.endsWith('`') && part.length > 2 ? (
      <code key={i}>{part.slice(1, -1)}</code>
    ) : part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
      <em key={i}>{part.slice(1, -1)}</em>
    ) : (
      part
    ),
  )
}
