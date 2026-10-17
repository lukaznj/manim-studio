import { t as uiText } from '../lib/i18n'
import { Captions, Plus, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { addCourseExercises, openDialog, useStore } from '../store'
import { ChatPane } from './ChatPane'
import { ExerciseActions, ExerciseEmpty, ExerciseHits, ExerciseMain, ExerciseRows, ExerciseSearch, useExerciseHits } from './ExerciseView'
import { EpisodeRow, Watched } from './LessonView'
import { findInTranscript, Transcript } from './Transcript'

/**
 * A course to study (ADR 0030): its lessons (a series' episodes with their follow-ups, or one video)
 * and its exercises, in one list, with the selected one in the middle and the chat beside it. A
 * series, an exercise set and a series with its own set all open here.
 */
export function StudyView() {
  const series = useStore((s) => s.watchSeries)
  const set = useStore((s) => s.exerciseSet)
  const path = useStore((s) => s.project?.path)
  const [query, setQuery] = useState('')
  const hits = useExerciseHits(query)
  const tab = useStore((s) => s.studyTab)
  // Cmd/Ctrl+F searches what the video says.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        findInTranscript()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  if (!series && !set) return null

  const single = !!series && series.episodes.length === 1 && series.episodes[0].dir === series.folder // a video on its own
  const episode = series?.episodes.find((e) => e.dir === path || e.followUps.some((f) => f.dir === path))
  const followUp = episode?.followUps.find((f) => f.dir === path)
  const item = set?.items.find((i) => i.dir === path)
  const both = !!series && !!set
  const version = item ? `${item.state}:${item.video ?? ''}` : `${episode?.video ?? ''}:${followUp?.state ?? ''}`
  const tabs = (
    <div className="pane-tabs" role="tablist" aria-label={uiText('Transcript or chat')}>
      <button role="tab" aria-selected={tab === 'transcript'} className="file-tab" onClick={() => useStore.setState({ studyTab: 'transcript' })}>
        <Captions /> {uiText(" Transcript")}
      </button>
      <button role="tab" aria-selected={tab === 'chat'} className="file-tab" onClick={() => useStore.setState({ studyTab: 'chat' })}>
        <Sparkles className="claude-mark" /> {uiText(" Chat")}
      </button>
    </div>
  )

  const parts = [
    series &&
      !single &&
      `${series.episodes.length === 1 ? '1 episode' : `${series.episodes.length} episodes`}, ${series.episodes.filter((e) => e.watched).length} watched`,
    single && 'A single video',
    set &&
      `${set.items.length === 1 ? '1 exercise' : `${set.items.length} exercises`}${set.items.length ? `, ${set.items.filter((i) => i.state === 'done').length} with a video${series ? '' : `, ${set.items.filter((i) => i.watched).length} watched`}` : ''}`,
    set?.level,
  ].filter(Boolean)

  return (
    <div className="ex-view">
      <aside className="ex-side">
        <div className="ex-side-head">
          <h2 className="ex-set-title">{series?.title ?? set!.title}</h2>
          <p className="faint">{parts.join(' · ')}</p>
          {set && <ExerciseSearch query={query} onQuery={setQuery} />}
        </div>
        {hits ? (
          <ExerciseHits hits={hits} query={query} set={set} selected={path} />
        ) : (
          <ul className="ex-list">
            {series && both && <li className="ex-group eyebrow">{uiText('Lessons')}</li>}
            {series?.episodes.map((e) => (
              <EpisodeRow key={e.dir} episode={e} selected={path} />
            ))}
            {set && both && <li className="ex-group eyebrow">{uiText('Exercises')}</li>}
            {set && <ExerciseRows set={set} selected={path} />}
          </ul>
        )}
        {(set || (series && !single)) && (
          <div className="ex-side-foot">
            <button
              className={`btn ${set ? 'primary' : ''}`}
              title={set ? undefined : uiText('Exercises for this course, solved in writing and on video with its notation')}
              onClick={() => (set ? openDialog({ kind: 'add-exercises' }) : void addCourseExercises())}
            >
              <Plus /> {uiText(" Add exercises")}
            </button>
            {set && <ExerciseActions set={set} />}
          </div>
        )}
      </aside>
      <main className="ex-main">
        {item ? (
          <ExerciseMain key={item.dir} item={item} />
        ) : episode && path ? (
          <Watched key={path} dir={path} episode={episode} followUp={followUp} single={single} />
        ) : set && !series ? (
          <ExerciseEmpty set={set} />
        ) : (
          <div className="ex-empty faint">{uiText('Choose a lesson or an exercise.')}</div>
        )}
      </main>
      <aside className="ex-chat">
        {!path ? (
          <div className="ex-empty faint">{uiText('The chat opens with the first exercise.')}</div>
        ) : tab === 'transcript' ? (
          <Transcript key={path} dir={path} version={version} head={tabs} />
        ) : (
          <ChatPane head={tabs} />
        )}
      </aside>
    </div>
  )
}
