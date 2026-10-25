import { t as uiText, format } from '../lib/i18n'
import { Check, CircleAlert, Code2, CornerDownRight, Eye, EyeOff, MessageCircleQuestion, RotateCcw, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FollowUp, WatchDetail, WatchEpisode } from '../../../shared/types'
import { nextStudyEpisode } from '../../../shared/study-playback'
import { api } from '../lib/api'
import { canEdit, errorText, selectStudied, toast, useStore } from '../store'
import { StudyPlayer } from './StudyPlayer'
import { Modal } from './ui'

// The study screen's lessons (StudyView.tsx): a series' episodes and follow-ups, or a single video
// (src/main/watch.ts, ADR 0028).

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** A lesson in the study screen's list, with its follow-up videos under it. */
export function EpisodeRow({ episode: e, selected }: { episode: WatchEpisode; selected?: string }) {
  return (
    <>
      <li>
        <button
          className={`ex-row ${e.dir === selected ? 'on' : ''}`}
          aria-current={e.dir === selected ? 'true' : undefined}
          title={e.title}
          onClick={() => void selectStudied(e.dir)}
        >
          <span className="ex-num mono">{e.number}</span>
          <span className="ex-row-body">
            <span className="ex-row-title">{e.title}</span>
            <span className="ex-row-state">
              {e.state === 'making'
                ? (e.activity ?? uiText('Making the video'))
                : e.state === 'failed'
                  ? uiText('Didn’t finish')
                  : e.watched
                    ? uiText('Watched')
                    : e.video
                      ? uiText('Ready to watch')
                      : uiText('Preview')}
            </span>
          </span>
          {e.state === 'making' ? (
            <span className="spinner" />
          ) : e.state === 'failed' ? (
            <CircleAlert className="ex-state-icon failed" />
          ) : (
            e.watched && <Check className="ex-state-icon watched" />
          )}
        </button>
      </li>
      {e.followUps.map((f) => (
        <li key={f.dir}>
          <button className={`ex-row follow ${f.dir === selected ? 'on' : ''} state-${f.state}`} onClick={() => void selectStudied(f.dir)}>
            <CornerDownRight className="ex-follow-icon" />
            <span className="ex-row-body">
              <span className="ex-row-title">{f.request}</span>
              <span className="ex-row-state">
                {f.state === 'making'
                  ? (f.activity ?? uiText('Making the video'))
                  : f.state === 'failed'
                    ? (f.error ?? uiText('Didn’t finish'))
                    : format('Follow-up from {0}', [clock(f.at)])}
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
export function Watched({ dir, episode, followUp, single }: { dir: string; episode: WatchEpisode; followUp?: FollowUp; single: boolean }) {
  const editing = useStore((s) => canEdit(s)) // Learn mode has no editor (ADR 0029)
  const startPlaying = useStore((s) => s.studyAutoplayPath === dir)
  // openProject already returned this lesson's timeline. Keep the player in place while
  // watchDetail discovers its export/subtitles instead of briefly showing a smaller empty card.
  const seed = (): WatchDetail => {
    const { project, timeline } = useStore.getState()
    const current = project?.path === dir ? timeline : null
    return {
      video: followUp ? followUp.video : episode.video,
      preview: current?.video,
      chapters: current?.sections.filter((s) => s.end > s.start) ?? [],
      subtitles: current?.subtitles ?? [],
    }
  }
  const [loaded, setLoaded] = useState<{ dir: string; detail: WatchDetail } | null>(null)
  const detail = loaded?.dir === dir ? loaded.detail : seed()
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    let active = true
    void api.watchDetail(dir).then(
      (next) => active && setLoaded({ dir, detail: next }),
      () => undefined,
    )
    return () => {
      active = false
    }
  }, [dir, followUp?.state, episode.video])
  const src = detail?.video ?? detail?.preview
  const state = followUp?.state ?? episode.state
  const error = followUp?.error ?? episode.error

  return (
    <div className="ex-detail">
      <header className="ex-detail-head">
        <div>
          <span className="eyebrow">
            {followUp ? format('Follow-up to episode {0}', [episode.number]) : single ? uiText('Video') : format('Lesson {0}', [episode.number])}
          </span>
          <h1>{followUp ? followUp.request : episode.title}</h1>
        </div>
        <div className="ex-detail-actions">
          <WatchedToggle dir={dir} watched={!!(followUp ? followUp.watched : episode.watched)} />
          {state === 'failed' && (
            <button
              className="btn small"
              onClick={() => void (followUp ? api.retryFollowUp(dir) : api.retryCourseLesson(dir)).catch((e) => toast(errorText(e), 'error'))}
            >
              <RotateCcw /> {uiText(' Try again')}
            </button>
          )}
          {editing && (
            <button
              className="btn small ghost"
              title={uiText('The code, timeline and voice of this video')}
              onClick={() => useStore.setState({ screen: 'editor' })}
            >
              <Code2 /> {uiText(' Open in editor')}
            </button>
          )}
        </div>
      </header>
      {state === 'failed' && error && <p className="ex-error">{error}</p>}

      {src ? (
        <>
          <StudyPlayer
            src={src}
            vtt={detail?.video ? detail.vtt : undefined}
            chapters={detail?.chapters ?? []}
            video={video}
            resume
            startPlaying={startPlaying}
            seriesAutoplay={!followUp && !single}
            onEnded={() => {
              const current = useStore.getState()
              if (
                followUp ||
                single ||
                current.project?.path !== dir ||
                !current.settings?.studyAutoplay ||
                current.dialog ||
                document.querySelector('dialog[open]')
              )
                return
              const next = nextStudyEpisode(current.watchSeries?.episodes ?? [], dir)
              if (next) void selectStudied(next.dir, true)
            }}
            onWatched={() => !(followUp ? followUp.watched : episode.watched) && void api.setWatched(dir, true)}
          />
          {!detail?.video && <p className="faint ex-preview-note">{uiText('The preview: export the video for the full quality.')}</p>}
        </>
      ) : (
        <section className="ex-card ex-player-wait faint">
          {state === 'making' ? (
            <span>
              <span className="spinner" /> {followUp?.activity ?? episode.activity ?? uiText('Making the video')}…
            </span>
          ) : (
            <span>{uiText('Nothing rendered yet.')}</span>
          )}
        </section>
      )}

      {!followUp && !single && src && <FollowUpRequest key={dir} dir={dir} />}
    </div>
  )
}

/** Watched or not: marked by itself at 90%, or here by hand. */
export function WatchedToggle({ dir, watched }: { dir: string; watched: boolean }) {
  return (
    <button
      className={`btn small ${watched ? '' : 'ghost'}`}
      aria-pressed={watched}
      onClick={() => void api.setWatched(dir, !watched)}
      title={watched ? uiText('Mark as not watched') : uiText('Mark as watched')}
    >
      {watched ? <Eye /> : <EyeOff />} {watched ? uiText('Watched') : uiText('Not watched')}
    </button>
  )
}

/** A new video that explains the part at the current moment further: it goes under this episode. */
function FollowUpRequest({ dir }: { dir: string }) {
  const at = useStore((s) => s.watchTime ?? 0)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [moment, setMoment] = useState(0)
  return (
    <>
      <div className="study-lesson-tools" data-tour="study-clarity">
        <span className="hint">{uiText('Need a little more clarity?')}</span>
        <div>
          <button className="btn small ghost" onClick={() => useStore.setState({ studyTab: 'chat', chatDraft: '' })}>
            <MessageCircleQuestion />
            {uiText('Ask a question')}
          </button>
          <button
            className="btn small"
            onClick={() => {
              setMoment(at)
              setOpen(true)
            }}
          >
            <Sparkles />
            {uiText('Go deeper')}
          </button>
        </div>
      </div>
      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title={uiText('A closer look')}
        icon={<Sparkles className="head-icon" />}
        width={520}
        footer={
          <>
            <button className="btn ghost" disabled={busy} onClick={() => setOpen(false)}>
              {uiText('Cancel')}
            </button>
            <button
              className="btn primary"
              disabled={!text.trim() || busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await api.requestFollowUp(dir, moment, text)
                  setOpen(false)
                  setText('')
                  toast(uiText('A follow-up video is being made. It shows under this episode.'), 'ok')
                } catch (e) {
                  toast(errorText(e), 'error')
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? <span className="spinner" /> : <Sparkles />}
              {uiText('Create follow-up video')}
            </button>
          </>
        }
      >
        <div className="modal-body quick-form">
          <p className="hint">
            {uiText('A short video that explains this moment more slowly, with the same notation. You can keep studying while it is made.')}
          </p>
          <label className="label" htmlFor="watch-follow">
            {uiText('What should a new video explain further, around ')}
            {clock(moment)}?
          </label>
          <textarea
            id="watch-follow"
            className="textarea ex-input"
            rows={4}
            data-autofocus
            placeholder={uiText('e.g. I don’t see why the current splits here, and where R₂₃ comes from.')}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
      </Modal>
    </>
  )
}
