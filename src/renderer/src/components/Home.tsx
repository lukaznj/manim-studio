import { t as uiText, localize, format } from '../lib/i18n'
import { ChevronLeft, Clapperboard, FolderOpen, FolderSearch, GraduationCap, Library, MoreHorizontal, Play, Plus, Trash2, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ExerciseSet, ProjectSummary } from '../../../shared/types'
import { api } from '../lib/api'
import { revealLabel } from '../lib/platform'
import { ago, timecode } from '../lib/time'
import {
  offerTour,
  studying,
  locateProject,
  openDialog,
  openExerciseSet,
  openProject,
  openWatch,
  pickAndOpenProject,
  refreshProjects,
  updateSettings,
  useStore,
} from '../store'
import { Modal, Tabs } from './ui'
import { SeriesTitle } from './SeriesTitle'
import { seriesStatus } from '../../../shared/series-presentation'

export function Home() {
  const [adding, setAdding] = useState(false)
  const all = useStore((s) => s.projects)
  const projects = useMemo(() => all.filter((p) => !p.exercise && !p.extra), [all]) // exercises show in their set's card, follow-ups under their episode
  const allSets = useStore((s) => s.exerciseSets)
  const sets = useMemo(() => allSets.filter((x) => !x.course), [allSets]) // a course's own set shows in its series' card
  const editing = useStore((s) => !studying(s)) // Learn: a library to watch, no editor (ADR 0029); Both has a tab for each
  const both = useStore((s) => s.settings?.mode === 'both')
  const claude = useStore((s) => s.claude)
  const signedOut = !!claude && !claude.loggedIn

  useEffect(() => offerTour('home'), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n' && !studying()) {
        e.preventDefault()
        openDialog({ kind: 'new-project' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const homeSeries = useStore((s) => s.homeSeries)
  const production = useStore((s) => s.seriesRuns.find((run) => run.folder === s.homeSeries))
  const items = homeItems(projects)
  const inSeries =
    (homeSeries && items.find((i): i is { folder: string; episodes: ProjectSummary[] } => 'episodes' in i && i.folder === homeSeries)?.episodes) || []

  return (
    <div className="home">
      <div className="home-inner">
        <header className="home-head">
          <div className="home-heading">
            {both && (
              <div className="home-mode-switch" data-tour="home-tabs">
                <Tabs
                  label={uiText('Create') + ' / ' + uiText('Learn')}
                  value={editing ? 'create' : 'learn'}
                  onChange={(tab) => {
                    useStore.setState({ homeSeries: null })
                    void updateSettings({ homeTab: tab })
                  }}
                  items={[
                    { value: 'create', label: <><Clapperboard />{uiText('Create')}</> },
                    { value: 'learn', label: <><GraduationCap />{uiText('Learn')}</> },
                  ]}
                />
              </div>
            )}
            <h1>{editing ? uiText('Projects') : uiText('Library')}</h1>
          </div>
          <div className="home-actions">
            <button className="btn primary" data-tour="home-add" aria-label={uiText('Add video, course or exercises')} onClick={() => setAdding(true)}>
              <Plus /><span>{uiText(editing ? 'Create' : 'Add')}</span>
            </button>
          </div>
        </header>

        {projects.length === 0 && !sets.length ? (
          <div className="library-empty" data-tour="home-library">
            <button className="library-add" aria-label={uiText('Add your first video, course or exercises')} onClick={() => setAdding(true)}>
              <Plus />
            </button>
            <p className="muted">{uiText('Add a video, course or exercise set')}</p>
          </div>
        ) : inSeries.length ? (
          <>
            <nav className="home-crumbs">
              <button className="link-btn" onClick={() => useStore.setState({ homeSeries: null })}>
                <ChevronLeft /> {uiText(' Projects')}
              </button>
              <span className="faint">/</span>
              <SeriesTitle folder={inSeries[0].series!.folder} title={inSeries[0].series!.title} />
              <span className="faint">{inSeries.length === 1 ? uiText('1 episode') : format('{0} episodes', [inSeries.length])}</span>
              <button
                className="btn small"
                onClick={() => void openWatch(inSeries[0].series!.folder)}
                title={uiText('Study the series: the videos, a transcript and a chat that knows where you are')}
              >
                {production?.folder === inSeries[0].series!.folder ? <><Clapperboard />{uiText('Production')}</> : <><Play />{uiText(' Watch')}</>}
              </button>
              <button className="btn small ghost" onClick={() => void api.reveal(inSeries[0].series!.folder)}>
                <FolderOpen /> {revealLabel}
              </button>
            </nav>
            <section className="project-grid" data-tour="home-library">
              {inSeries.map((p, i) => (
                <ProjectCard key={p.path} project={p} index={i} />
              ))}
            </section>
          </>
        ) : (
          <section className="project-grid" data-tour="home-library">
            {sets.map((set, i) => (
              <ExerciseSetCard key={set.folder} set={set} index={i} />
            ))}
            {items.map((item, i) =>
              'episodes' in item ? (
                <SeriesCard
                  key={item.folder}
                  folder={item.folder}
                  episodes={item.episodes}
                  exercises={allSets.find((x) => x.course === item.folder)?.items.length ?? 0}
                  index={i}
                />
              ) : (
                <ProjectCard key={item.path} project={item} index={i} />
              ),
            )}
          </section>
        )}
        <Modal open={adding} onClose={() => setAdding(false)} title={uiText('What would you like to make?')} width={560}>
          <div className="modal-body creation-choices">
            {signedOut && (
              <button
                className="btn ghost"
                onClick={() => {
                  setAdding(false)
                  openDialog({ kind: 'settings', tab: 'accounts' })
                }}
              >
                {uiText('Connect your AI agent to make videos')}
              </button>
            )}
            {[
              { kind: 'quick' as const, title: 'Quick video', text: 'Describe a topic and get a finished video.', icon: <Zap /> },
              {
                kind: 'series' as const,
                title: editing ? 'New series' : 'New course',
                text: 'Turn your material into a sequence of lessons.',
                icon: <Library />,
              },
              { kind: 'exercises' as const, title: 'Exercises', text: 'Get checked solutions and a video for each exercise.', icon: <GraduationCap /> },
              ...(editing
                ? [{ kind: 'new-project' as const, title: 'New project', text: 'Open the editor and build a video with your agent.', icon: <Plus /> }]
                : []),
            ].map((item) => (
              <button
                className="provider-card creation-choice"
                key={item.kind}
                onClick={() => {
                  setAdding(false)
                  openDialog({ kind: item.kind })
                }}
              >
                {item.icon}
                <strong>{localize(item.title)}</strong>
                <span className="hint">{localize(item.text)}</span>
              </button>
            ))}
            {editing && (
              <button
                className="btn ghost"
                onClick={() => {
                  setAdding(false)
                  void pickAndOpenProject()
                }}
              >
                <FolderOpen /> {uiText(' Open folder…')}
              </button>
            )}
          </div>
        </Modal>
      </div>
    </div>
  )
}

/**
 * Home's list: a series' episodes go into one folder card, where the series' most recently changed
 * episode would be; everything else stays a project card.
 */
function homeItems(projects: ProjectSummary[]): (ProjectSummary | { folder: string; episodes: ProjectSummary[] })[] {
  const items: (ProjectSummary | { folder: string; episodes: ProjectSummary[] })[] = []
  const folders = new Map<string, ProjectSummary[]>()
  for (const p of projects) {
    const folder = p.series?.folder
    if (!folder) items.push(p)
    else if (folders.has(folder)) folders.get(folder)!.push(p)
    else {
      folders.set(folder, [p])
      items.push({ folder, episodes: folders.get(folder)! })
    }
  }
  for (const episodes of folders.values()) episodes.sort((a, b) => a.series!.episode - b.series!.episode)
  return items
}

/** An exercise set on Home: how many exercises it has and whether its agents are at work. */
function ExerciseSetCard({ set, index }: { set: ExerciseSet; index: number }) {
  const done = set.items.filter((i) => i.state === 'done').length
  const working = !!set.intake || set.items.some((i) => ['solving', 'video', 'export'].includes(i.state))
  const open = () => void openExerciseSet(set.folder)
  return (
    <article
      className="project-card exercise-card"
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
      onClick={open}
      onKeyDown={(e) => e.key === 'Enter' && open()}
      tabIndex={0}
      aria-label={format('Exercise set {0}, {1} exercises', [set.title, set.items.length])}
    >
      <div className="thumb landscape exercise-thumb">
        <GraduationCap />
        <span className="mono">{set.items.length}</span>
      </div>
      <div className="project-meta">
        <div className="project-name">{set.title}</div>
        <div className="project-sub">
          <span className="badge sun">
            <GraduationCap /> {uiText(' Exercises')}
          </span>
          <span className="faint">{working ? uiText('Solving…') : format('{0} of {1} with a video', [done, set.items.length])}</span>
        </div>
      </div>
    </article>
  )
}

/** A series on Home: its first episodes' pictures stacked, the title and how many episodes it has. */
function SeriesCard({ folder, episodes, exercises, index }: { folder: string; episodes: ProjectSummary[]; exercises: number; index: number }) {
  const run = useStore((s) => s.seriesRuns.find((run) => run.folder === folder))
  const made = run?.episodes.filter((ep) => ep.state === 'done').length ?? 0
  const first = episodes[0]
  const cover = episodes.find((e) => e.thumbnail) ?? first
  const latest = Math.max(...episodes.map((e) => e.updatedAt))
  // Learn mode watches a series; Create opens its episodes to edit.
  const open = () => (run || studying() ? void openWatch(folder) : useStore.setState({ homeSeries: folder }))
  return (
    <article
      className="project-card series-card"
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
      onClick={open}
      onKeyDown={(e) => e.key === 'Enter' && open()}
      tabIndex={0}
      aria-label={format('Series {0}, {1} episodes', [first.series!.title, episodes.length])}
    >
      <div className={`thumb stack ${cover.aspect === '9:16' ? 'portrait' : 'landscape'} theme-${cover.theme}`}>
        {cover.thumbnail ? <img src={api.mediaUrl(cover.thumbnail)} alt="" draggable={false} /> : <div className="thumb-empty" />}
        {run && <span className={`series-card-status ${run.state}`}><Clapperboard />{uiText(seriesStatus(run))}<span className="series-card-count">{made}/{run.episodes.length}</span></span>}
      </div>
      <div className="project-meta">
        <div className="project-name">{first.series!.title}</div>
        <div className="project-sub">
          <span className="badge sun">
            <Library /> {uiText(' Series')}
          </span>
          <span className="faint">{episodes.length === 1 ? uiText('1 episode') : format('{0} episodes', [episodes.length])}</span>
          {exercises ? (
            <span className="faint">{exercises === 1 ? uiText('1 exercise') : format('{0} exercises', [exercises])}</span>
          ) : (
            <span className="faint project-ago">{ago(latest)}</span>
          )}
        </div>
      </div>
      {run && <progress className="series-card-progress" value={made} max={run.episodes.length} aria-label={uiText('Production')} />}
    </article>
  )
}

function ProjectCard({ project: p, index }: { project: ProjectSummary; index: number }) {
  const [menu, setMenu] = useState(false)
  const quick = useStore((s) => s.quickRuns.find((run) => run.project === p.path))
  const production = useStore((s) => s.seriesRuns.find((run) => run.folder === p.series?.folder))
  const unfinished = production?.folder === p.series?.folder && production?.episodes.some((ep) => ep.dir === p.path && ep.state !== 'done')
  const open = () => void (p.missing ? locateProject(p.path) : unfinished && p.series ? openWatch(p.series.folder, p.path) : openProject(p.path))
  return (
    <article
      className={`project-card ${p.missing ? 'missing' : ''}`}
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
      onClick={open}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && open()}
      tabIndex={0}
    >
      <div className={`thumb ${p.aspect === '9:16' ? 'portrait' : 'landscape'} theme-${p.theme}`}>
        {p.thumbnail ? <img src={api.mediaUrl(p.thumbnail)} alt="" draggable={false} /> : <div className="thumb-empty" />}
        {p.duration !== undefined && <span className="thumb-time mono">{timecode(p.duration, false)}</span>}
        {quick && quick.state !== 'done' && <span className="series-card-status quick-card-status">{quick.state === 'working' ? <span className="spinner" /> : <Zap />}{uiText(quick.state === 'working' ? 'Video in progress' : 'Continue video')}</span>}
      </div>
      <div className="project-meta">
        <div className="project-name">{p.name}</div>
        <div className="project-sub">
          {p.missing ? (
            <span className="badge coral" title={p.path}>
              {uiText('Folder not found')}
            </span>
          ) : (
            <>
              <span className="badge">{p.aspect}</span>
              {p.series && (
                <span className="badge sun">
                  {uiText('Episode ')}
                  {p.series.episode}
                </span>
              )}
              <span className="faint project-ago">{ago(p.updatedAt)}</span>
            </>
          )}
        </div>
      </div>
      {p.missing ? (
        <div className="missing-actions" onClick={(e) => e.stopPropagation()}>
          <button className="btn small" onClick={() => void locateProject(p.path)}>
            <FolderSearch /> {uiText(' Locate…')}
          </button>
          <button
            className="btn small ghost"
            title={uiText('Remove from list')}
            onClick={async () => {
              await api.forgetProject(p.path)
              void refreshProjects()
            }}
          >
            <Trash2 /> {uiText(' Remove')}
          </button>
        </div>
      ) : (
        <>
          <button
            className="icon-btn card-menu"
            onClick={(e) => {
              e.stopPropagation()
              setMenu((m) => !m)
            }}
            aria-label={uiText('More')}
          >
            <MoreHorizontal />
          </button>
          {menu && (
            <div className="menu" onMouseLeave={() => setMenu(false)} onClick={(e) => e.stopPropagation()}>
              <button onClick={() => void api.reveal(p.path)}>
                <FolderOpen /> {uiText(' Show in folder')}
              </button>
              <button
                onClick={async () => {
                  await api.forgetProject(p.path)
                  void refreshProjects()
                }}
              >
                <Trash2 /> {uiText(' Remove from list')}
              </button>
            </div>
          )}
        </>
      )}
    </article>
  )
}
