import { Check, CircleAlert, Code2, CornerDownRight, Eye, EyeOff, MessageCircleQuestion, RotateCcw, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FollowUp, WatchDetail, WatchEpisode } from '../../../shared/types'
import { api } from '../lib/api'
import { canEdit, errorText, selectWatched, toast, useStore } from '../store'
import { ChatPane } from './ChatPane'
import { StudyPlayer } from './StudyPlayer'

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/**
 * A series to study (src/main/watch.ts, ADR 0028): its episodes and their follow-up videos, the
 * selected video with its transcript, and the chat, which knows where in the video you are.
 */
export function WatchView() {
  const series = useStore((s) => s.watchSeries)
  const path = useStore((s) => s.project?.path)
  if (!series) return null
  const single = series.episodes.length === 1 && series.episodes[0].dir === series.folder // a video on its own, not a series
  const episode = series.episodes.find((e) => e.dir === path || e.followUps.some((f) => f.dir === path))
  const followUp = episode?.followUps.find((f) => f.dir === path)
  return (
    <div className="ex-view">
      <aside className="ex-side">
        <div className="ex-side-head">
          <h2 className="ex-set-title">{series.title}</h2>
          <p className="faint">
            {single ? 'A single video' : `${series.episodes.length} episodes, ${series.episodes.filter((e) => e.watched).length} watched`}
          </p>
        </div>
        <ul className="ex-list">
          {series.episodes.map((e) => (
            <EpisodeRow key={e.dir} episode={e} selected={path} />
          ))}
        </ul>
      </aside>
      <main className="ex-main">
        {episode && path ? (
          <Watched key={path} dir={path} episode={episode} followUp={followUp} single={single} />
        ) : (
          <div className="ex-empty faint">Choose an episode.</div>
        )}
      </main>
      <aside className="ex-chat">{path ? <ChatPane /> : null}</aside>
    </div>
  )
}

function EpisodeRow({ episode: e, selected }: { episode: WatchEpisode; selected?: string }) {
  return (
    <>
      <li>
        <button className={`ex-row ${e.dir === selected ? 'on' : ''}`} onClick={() => void selectWatched(e.dir)}>
          <span className="ex-num mono">{e.number}</span>
          <span className="ex-row-body">
            <span className="ex-row-title">{e.title}</span>
            <span className="ex-row-state">{e.watched ? 'Watched' : e.video ? 'Not watched yet' : 'Preview only: export it for the full quality'}</span>
          </span>
          {e.watched && <Eye className="ex-state-icon watched" />}
        </button>
      </li>
      {e.followUps.map((f) => (
        <li key={f.dir}>
          <button className={`ex-row follow ${f.dir === selected ? 'on' : ''} state-${f.state}`} onClick={() => void selectWatched(f.dir)}>
            <CornerDownRight className="ex-follow-icon" />
            <span className="ex-row-body">
              <span className="ex-row-title">{f.request}</span>
              <span className="ex-row-state">
                {f.state === 'making'
                  ? (f.activity ?? 'Making the video')
                  : f.state === 'failed'
                    ? (f.error ?? 'Didn’t finish')
                    : `Follow-up from ${clock(f.at)}`}
              </span>
            </span>
            {f.state === 'making' ? (
              <span className="spinner" />
            ) : f.state === 'failed' ? (
              <CircleAlert className="ex-state-icon failed" />
            ) : f.watched ? (
              <Eye className="ex-state-icon watched" />
            ) : (
              <Check className="ex-state-icon done" />
            )}
          </button>
        </li>
      ))}
    </>
  )
}

/** The selected episode or follow-up: the player, its transcript, and asking for a follow-up. */
function Watched({ dir, episode, followUp, single }: { dir: string; episode: WatchEpisode; followUp?: FollowUp; single: boolean }) {
  const editing = useStore((s) => canEdit(s)) // Learn mode has no editor (ADR 0029)
  const [detail, setDetail] = useState<WatchDetail | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    void api.watchDetail(dir).then(setDetail, () => setDetail(null))
  }, [dir, followUp?.state, episode.video])
  const src = detail?.video ?? detail?.preview
  const ask = (text: string) => useStore.setState({ chatDraft: text })

  return (
    <div className="ex-detail">
      <header className="ex-detail-head">
        <div>
          <span className="eyebrow">{followUp ? `Follow-up to episode ${episode.number}` : single ? 'Video' : `Episode ${episode.number}`}</span>
          <h1>{followUp ? followUp.request : episode.title}</h1>
        </div>
        <div className="ex-detail-actions">
          <WatchedToggle dir={dir} watched={!!(followUp ? followUp.watched : episode.watched)} />
          {followUp?.state === 'failed' && (
            <button className="btn small" onClick={() => void api.retryFollowUp(dir).catch((e) => toast(errorText(e), 'error'))}>
              <RotateCcw /> Try again
            </button>
          )}
          {editing && (
            <button className="btn small ghost" title="The code, timeline and voice of this video" onClick={() => useStore.setState({ screen: 'editor' })}>
              <Code2 /> Open in editor
            </button>
          )}
        </div>
      </header>
      {followUp?.state === 'failed' && followUp.error && <p className="ex-error">{followUp.error}</p>}

      {src ? (
        <>
          <StudyPlayer
            src={src}
            vtt={detail?.video ? detail.vtt : undefined}
            chapters={detail?.chapters ?? []}
            video={video}
            resume
            onWatched={() => !(followUp ? followUp.watched : episode.watched) && void api.setWatched(dir, true)}
          />
          {!detail?.video && <p className="faint ex-preview-note">The preview: export the video for the full quality.</p>}
        </>
      ) : (
        <section className="ex-card ex-player-wait faint">
          {followUp?.state === 'making' ? (
            <span>
              <span className="spinner" /> {followUp.activity ?? 'Making the video'}…
            </span>
          ) : (
            <span>Nothing rendered yet.</span>
          )}
        </section>
      )}

      {!!detail?.subtitles.length && (
        <Transcript
          detail={detail}
          video={video}
          onAsk={(line, t) => ask(`At ${clock(t)} it says: “${line}”. I don’t understand this part. Explain it more thoroughly.`)}
        />
      )}
      {!followUp && !single && src && <FollowUpRequest dir={dir} />}
    </div>
  )
}

/** Watched or not: marked by itself at 90%, or here by hand. */
export function WatchedToggle({ dir, watched }: { dir: string; watched: boolean }) {
  return (
    <button
      className={`btn small ${watched ? '' : 'ghost'}`}
      onClick={() => void api.setWatched(dir, !watched)}
      title={watched ? 'Mark as not watched' : 'Mark as watched'}
    >
      {watched ? <Eye /> : <EyeOff />} {watched ? 'Watched' : 'Not watched'}
    </button>
  )
}

/** What's said, line by line, following the video: click a line to go there, ask about it. */
function Transcript({
  detail,
  video,
  onAsk,
}: {
  detail: WatchDetail
  video: React.RefObject<HTMLVideoElement | null>
  onAsk: (line: string, t: number) => void
}) {
  const now = useStore((s) => s.watchTime ?? 0)
  const list = useRef<HTMLOListElement>(null)
  const current = detail.subtitles.findIndex((s) => now >= s.start && now < s.end)
  useEffect(() => {
    list.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [current])
  return (
    <section className="ex-card watch-transcript">
      <h2 className="ex-card-title">Transcript</h2>
      <ol ref={list}>
        {detail.subtitles.map((s, i) => (
          <li key={i} className={i === current ? 'on' : ''}>
            <button
              className="watch-line"
              onClick={() => {
                if (!video.current) return
                video.current.currentTime = s.start + 0.01
                void video.current.play()
              }}
            >
              <span className="mono faint">{clock(s.start)}</span> {s.text}
            </button>
            <button className="icon-btn" title="Ask about this line in the chat" aria-label="Ask about this line" onClick={() => onAsk(s.text, s.start)}>
              <MessageCircleQuestion />
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** A new video that explains the part at the current moment further: it goes under this episode. */
function FollowUpRequest({ dir }: { dir: string }) {
  const at = useStore((s) => s.watchTime ?? 0)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  if (!open)
    return (
      <div className="ex-explain">
        <button className="btn small" onClick={() => setOpen(true)}>
          <Sparkles /> Explain this part in a new video
        </button>
        <span className="faint">For a quick question, ask in the chat: it knows where in the video you are.</span>
      </div>
    )
  return (
    <div className="ex-explain open">
      <label className="label" htmlFor="watch-follow">
        What should a new video explain further, around {clock(at)}?
      </label>
      <textarea
        id="watch-follow"
        className="textarea"
        rows={3}
        autoFocus
        placeholder="e.g. I don’t see why the current splits here, and where R₂₃ comes from."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="ex-explain-actions">
        <button className="btn ghost small" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button
          className="btn primary small"
          disabled={!text.trim() || busy}
          onClick={async () => {
            setBusy(true)
            try {
              await api.requestFollowUp(dir, at, text)
              setOpen(false)
              setText('')
              toast('A follow-up video is being made. It shows under this episode.', 'ok')
            } catch (e) {
              toast(errorText(e), 'error')
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? <span className="spinner" /> : <Sparkles />} Make the video
        </button>
      </div>
    </div>
  )
}
