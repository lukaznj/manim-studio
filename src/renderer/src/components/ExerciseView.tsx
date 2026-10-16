import { Check, CircleAlert, Code2, Eye, Film, FolderOpen, MessageCircleQuestion, Pause, Play, RotateCcw, Search, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ExerciseDetail, ExerciseHit, ExerciseItem, ExerciseSet, Section } from '../../../shared/types'
import { fold } from '../../../shared/exercise'
import { api } from '../lib/api'
import { revealLabel } from '../lib/platform'
import { askInChat, canEdit, errorText, openDialog, openExerciseSet, selectStudied, toast, useStore } from '../store'
import { Markdown } from './Markdown'
import { StudyPlayer } from './StudyPlayer'
import { WatchedToggle } from './LessonView'

// The study screen's exercises (StudyView.tsx, src/main/exercises.ts, ADR 0025).

const LABEL: Record<ExerciseItem['state'], string> = {
  waiting: 'Waiting to be solved',
  solving: 'Solving',
  solved: 'Solved; the video comes next',
  video: 'Making the video',
  export: 'Exporting the video',
  done: 'Done',
  failed: 'Didn’t finish',
}

/** Searches every exercise, in every set: the hits replace the study screen's list while it's typed. */
export function ExerciseSearch({ query, onQuery }: { query: string; onQuery: (q: string) => void }) {
  return (
    <label className="ex-search">
      <Search />
      <input className="input" placeholder="Search all exercises" value={query} onChange={(e) => onQuery(e.target.value)} aria-label="Search all exercises" />
      {query && (
        <button className="icon-btn" aria-label="Clear the search" onClick={() => onQuery('')}>
          <X />
        </button>
      )}
    </label>
  )
}

export function useExerciseHits(query: string): ExerciseHit[] | null {
  const [hits, setHits] = useState<ExerciseHit[] | null>(null)
  useEffect(() => {
    if (!query.trim()) return setHits(null)
    const t = setTimeout(() => void api.searchExercises(query).then(setHits), 180)
    return () => clearTimeout(t)
  }, [query])
  return hits
}

export function ExerciseHits({ hits, query, set, selected }: { hits: ExerciseHit[]; query: string; set: ExerciseSet | null; selected?: string }) {
  return (
    <ul className="ex-list">
      {!hits.length && <li className="ex-none faint">No exercise mentions “{query}”.</li>}
      {hits.map((h) => (
        <li key={h.dir}>
          <button
            className={`ex-row ${h.dir === selected ? 'on' : ''}`}
            onClick={() => void (h.set === set?.folder ? selectStudied(h.dir) : openExerciseSet(h.set, h.dir))}
          >
            <span className="ex-num mono">{h.number}</span>
            <span className="ex-row-body">
              <span className="ex-row-title">{h.title}</span>
              <span className="ex-row-state">{h.set === set?.folder ? h.topic || h.snippet : `${h.setTitle} · ${h.topic || h.snippet}`}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** The set's exercises in the study screen's list (and the intake's progress while they're read). */
export function ExerciseRows({ set, selected }: { set: ExerciseSet; selected?: string }) {
  return (
    <>
      {set.intake && <IntakeRow set={set} />}
      {set.items.map((it) => (
        <li key={it.dir}>
          <button className={`ex-row ${it.dir === selected ? 'on' : ''} state-${it.state}`} onClick={() => void selectStudied(it.dir)}>
            <span className="ex-num mono">{it.number}</span>
            <span className="ex-row-body">
              <span className="ex-row-title">{it.title}</span>
              <span className="ex-row-state">
                {it.state === 'done'
                  ? it.topic || 'Done'
                  : set.paused && ['waiting', 'solved'].includes(it.state)
                    ? 'Paused'
                    : (it.activity ?? LABEL[it.state])}
              </span>
            </span>
            <StateIcon item={it} paused={!!set.paused} />
          </button>
        </li>
      ))}
    </>
  )
}

/** Under the list: the set's lecture video and pausing its agents. */
export function ExerciseActions({ set }: { set: ExerciseSet }) {
  const working = set.items.some((i) => ['solving', 'video', 'export'].includes(i.state))
  const done = set.items.filter((i) => i.state === 'done').length
  return (
    <>
      <div className="ex-side-actions">
        <button
          className="btn small ghost"
          disabled={!done}
          title={done ? undefined : 'Once an exercise has its video'}
          onClick={() => openDialog({ kind: 'lecture' })}
        >
          <Film /> Lecture video
        </button>
        {(working || set.paused) && (
          <button className="btn small ghost" onClick={() => void api.pauseExercises(set.folder, !set.paused)}>
            {set.paused ? <Play /> : <Pause />} {set.paused ? 'Resume' : 'Pause'}
          </button>
        )}
      </div>
      {set.lecture && <LectureNote set={set} />}
    </>
  )
}

function StateIcon({ item, paused }: { item: ExerciseItem; paused: boolean }) {
  if (item.state === 'done') return item.watched ? <Eye className="ex-state-icon watched" /> : <Check className="ex-state-icon done" />
  if (item.state === 'failed') return <CircleAlert className="ex-state-icon failed" />
  if (['solving', 'video', 'export'].includes(item.state)) return <span className="spinner" />
  if (paused) return <Pause className="ex-state-icon" />
  return null
}

function IntakeRow({ set }: { set: ExerciseSet }) {
  const intake = set.intake!
  const what = intake.files ? `${intake.files === 1 ? 'the file' : `${intake.files} files`} you added` : 'what you typed'
  return (
    <li className={`ex-intake ${intake.state}`}>
      {intake.state === 'reading' ? <span className="spinner" /> : <CircleAlert />}
      <span>
        {intake.state === 'reading' ? `Reading the exercises in ${what}…` : `Couldn’t read the exercises in ${what}: ${intake.error}`}
        {intake.state === 'failed' && (
          <button className="link-btn" onClick={() => openDialog({ kind: 'add-exercises' })}>
            Try again
          </button>
        )}
      </span>
    </li>
  )
}

function LectureNote({ set }: { set: ExerciseSet }) {
  const l = set.lecture!
  if (l.state === 'making')
    return (
      <p className="ex-lecture faint">
        <span className="spinner" /> Joining the videos…
      </p>
    )
  if (l.state === 'failed') return <p className="ex-lecture error-text">The lecture video failed: {l.error}</p>
  return (
    <p className="ex-lecture">
      <Check /> Lecture video ready.{' '}
      <button className="link-btn" onClick={() => void api.reveal(l.file!)}>
        {revealLabel}
      </button>
    </p>
  )
}

export function ExerciseEmpty({ set }: { set: ExerciseSet }) {
  return (
    <div className="ex-empty">
      <Sparkles />
      <p>
        {set.intake?.state === 'reading'
          ? 'Your exercises show up here as soon as they’re read.'
          : 'Add exercises to start: type them, paste a screenshot or add pictures and PDFs.'}
      </p>
    </div>
  )
}

/** The selected exercise: what's asked, the video, and the written solution step by step. */
export function ExerciseMain({ item }: { item: ExerciseItem }) {
  const editing = useStore((s) => canEdit(s)) // Learn mode has no editor (ADR 0029)
  const [detail, setDetail] = useState<ExerciseDetail | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    void api.exerciseDetail(item.dir).then(setDetail, () => setDetail(null))
  }, [item.dir, item.state, item.video])

  const seek = (s: Section) => {
    const v = video.current
    if (!v) return
    v.currentTime = s.start + 0.01
    void v.play()
  }
  const chapterFor = (title: string, i: number): Section | undefined => {
    const chapters = detail?.chapters ?? []
    return chapters.find((c) => fold(c.name).trim() === fold(title).trim()) ?? chapters.filter((c) => fold(c.name) !== 'exercise')[i]
  }
  const ask = askInChat
  const hasVideo = !!(item.video ?? detail?.preview)

  return (
    <div className="ex-detail">
      <header className="ex-detail-head">
        <div>
          <span className="eyebrow">Exercise {item.number}</span>
          <h1>{item.title}</h1>
        </div>
        <div className="ex-detail-actions">
          {item.video && <WatchedToggle dir={item.dir} watched={!!item.watched} />}
          {item.state === 'failed' && (
            <button className="btn small" onClick={() => void api.retryExercise(item.dir).catch((e) => toast(errorText(e), 'error'))}>
              <RotateCcw /> Try again
            </button>
          )}
          {editing && (
            <button className="btn small ghost" title="The code, timeline and voice of this video" onClick={() => useStore.setState({ screen: 'editor' })}>
              <Code2 /> Open in editor
            </button>
          )}
          <button className="icon-btn" title={revealLabel} aria-label={revealLabel} onClick={() => void api.reveal(item.dir)}>
            <FolderOpen />
          </button>
          <button
            className="icon-btn"
            title="Remove this exercise"
            aria-label="Remove this exercise"
            onClick={() => {
              if (confirm(`Remove “${item.title}”? Its folder goes to the Trash.`)) void api.removeExercise(item.dir).catch((e) => toast(errorText(e), 'error'))
            }}
          >
            <Trash2 />
          </button>
        </div>
      </header>
      {item.state === 'failed' && item.error && <p className="ex-error">{item.error}</p>}

      <section className="ex-card ex-problem">
        <h2 className="ex-card-title">The exercise</h2>
        {detail ? <Markdown text={detail.problem} /> : <p className="faint">…</p>}
        {!!detail?.pictures.length && (
          <div className="ex-pictures">
            {detail.pictures.map((p) => (
              <a key={p} href="#" onClick={(e) => (e.preventDefault(), void api.reveal(p))} title="The original">
                <img src={api.mediaUrl(p)} alt="The exercise as given" />
              </a>
            ))}
          </div>
        )}
      </section>

      <ExercisePlayer item={item} detail={detail} video={video} />

      {detail?.solution ? (
        <section className="ex-card ex-solution">
          <h2 className="ex-card-title">Solution</h2>
          {detail.solution.answer && (
            <div className="ex-answer">
              <span className="eyebrow">Answer</span>
              <Markdown text={detail.solution.answer} />
            </div>
          )}
          {detail.solution.intro && <Markdown text={detail.solution.intro} />}
          <ol className="ex-steps">
            {detail.solution.steps.map((step, i) => {
              const chapter = chapterFor(step.title, i)
              return (
                <li key={i} className="ex-step">
                  <div className="ex-step-head">
                    <span className="ex-step-num mono">{i + 1}</span>
                    <h3>{step.title}</h3>
                    {chapter && hasVideo && (
                      <button className="btn small ghost" onClick={() => seek(chapter)} title="Play this step in the video">
                        <Play /> {Math.floor(chapter.start / 60)}:{String(Math.floor(chapter.start % 60)).padStart(2, '0')}
                      </button>
                    )}
                    <button className="btn small ghost" onClick={() => ask(`I don’t understand step ${i + 1} (“${step.title}”). Explain it more thoroughly.`)}>
                      <MessageCircleQuestion /> Ask
                    </button>
                  </div>
                  <Markdown text={step.body} />
                </li>
              )
            })}
          </ol>
          <ExplainBetter item={item} />
        </section>
      ) : (
        <section className="ex-card ex-pending faint">
          {item.state === 'failed' ? (
            'No written solution yet.'
          ) : ['solving'].includes(item.state) ? (
            <>
              <span className="spinner" /> {item.activity ?? 'Solving'}…
            </>
          ) : (
            'The written solution shows up here once it’s solved.'
          )}
        </section>
      )}
    </div>
  )
}

function ExercisePlayer({ item, detail, video }: { item: ExerciseItem; detail: ExerciseDetail | null; video: React.RefObject<HTMLVideoElement | null> }) {
  const src = item.video ?? detail?.preview
  if (!src)
    return (
      <section className="ex-card ex-player-wait faint">
        <Film />
        {item.state === 'video' || item.state === 'export' ? (
          <span>
            <span className="spinner" /> {item.activity ?? LABEL[item.state]}…
          </span>
        ) : (
          <span>The video is made once the written solution is checked.</span>
        )}
      </section>
    )
  return (
    <>
      <StudyPlayer
        src={src}
        vtt={item.video ? item.subtitles : undefined}
        chapters={detail?.chapters ?? []}
        video={video}
        onWatched={() => item.video && !item.watched && void api.setWatched(item.dir, true)}
      />
      {!item.video && <p className="faint ex-preview-note">The preview, until the video is exported.</p>}
    </>
  )
}

/** "I don't get this part": the video is redone with it explained more thoroughly. */
function ExplainBetter({ item }: { item: ExerciseItem }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const working = ['solving', 'video', 'export'].includes(item.state)
  if (!open)
    return (
      <div className="ex-explain">
        <button className="btn small" disabled={working} title={working ? 'Once its agent is done' : undefined} onClick={() => setOpen(true)}>
          <Sparkles /> Explain something better in the video
        </button>
        <span className="faint">For a quick question, ask in the chat instead: it answers right away.</span>
      </div>
    )
  return (
    <div className="ex-explain open">
      <label className="label" htmlFor="ex-explain-text">
        What should the video explain more thoroughly?
      </label>
      <textarea
        id="ex-explain-text"
        className="textarea"
        rows={3}
        autoFocus
        placeholder="e.g. I don’t see why we factor here, and where the 5 in step 2 comes from."
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
              await api.reviseExercise(item.dir, text)
              setOpen(false)
              setText('')
              toast('The video is being redone with that explained more thoroughly.', 'ok')
            } catch (e) {
              toast(errorText(e), 'error')
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? <span className="spinner" /> : <Sparkles />} Redo the video
        </button>
      </div>
    </div>
  )
}
