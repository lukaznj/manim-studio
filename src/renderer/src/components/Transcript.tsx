import { ChevronDown, ChevronUp, MessageCircleQuestion, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Subtitle } from '../../../shared/types'
import { lineAt, transcriptHits, type TranscriptHit } from '../../../shared/transcript'
import { api } from '../lib/api'
import { askInChat, useStore } from '../store'
import { seekStudy } from './StudyPlayer'

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

let findPending = false // Cmd/Ctrl+F came while the Chat tab was showing: the search takes focus once it's there

/** Shows the transcript and puts the cursor in its search (Cmd/Ctrl+F on the study screen). */
export function findInTranscript(): void {
  findPending = true
  useStore.setState({ studyTab: 'transcript' })
  window.dispatchEvent(new Event('studio:find'))
}

/** After you scroll the transcript yourself, it stops following the video for this long. */
const HOLD_MS = 3500

/**
 * Everything the video says, as a column of lines that follows it (ADR 0032): the line being said
 * is lit, a click plays from a line, and searching jumps the transcript and the video to each match.
 * `version` changes when the video does (a new render or export), so its words are read again.
 */
export function Transcript({ dir, version, head }: { dir: string; version: string; head: React.ReactNode }) {
  const [lines, setLines] = useState<Subtitle[] | null>(null)
  const [query, setQuery] = useState('')
  const [pick, setPick] = useState(0) // which hit is chosen
  const now = useStore((s) => s.watchTime ?? 0)
  const list = useRef<HTMLOListElement>(null)
  const scrolledAt = useRef(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void api.watchDetail(dir).then(
      (d) => setLines(d.subtitles),
      () => setLines([]),
    )
  }, [dir, version])

  const hits = useMemo(() => transcriptHits(lines ?? [], query), [lines, query])
  const hit: TranscriptHit | undefined = hits[Math.min(pick, hits.length - 1)]
  const current = lineAt(lines ?? [], now)

  // Typing or stepping through the hits moves the video to the chosen one.
  useEffect(() => {
    if (!hit || !lines) return
    seekStudy(lines[hit.line].start)
    scrolledAt.current = 0
    scrollTo(hit.line)
  }, [hit?.line, hit?.from, query])

  // The lit line stays in the middle, unless you're reading elsewhere.
  useEffect(() => {
    if (current >= 0 && Date.now() - scrolledAt.current > HOLD_MS) scrollTo(current)
  }, [current])

  // Cmd/Ctrl+F: the search takes the cursor, now or once the lines are in (the box is off until then).
  useEffect(() => {
    const focus = () => {
      if (!input.current || input.current.disabled) return
      findPending = false
      input.current.focus()
      input.current.select()
    }
    if (findPending) requestAnimationFrame(focus)
    window.addEventListener('studio:find', focus)
    return () => window.removeEventListener('studio:find', focus)
  }, [lines])

  function scrollTo(line: number) {
    const el = list.current?.children[line] as HTMLElement | undefined
    const box = list.current
    if (!el || !box) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2, behavior: reduce ? 'auto' : 'smooth' })
  }

  const step = (by: number) => hits.length && setPick((p) => (Math.min(p, hits.length - 1) + by + hits.length) % hits.length)

  return (
    <div className="lyrics-pane">
      <div className="pane-head">{head}</div>
      <div className="lyrics-search">
        <label className="ex-search">
          <Search />
          <input
            ref={input}
            className="input"
            placeholder="Search what’s said"
            aria-label="Search what’s said in the video"
            value={query}
            disabled={!lines?.length}
            onChange={(e) => {
              setQuery(e.target.value)
              setPick(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                step(e.shiftKey ? -1 : 1)
              } else if (e.key === 'Escape' && query) {
                e.stopPropagation()
                setQuery('')
              }
            }}
          />
          {query && (
            <button className="icon-btn" aria-label="Clear the search" onClick={() => setQuery('')}>
              <X />
            </button>
          )}
        </label>
        {query.trim() && (
          <div className="lyrics-count">
            <span className={hits.length ? 'faint' : 'error-text'}>
              {hits.length ? `${Math.min(pick, hits.length - 1) + 1} of ${hits.length}` : 'Not said in this video'}
            </span>
            <button className="icon-btn" aria-label="Previous match" title="Previous match (Shift+Enter)" disabled={hits.length < 2} onClick={() => step(-1)}>
              <ChevronUp />
            </button>
            <button className="icon-btn" aria-label="Next match" title="Next match (Enter)" disabled={hits.length < 2} onClick={() => step(1)}>
              <ChevronDown />
            </button>
          </div>
        )}
      </div>

      {lines === null ? (
        <div className="ex-empty faint">…</div>
      ) : !lines.length ? (
        <div className="ex-empty faint">No narration in this video yet. Its words show up here once it has a voice.</div>
      ) : (
        <ol
          className="lyrics"
          ref={list}
          onWheel={() => (scrolledAt.current = Date.now())}
          onTouchMove={() => (scrolledAt.current = Date.now())}
          onKeyDown={(e) => ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key) && (scrolledAt.current = Date.now())}
        >
          {lines.map((l, i) => (
            <li key={i} className={`lyric ${i === current ? 'now' : i < current ? 'past' : ''}`}>
              <button className="lyric-line" onClick={() => ((scrolledAt.current = 0), seekStudy(l.start, true))} title={`Play from ${clock(l.start)}`}>
                <Marked text={l.text} hits={hits.filter((h) => h.line === i)} chosen={hit?.line === i ? hit : undefined} />
              </button>
              <span className="lyric-side">
                <span className="mono faint">{clock(l.start)}</span>
                <button
                  className="icon-btn"
                  title="Ask about this line in the chat"
                  aria-label="Ask about this line"
                  onClick={() =>
                    askInChat(`At ${clock(l.start)} it says: “${l.text.replace(/\s+/g, ' ')}”. I don’t understand this part. Explain it more thoroughly.`)
                  }
                >
                  <MessageCircleQuestion />
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** A line with its matches marked; the chosen match stands out. */
function Marked({ text, hits, chosen }: { text: string; hits: TranscriptHit[]; chosen?: TranscriptHit }) {
  if (!hits.length) return <>{text}</>
  const parts: React.ReactNode[] = []
  let at = 0
  for (const h of hits) {
    if (h.from > at) parts.push(text.slice(at, h.from))
    parts.push(
      <mark key={h.from} className={h === chosen || (chosen && h.from === chosen.from) ? 'chosen' : ''}>
        {text.slice(h.from, h.to)}
      </mark>,
    )
    at = h.to
  }
  parts.push(text.slice(at))
  return <>{parts}</>
}
