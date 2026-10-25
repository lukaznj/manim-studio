import { t as uiText, format } from '../lib/i18n'
import { BookOpen, Captions, ListChecks, Plus, Search, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { addCourseExercises, offerTour, openDialog, useStore } from '../store'
import { ChatPane } from './ChatPane'
import { AddLessonDialog } from './AddLessonDialog'
import { ExerciseActions, ExerciseEmpty, ExerciseHits, ExerciseMain, ExerciseRows, ExerciseSearch, useExerciseHits } from './ExerciseView'
import { EpisodeRow, Watched } from './LessonView'
import { findInTranscript, Transcript } from './Transcript'
import { Tabs } from './ui'
import { configuredAuth, LimitSwitch } from './LimitSwitch'
import { api } from '../lib/api'

/** Video first, with one library section and one assistant panel visible at a time. */
export function StudyView() {
  const series = useStore((s) => s.watchSeries)
  const set = useStore((s) => s.exerciseSet)
  const path = useStore((s) => s.project?.path)
  const tab = useStore((s) => s.studyTab)
  const item = set?.items.find((i) => i.dir === path)
  const [library, setLibrary] = useState<'lessons' | 'exercises'>(series ? 'lessons' : 'exercises')
  const [query, setQuery] = useState('')
  const [lessonQuery, setLessonQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const hits = useExerciseHits(library === 'exercises' ? query : '')
  const settings = useStore((s) => s.settings)
  useEffect(() => {
    setLibrary(item || !series ? 'exercises' : 'lessons')
  }, [path, series?.folder, set?.folder])
  useEffect(() => {
    setQuery('')
    setLessonQuery('')
  }, [series?.folder, set?.folder])
  useEffect(() => offerTour('study'), [])
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
  const single = !!series && series.episodes.length === 1 && series.episodes[0].dir === series.folder
  const episode = series?.episodes.find((e) => e.dir === path || e.followUps.some((f) => f.dir === path))
  const followUp = episode?.followUps.find((f) => f.dir === path)
  const version = item ? `${item.state}:${item.video ?? ''}` : `${episode?.video ?? ''}:${followUp?.state ?? ''}`
  const watched = series?.episodes.filter((e) => e.watched).length ?? 0
  const count = series?.episodes.length ?? 0
  const lessons =
    series?.episodes.filter((e) => `${e.title} ${e.followUps.map((f) => f.request).join(' ')}`.toLocaleLowerCase().includes(lessonQuery.toLocaleLowerCase())) ??
    []

  return (
    <div className="ex-view study-view">
      <aside className="ex-side" data-tour="study-library">
        <div className="ex-side-head">
          <span className="eyebrow">{series && !single ? uiText('Your course') : uiText('Your library')}</span>
          <h2 className="ex-set-title">{series?.title ?? set!.title}</h2>
          {series ? (
            <>
              <p className="faint">{format('{0} of {1} lessons watched', [watched, count])}</p>
              <div
                className="study-course-progress"
                role="progressbar"
                aria-label={uiText('Course progress')}
                aria-valuenow={watched}
                aria-valuemin={0}
                aria-valuemax={count || 1}
              >
                <span style={{ width: `${count ? (watched / count) * 100 : 0}%` }} />
              </div>
            </>
          ) : (
            <p className="faint">{format('{0} exercises', [set!.items.length])}</p>
          )}
          {series && !single ? (
            <Tabs
              label={uiText('Course library')}
              value={library}
              onChange={setLibrary}
              items={[
                {
                  value: 'lessons',
                  label: (
                    <>
                      <BookOpen />
                      {uiText('Lessons')}
                      <small>{count}</small>
                    </>
                  ),
                },
                {
                  value: 'exercises',
                  label: (
                    <>
                      <ListChecks />
                      {uiText('Exercises')}
                      <small>{set?.items.length ?? 0}</small>
                    </>
                  ),
                },
              ]}
            />
          ) : (
            <span className="study-library-label">{series ? uiText('Lessons') : uiText('Exercises')}</span>
          )}
          {library === 'exercises' && set && <ExerciseSearch query={query} onQuery={setQuery} />}
          {library === 'lessons' && count > 5 && (
            <label className="ex-search">
              <Search />
              <input
                className="input"
                placeholder={uiText('Find a lesson')}
                aria-label={uiText('Find a lesson')}
                value={lessonQuery}
                onChange={(e) => setLessonQuery(e.target.value)}
              />
            </label>
          )}
        </div>
        <div className="study-library-content" key={library} role="region" aria-label={library === 'lessons' ? uiText('Lessons') : uiText('Exercises')}>
          {library === 'lessons' ? (
            <ul className="ex-list">
              {lessons.map((e) => (
                <EpisodeRow key={e.dir} episode={e} selected={path} />
              ))}
              {!lessons.length && <li className="ex-none faint">{uiText('No matching lessons.')}</li>}
            </ul>
          ) : hits ? (
            <ExerciseHits hits={hits} query={query} set={set} selected={path} />
          ) : set ? (
            <ul className="ex-list">
              <ExerciseRows set={set} selected={path} />
            </ul>
          ) : (
            <div className="study-library-empty">
              <ListChecks />
              <strong>{uiText('Practice what you learn')}</strong>
              <p>{uiText('Add exercises to this course. They’ll appear here, with written solutions and videos.')}</p>
            </div>
          )}
        </div>
        {set &&
          !set.paused &&
          (() => {
            const waiting = set.items.filter((i) => i.limitedUntil)
            if (!waiting.length) return null
            const agent = set.route?.agent ?? settings?.agent ?? 'claude'
            return (
              <LimitSwitch
                until={Math.min(...waiting.map((i) => i.limitedUntil!))}
                current={set.route ?? { agent, auth: configuredAuth(settings, agent) }}
                onSwitch={(to) => api.switchExercisesAgent(set.folder, to)}
              />
            )
          })()}
        <div className="ex-side-foot">
          {library === 'lessons' && series && !single ? (
            <button className="btn" onClick={() => setAdding(true)}>
              <Plus />
              {uiText('Add lesson')}
            </button>
          ) : library === 'exercises' && (set || (series && !single)) ? (
            <>
              <button className="btn" onClick={() => (set ? openDialog({ kind: 'add-exercises' }) : void addCourseExercises())}>
                <Plus />
                {uiText('Add exercises')}
              </button>
              {set && <ExerciseActions set={set} />}
            </>
          ) : null}
        </div>
      </aside>
      <main className="ex-main" data-tour="study-video">
        <div className="study-content">
          {item ? (
            <ExerciseMain key={item.dir} item={item} />
          ) : episode && path ? (
            <Watched dir={path} episode={episode} followUp={followUp} single={single} />
          ) : set && !series ? (
            <ExerciseEmpty set={set} />
          ) : (
            <div className="ex-empty faint">{uiText('Choose a lesson or an exercise.')}</div>
          )}
        </div>
      </main>
      <aside className="ex-chat study-assistant" data-tour="study-assistant">
        <div className="study-assistant-head">
          <Tabs
            label={uiText('Transcript or chat')}
            value={tab}
            onChange={(studyTab) => useStore.setState({ studyTab })}
            items={[
              {
                value: 'transcript',
                label: (
                  <>
                    <Captions />
                    {uiText('Transcript')}
                  </>
                ),
              },
              {
                value: 'chat',
                label: (
                  <>
                    <Sparkles />
                    {uiText('Chat')}
                  </>
                ),
              },
            ]}
          />
        </div>
        {!path ? (
          <div className="ex-empty faint">{uiText('Choose a lesson or an exercise.')}</div>
        ) : (
          <div className="study-assistant-body" key={path}>
            <div className={`study-panel ${tab === 'transcript' ? 'active' : ''}`} inert={tab !== 'transcript'} aria-hidden={tab !== 'transcript'}>
              <Transcript dir={path} version={version} />
            </div>
            <div className={`study-panel ${tab === 'chat' ? 'active' : ''}`} inert={tab !== 'chat'} aria-hidden={tab !== 'chat'}>
              <ChatPane embedded />
            </div>
          </div>
        )}
      </aside>
      {series && !single && <AddLessonDialog open={adding} onClose={() => setAdding(false)} series={series} />}
    </div>
  )
}
