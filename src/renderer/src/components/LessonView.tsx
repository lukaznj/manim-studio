import { t as uiText, format } from '../lib/i18n'
import { ArrowLeft, Check, ChevronDown, CircleAlert, Code2, CornerDownRight, Eye, EyeOff, Play, RotateCcw, Video } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FollowUp, SeriesRun, WatchDetail, WatchEpisode } from '../../../shared/types'
import { nextStudyEpisode } from '../../../shared/study-playback'
import { api } from '../lib/api'
import { canEdit, errorText, returnToStudyVideo, selectStudied, toast, useStore, watchAdditionalVideo } from '../store'
import { StudyPlayer } from './StudyPlayer'
import { StudyNotes } from './StudyNotes'
import { nearbyFollowUps } from '../../../shared/study-assistant'
import { EpisodeStatus, ProductionIcon } from './SeriesProduction'
import { StudyRowProgress } from './StudyRowProgress'
import { NarrationRecovery } from './NarrationRecovery'
import { narrationStatus } from '../../../shared/narration'

// The study screen's lessons (StudyView.tsx): a series' episodes and follow-ups, or a single video
// (src/main/watch.ts, ADR 0028).

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** A lesson in the study screen's list, with its follow-up videos under it. */
export function EpisodeRow({ episode: e, selected, run }: { episode: WatchEpisode; selected?: string; run?: SeriesRun }) {
  const producing = run?.episodes.find((ep) => ep.dir === e.dir)
  const [expanded, setExpanded] = useState(false)
  const selectedFollow = e.followUps.some((f) => f.dir === selected)
  useEffect(() => { if (selectedFollow) setExpanded(true) }, [selectedFollow])
  return (
    <>
      <li>
        <button
          className={`ex-row ${e.dir === selected ? 'on' : ''}`}
          aria-current={e.dir === selected ? 'true' : undefined}
          title={e.title}
          onClick={() => void selectStudied(e.dir)}
        >
          <span className="ex-num mono" title={format('Lesson {0}', [e.number])}>{e.number}</span>
          <span className="ex-row-body">
            <span className="ex-row-title">{e.title}</span>
            <StudyRowProgress dir={e.dir} available={(!producing || producing.state === 'done') && e.state !== 'making' && e.state !== 'failed'}>
              {producing && producing.state !== 'done' ? <EpisodeStatus run={run!} episode={producing} /> : e.state === 'making'
                ? (e.activity ?? uiText('Making the video'))
                : e.state === 'failed'
                  ? uiText('Didn’t finish')
                  : e.watched
                    ? uiText('Watched')
                    : e.video
                      ? uiText('Ready to watch')
                      : uiText('Preview')}
            </StudyRowProgress>
          </span>
          {producing && producing.state !== 'done' ? <span className={`production-row-icon state-${producing.state}`}><ProductionIcon run={run!} episode={producing} /></span> : e.state === 'making' ? (
            <span className="spinner" />
          ) : e.state === 'failed' ? (
            <CircleAlert className="ex-state-icon failed" />
          ) : (
            e.watched && <Check className="ex-state-icon watched" />
          )}
        </button>
      </li>
      {!!e.followUps.length && <li className="study-follow-toggle"><button aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><ChevronDown className={expanded ? 'expanded' : ''} />{uiText('Additional videos')}<small>{e.followUps.length}</small></button></li>}
      {expanded && e.followUps.map((f) => (
        <li key={f.dir}>
          <button className={`ex-row follow ${f.dir === selected ? 'on' : ''} state-${f.state}`} onClick={() => void selectStudied(f.dir)}>
            <CornerDownRight className="ex-follow-icon" />
            <span className="ex-row-body">
              <span className="ex-row-title">{f.title}</span>
              <StudyRowProgress dir={f.dir} available={f.state === 'done'}>
                {f.state === 'making'
                  ? (f.activity ?? uiText('Making the video'))
                  : f.state === 'failed'
                    ? (f.error ?? uiText('Didn’t finish'))
                    : format('Follow-up from {0}', [clock(f.at)])}
              </StudyRowProgress>
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
  const startAt = useStore((s) => s.studyStartAt)
  const returning = useStore((s) => s.studyReturn)
  const exportRevision = useStore((s) => s.exports.findLast((job) => job.project === dir && job.state === 'done')?.id)
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
      narration: narrationStatus(current),
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
  }, [dir, followUp?.state, episode.video, exportRevision])
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
          <h1>{followUp ? followUp.title : episode.title}</h1>
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
      {src && <NarrationRecovery dir={dir} status={detail.narration} />}
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
            startAt={startAt}
            overlay={returning ? <div className="study-detour-cue"><button onClick={() => void returnToStudyVideo()}><ArrowLeft /><span><strong>{uiText('Return to the lesson')}</strong><small>{uiText('Continue where you left off')}</small></span></button></div> : !followUp ? <FollowUpCue episode={episode} /> : undefined}
            seriesAutoplay={!followUp && !single}
            onEnded={() => {
              const current = useStore.getState()
              if (current.studyReturn) { void returnToStudyVideo(); return }
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

      {followUp && <button className="btn small ghost" onClick={() => returning ? void returnToStudyVideo() : void selectStudied(episode.dir)}><ArrowLeft />{uiText('Return to the lesson')}</button>}
      {!followUp && !!episode.followUps.length && <div className="study-additional-videos"><span className="eyebrow">{uiText('Additional videos')}</span>{episode.followUps.map((f) => <button key={f.dir} disabled={f.state !== 'done'} onClick={() => void watchAdditionalVideo(f.dir)}><Play /><span><strong>{f.title}</strong><small>{f.state === 'done' ? format('Follow-up from {0}', [clock(f.at)]) : f.state === 'failed' ? uiText('Didn’t finish') : uiText('Making the video')}</small></span></button>)}</div>}
      {src && <StudyNotes key={dir} dir={dir} />}
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

/** An optional detour appears near the moment that prompted it, including in fullscreen. */
function FollowUpCue({ episode }: { episode: WatchEpisode }) {
  const at = useStore((s) => s.watchTime ?? 0)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const followUps = nearbyFollowUps(episode.followUps, at)
  const follow = followUps.find((f) => f.dir !== dismissed)
  return follow ? <div className="study-detour-cue"><button onClick={() => void watchAdditionalVideo(follow.dir)}><Video /><span><strong>{follow.title}</strong><small>{uiText('Watch a deeper explanation · then return here')}</small></span><Play /></button><button className="icon-btn" aria-label={uiText('Dismiss')} onClick={() => setDismissed(follow.dir)}>×</button></div> : null
}
