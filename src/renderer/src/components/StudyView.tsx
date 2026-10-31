import { StudyNotes } from './StudyNotes'
import { t as uiText, format } from '../lib/i18n'
import { BookOpen, Captions, ListChecks, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, Search, Sparkles } from 'lucide-react'
import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react'
import { addCourseExercises, offerTour, openDialog, selectStudied, updateSettings, useStore } from '../store'
import { ChatPane } from './ChatPane'
import { AddLessonDialog } from './AddLessonDialog'
import { ExerciseActions, ExerciseEmpty, ExerciseHits, ExerciseMain, ExerciseRows, ExerciseSearch, useExerciseHits } from './ExerciseView'
import { EpisodeRow, Watched } from './LessonView'
import { findInTranscript, Transcript } from './Transcript'
import { Tabs } from './ui'
import { configuredAuth, LimitSwitch } from './LimitSwitch'
import { api } from '../lib/api'
import { lessonIsBuilding, productionVisible } from '../../../shared/series-presentation'
import { EpisodeProduction, LessonProduction, ProductionNavigation, SeriesOverview } from './SeriesProduction'
import { showSeriesProduction } from '../store'
import { SeriesTitle } from './SeriesTitle'
import { useStudyFullscreen } from '../lib/study-fullscreen'
import { useStudyLayout } from '../lib/study-layout'
import { studyLibraryNeeded } from '../../../shared/study-navigation'

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
  const fullscreen = useStudyFullscreen()
  const fullscreenChat = useStore((s) => s.studyFullscreenChat)
  const libraryNeeded = studyLibraryNeeded(series, set)
  const layout = useStudyLayout(settings, fullscreen, libraryNeeded)
  const leftCollapsed = libraryNeeded && !!settings?.studyLibraryCollapsed
  const rightCollapsed = fullscreen ? !fullscreenChat : !!settings?.studyAssistantCollapsed
  const togglePanel = async (side: 'library' | 'assistant', collapsed: boolean) => {
    if (side === 'assistant' && fullscreen) useStore.setState({ studyFullscreenChat: !collapsed })
    else await updateSettings(side === 'library' ? { studyLibraryCollapsed: collapsed } : { studyAssistantCollapsed: collapsed })
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(fullscreen && collapsed ? '.study-fullscreen-chat' : `.study-${side}-${collapsed ? 'show' : 'hide'}`)?.focus())
  }
  const activeRun = useStore((s) => s.seriesRuns.find((run) => run.folder === s.watchSeries?.folder))
  const overview = useStore((s) => s.studyProduction)
  const production = series && (activeRun?.folder === series.folder ? activeRun : series.production)
  const showProduction = !!production && productionVisible(production, !!settings?.developerMode)
  useEffect(() => {
    if (overview && production && !showProduction) {
      const dir = path && series?.episodes.some((ep) => ep.dir === path || ep.followUps.some((extra) => extra.dir === path)) ? path : series?.episodes[0]?.dir
      if (dir) void selectStudied(dir)
      else useStore.setState({ studyProduction: false })
    }
  }, [overview, production, showProduction, path])
  useEffect(() => {
    setLibrary(overview && production ? 'lessons' : item || !series ? 'exercises' : 'lessons')
  }, [path, series?.folder, set?.folder, overview])
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
  useEffect(() => {
    if (!fullscreen) useStore.setState({ studyFullscreenChat: false })
  }, [fullscreen])
  useLayoutEffect(() => {
    // A chat creation result can navigate to an unfinished video or exercise set.
    if (fullscreen && !layout.ref.current?.querySelector('.study-player')) void document.exitFullscreen().catch(() => undefined)
  })
  if (!series && !set) return null
  const single = !!series && series.episodes.length === 1 && series.episodes[0].dir === series.folder
  const episode = series?.episodes.find((e) => e.dir === path || e.followUps.some((f) => f.dir === path))
  const followUp = episode?.followUps.find((f) => f.dir === path)
  const producing = !followUp ? production?.episodes.find((ep) => ep.dir === path) : undefined
  const pending = !item && !!episode && lessonIsBuilding(producing, followUp?.state ?? episode.state)
  const productionView = (!!overview && showProduction) || pending
  const version = item ? `${item.state}:${item.video ?? ''}` : `${episode?.video ?? ''}:${followUp?.state ?? ''}`
  const watched = series?.episodes.filter((e) => e.watched).length ?? 0
  const count = series?.episodes.length ?? 0
  const lessons =
    series?.episodes.filter((e) => `${e.title} ${e.followUps.map((f) => `${f.title} ${f.request}`).join(' ')}`.toLocaleLowerCase().includes(lessonQuery.toLocaleLowerCase())) ??
    []

  return (
    <div ref={layout.ref} className={`ex-view study-view ${productionView ? 'production-view' : ''} ${!libraryNeeded ? 'library-unneeded' : ''} ${leftCollapsed ? 'library-collapsed' : ''} ${rightCollapsed ? 'assistant-collapsed' : ''}`}
      style={{ '--study-assistant-width': `${layout.width}px` } as CSSProperties}>
      {leftCollapsed && !fullscreen && <button className="icon-btn study-panel-restore study-library-show" title={uiText('Show library')} aria-label={uiText('Show library')} aria-expanded={false} aria-controls="study-library" onClick={() => void togglePanel('library', false)}><PanelLeftOpen /></button>}
      <aside className="ex-side" data-tour="study-library" id="study-library" inert={!libraryNeeded || leftCollapsed || fullscreen} aria-hidden={!libraryNeeded || leftCollapsed || fullscreen}>
        <div className="study-library-inner">
          <div className="ex-side-head">
            <div className="study-library-heading"><span className="eyebrow">{series && !single ? uiText('Your course') : uiText('Your library')}</span><button className="icon-btn study-library-hide" title={uiText('Hide library')} aria-label={uiText('Hide library')} aria-expanded={true} aria-controls="study-library" onClick={() => void togglePanel('library', true)}><PanelLeftClose /></button></div>
            <h2 className="ex-set-title study-course-title">{series && series.folder !== series.episodes[0]?.dir ? <SeriesTitle folder={series.folder} title={production?.title ?? series.title} /> : series?.title ?? set!.title}</h2>
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
            {production && showProduction && <ProductionNavigation run={production} selected={!!overview} onClick={() => { setLibrary('lessons'); showSeriesProduction() }} />}
            {series && (!single || !!series.exercises || !!set) ? (
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
                  <EpisodeRow key={e.dir} episode={e} selected={overview ? undefined : path} run={production ?? undefined} />
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
        </div>
      </aside>
      <main className="ex-main" data-tour={productionView ? 'study-production' : 'study-video'}>
        <div className="study-content">
          {overview && production && showProduction ? (
            <SeriesOverview run={production} />
          ) : pending && producing && production ? (
            <EpisodeProduction run={production} episode={producing} number={episode!.number} />
          ) : pending && episode && path ? (
            <LessonProduction dir={path} episode={episode} followUp={followUp} />
          ) : item ? (
            <><ExerciseMain key={item.dir} item={item} /><div className="study-exercise-notes"><StudyNotes key={item.dir} dir={item.dir} /></div></>
          ) : episode && path ? (
            <Watched dir={path} episode={episode} followUp={followUp} single={single} />
          ) : set && !series ? (
            <ExerciseEmpty set={set} />
          ) : (
            <div className="ex-empty faint">{uiText('Choose a lesson or an exercise.')}</div>
          )}
        </div>
      </main>
      {!productionView && <>
        {rightCollapsed ? !fullscreen && <button className="icon-btn study-panel-restore study-assistant-show" title={uiText('Show assistant')} aria-label={uiText('Show assistant')} aria-expanded={false} aria-controls="study-assistant" onClick={() => void togglePanel('assistant', false)}><PanelRightOpen /></button> : <div className="study-assistant-splitter" role="separator" tabIndex={0} aria-label={uiText('Resize assistant')} aria-orientation="vertical" aria-controls="study-assistant" aria-valuemin={layout.min} aria-valuemax={layout.max} aria-valuenow={layout.width} {...layout.splitter} />}
        <aside className="ex-chat study-assistant" data-tour="study-assistant" id="study-assistant" inert={rightCollapsed} aria-hidden={rightCollapsed}>
        <div className="study-assistant-inner">
          <div className="study-assistant-head">
            <button className="icon-btn study-assistant-hide" title={uiText('Hide assistant')} aria-label={uiText('Hide assistant')} aria-expanded={true} aria-controls="study-assistant" onClick={() => void togglePanel('assistant', true)}><PanelRightClose /></button>
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
        </div>
      </aside></>}
      {series && !single && <AddLessonDialog open={adding} onClose={() => setAdding(false)} series={series} />}
    </div>
  )
}
