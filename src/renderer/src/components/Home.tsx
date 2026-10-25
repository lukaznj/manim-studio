import { t as uiText, localize, format } from '../lib/i18n'
import { ChevronLeft, FolderOpen, FolderSearch, GraduationCap, Library, MoreHorizontal, Pencil, Play, Plus, Trash2, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  errorText,
  toast,
  updateSettings,
  useStore,
} from '../store'
import { Modal, Tabs } from './ui'
import { SeriesPanel } from './SeriesPanel'

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
  const items = homeItems(projects)
  const inSeries =
    (homeSeries && items.find((i): i is { folder: string; episodes: ProjectSummary[] } => 'episodes' in i && i.folder === homeSeries)?.episodes) || []

  return (
    <div className="home">
      <div className="home-inner">
        <header className="home-head">
          <div>
            {both ? (
              <div data-tour="home-tabs">
                <Tabs
                  value={editing ? 'create' : 'learn'}
                  onChange={(tab) => {
                    useStore.setState({ homeSeries: null })
                    void updateSettings({ homeTab: tab })
                  }}
                  items={[
                    { value: 'create', label: 'Create' },
                    { value: 'learn', label: 'Learn' },
                  ]}
                />
              </div>
            ) : (
              <h1>{editing ? uiText('Projects') : uiText('Library')}</h1>
            )}
            <p className="muted">
              {editing
                ? uiText('Each project is one video: a scene in code, its voice and its subtitles.')
                : uiText('Your courses, exercises and videos, to watch and ask about.')}
            </p>
          </div>
          <div className="home-actions">
            <button className="btn primary" data-tour="home-add" aria-label={uiText('Add video, course or exercises')} onClick={() => setAdding(true)}>
              <Plus />
            </button>
          </div>
        </header>

        <SeriesPanel />

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
                <Play /> {uiText(' Watch')}
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
  const first = episodes[0]
  const cover = episodes.find((e) => e.thumbnail) ?? first
  const latest = Math.max(...episodes.map((e) => e.updatedAt))
  // Learn mode watches a series; Create opens its episodes to edit.
  const open = () => (!studying() ? useStore.setState({ homeSeries: folder }) : void openWatch(folder))
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
    </article>
  )
}

function ProjectCard({ project: p, index }: { project: ProjectSummary; index: number }) {
  const [menu, setMenu] = useState(false)
  return (
    <article
      className={`project-card ${p.missing ? 'missing' : ''}`}
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
      onClick={() => void (p.missing ? locateProject(p.path) : openProject(p.path))}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && void (p.missing ? locateProject(p.path) : openProject(p.path))}
      tabIndex={0}
    >
      <div className={`thumb ${p.aspect === '9:16' ? 'portrait' : 'landscape'} theme-${p.theme}`}>
        {p.thumbnail ? <img src={api.mediaUrl(p.thumbnail)} alt="" draggable={false} /> : <div className="thumb-empty" />}
        {p.duration !== undefined && <span className="thumb-time mono">{timecode(p.duration, false)}</span>}
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

/** A series' title in its folder view; the pencil turns it into a field (Enter saves, Escape cancels). */
function SeriesTitle({ folder, title }: { folder: string; title: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const cancelled = useRef(false) // Escape: the field's blur mustn't save
  const save = async () => {
    const name = draft?.trim()
    setDraft(null)
    if (cancelled.current || !name || name === title) return
    try {
      await api.renameSeries(folder, name)
      await refreshProjects()
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }
  if (draft === null)
    return (
      <>
        <strong>{title}</strong>
        <button
          className="icon-btn"
          onClick={() => {
            cancelled.current = false
            setDraft(title)
          }}
          aria-label={uiText('Rename series')}
          title={uiText('Rename series')}
        >
          <Pencil />
        </button>
      </>
    )
  return (
    <input
      className="input series-rename"
      autoFocus
      aria-label={uiText('Series title')}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => void save()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          cancelled.current = true
          setDraft(null)
        }
      }}
    />
  )
}
