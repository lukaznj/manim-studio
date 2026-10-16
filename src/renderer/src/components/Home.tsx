import {
  Check,
  ChevronLeft,
  CircleAlert,
  FolderOpen,
  FolderSearch,
  GraduationCap,
  Library,
  MoreHorizontal,
  Play,
  Plus,
  Sigma,
  Sparkles,
  Terminal,
  Trash2,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ComponentState, ExerciseSet, ProjectSummary } from '../../../shared/types'
import { api } from '../lib/api'
import { revealLabel } from '../lib/platform'
import { ago, timecode } from '../lib/time'
import {
  canEdit,
  installComponent,
  locateProject,
  openDialog,
  openExerciseSet,
  openProject,
  openWatch,
  pickAndOpenProject,
  refreshClaude,
  refreshProjects,
  toast,
  errorText,
  useStore,
} from '../store'
import { ProgressLine } from './ui'
import { SeriesPanel } from './SeriesPanel'

export function Home() {
  const all = useStore((s) => s.projects)
  const projects = useMemo(() => all.filter((p) => !p.exercise && !p.extra), [all]) // exercises show in their set's card, follow-ups under their episode
  const allSets = useStore((s) => s.exerciseSets)
  const sets = useMemo(() => allSets.filter((x) => !x.course), [allSets]) // a course's own set shows in its series' card
  const editing = useStore((s) => canEdit(s)) // Learn mode: a library to watch, no editor (ADR 0029)
  const setup = useStore((s) => s.setup)
  const claude = useStore((s) => s.claude)
  const needsSetup = !!setup && (setup.env !== 'ready' || setup.latex !== 'ready' || (claude && !claude.loggedIn))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n' && canEdit()) {
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
            <h1>{editing ? 'Projects' : 'Library'}</h1>
            <p className="muted">
              {editing
                ? 'Each project is one video: a scene in code, its voice and its subtitles.'
                : 'Your courses, exercises and videos, to watch and ask about.'}
            </p>
          </div>
          <div className="home-actions">
            {editing && (
              <button className="btn ghost" onClick={() => void pickAndOpenProject()}>
                <FolderOpen /> Open folder…
              </button>
            )}
            <button className="btn large" onClick={() => openDialog({ kind: 'exercises' })} title="Exercises in, worked solutions and short videos out">
              <GraduationCap /> Exercises
            </button>
            <button className="btn large" onClick={() => openDialog({ kind: 'series' })} title="A series of videos from a course's PDFs">
              <Library /> {editing ? 'New series' : 'New course'}
            </button>
            <button className="btn large" onClick={() => openDialog({ kind: 'quick' })} title="Describe it, attach PDFs, and Studio makes and exports it">
              <Zap /> Quick video
            </button>
            {editing && (
              <button className="btn primary large" onClick={() => openDialog({ kind: 'new-project' })}>
                <Plus /> New project
              </button>
            )}
          </div>
        </header>

        {needsSetup && <SetupPanel />}
        <SeriesPanel />

        {projects.length === 0 && !sets.length ? (
          <EmptyState />
        ) : inSeries.length ? (
          <>
            <nav className="home-crumbs">
              <button className="link-btn" onClick={() => useStore.setState({ homeSeries: null })}>
                <ChevronLeft /> Projects
              </button>
              <span className="faint">/</span>
              <strong>{inSeries[0].series!.title}</strong>
              <span className="faint">{inSeries.length === 1 ? '1 episode' : `${inSeries.length} episodes`}</span>
              <button
                className="btn small"
                onClick={() => void openWatch(inSeries[0].series!.folder)}
                title="Study the series: the videos, a transcript and a chat that knows where you are"
              >
                <Play /> Watch
              </button>
              <button className="btn small ghost" onClick={() => void api.reveal(inSeries[0].series!.folder)}>
                <FolderOpen /> {revealLabel}
              </button>
            </nav>
            <section className="project-grid">
              {inSeries.map((p, i) => (
                <ProjectCard key={p.path} project={p} index={i} />
              ))}
            </section>
          </>
        ) : (
          <section className="project-grid">
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
      aria-label={`Exercise set ${set.title}, ${set.items.length} exercises`}
    >
      <div className="thumb landscape exercise-thumb">
        <GraduationCap />
        <span className="mono">{set.items.length}</span>
      </div>
      <div className="project-meta">
        <div className="project-name">{set.title}</div>
        <div className="project-sub">
          <span className="badge sun">
            <GraduationCap /> Exercises
          </span>
          <span className="faint">{working ? 'Solving…' : `${done} of ${set.items.length} with a video`}</span>
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
  const open = () => (canEdit() ? useStore.setState({ homeSeries: folder }) : void openWatch(folder))
  return (
    <article
      className="project-card series-card"
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
      onClick={open}
      onKeyDown={(e) => e.key === 'Enter' && open()}
      tabIndex={0}
      aria-label={`Series ${first.series!.title}, ${episodes.length} episodes`}
    >
      <div className={`thumb stack ${cover.aspect === '9:16' ? 'portrait' : 'landscape'} theme-${cover.theme}`}>
        {cover.thumbnail ? <img src={api.mediaUrl(cover.thumbnail)} alt="" draggable={false} /> : <div className="thumb-empty" />}
      </div>
      <div className="project-meta">
        <div className="project-name">{first.series!.title}</div>
        <div className="project-sub">
          <span className="badge sun">
            <Library /> Series
          </span>
          <span className="faint">{episodes.length === 1 ? '1 episode' : `${episodes.length} episodes`}</span>
          {exercises ? (
            <span className="faint">{exercises === 1 ? '1 exercise' : `${exercises} exercises`}</span>
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
              Folder not found
            </span>
          ) : (
            <>
              <span className="badge">{p.aspect}</span>
              {p.series && <span className="badge sun">Episode {p.series.episode}</span>}
              <span className="faint project-ago">{ago(p.updatedAt)}</span>
            </>
          )}
        </div>
      </div>
      {p.missing ? (
        <div className="missing-actions" onClick={(e) => e.stopPropagation()}>
          <button className="btn small" onClick={() => void locateProject(p.path)}>
            <FolderSearch /> Locate…
          </button>
          <button
            className="btn small ghost"
            title="Remove from list"
            onClick={async () => {
              await api.forgetProject(p.path)
              void refreshProjects()
            }}
          >
            <Trash2 /> Remove
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
            aria-label="More"
          >
            <MoreHorizontal />
          </button>
          {menu && (
            <div className="menu" onMouseLeave={() => setMenu(false)} onClick={(e) => e.stopPropagation()}>
              <button onClick={() => void api.reveal(p.path)}>
                <FolderOpen /> Show in folder
              </button>
              <button
                onClick={async () => {
                  await api.forgetProject(p.path)
                  void refreshProjects()
                }}
              >
                <Trash2 /> Remove from list
              </button>
            </div>
          )}
        </>
      )}
    </article>
  )
}

function EmptyState() {
  return (
    <div className="empty">
      <svg viewBox="0 0 200 120" className="empty-art" aria-hidden>
        <line x1="10" y1="100" x2="190" y2="100" stroke="var(--line-strong)" strokeWidth="1.5" />
        <line x1="100" y1="10" x2="100" y2="110" stroke="var(--line-strong)" strokeWidth="1.5" />
        <path d="M54 22 Q93.1 154.6 132.2 61.8" fill="none" stroke="var(--sun)" strokeWidth="3" strokeLinecap="round" className="draw" />
        <circle cx="132.2" cy="61.8" r="6" fill="var(--blue)" className="pop" />
      </svg>
      {canEdit() ? (
        <>
          <h2>Every video starts with an empty scene</h2>
          <p className="muted">Pick a format, describe what to show, and Claude writes the animation, the narration and the subtitles with you.</p>
        </>
      ) : (
        <>
          <h2>Learn anything with a video made for you</h2>
          <p className="muted">Describe a topic, add your notes or exercises, and Claude makes explained videos you can watch and ask about.</p>
        </>
      )}
      {canEdit() ? (
        <button className="btn primary large" onClick={() => openDialog({ kind: 'new-project' })}>
          <Plus /> New project
        </button>
      ) : (
        <button className="btn primary large" onClick={() => openDialog({ kind: 'quick' })}>
          <Zap /> Make a video to learn from
        </button>
      )}
    </div>
  )
}

const STATE_LABEL: Record<ComponentState, string> = {
  missing: 'Not installed',
  installing: 'Installing…',
  ready: 'Ready',
  outdated: 'Needs an update',
  unsupported: 'Not supported',
  error: 'Failed',
}

function SetupPanel() {
  const setup = useStore((s) => s.setup)!
  const claude = useStore((s) => s.claude)
  const log = useStore((s) => s.setupLog)
  const progress = useStore((s) => s.setupProgress)
  const [loggingIn, setLoggingIn] = useState(false)

  const login = async () => {
    setLoggingIn(true)
    try {
      await api.claudeLogin()
      await refreshClaude()
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setLoggingIn(false)
    }
  }

  const steps = [
    {
      id: 'env' as const,
      icon: <Terminal />,
      title: 'Manim environment',
      text: 'Python, manim and voice tools, installed into the app’s own folder. About 750 MB.',
      state: setup.env,
      action: () => void installComponent('env'),
    },
    {
      id: 'latex' as const,
      icon: <Sigma />,
      title: 'LaTeX for formulas',
      text: 'Needed for MathTex: TinyTeX with the packages manim uses. About 250 MB.',
      state: setup.latex,
      action: () => void installComponent('latex'),
    },
  ]

  return (
    <section className="setup">
      <div className="setup-head">
        <span className="eyebrow">First run</span>
        <h2>Set up this computer for rendering</h2>
      </div>
      <ol className="setup-steps">
        {steps.map((s) => (
          <li key={s.id} className={`setup-step state-${s.state}`}>
            <span className="step-icon">{s.state === 'ready' ? <Check /> : s.state === 'error' ? <CircleAlert /> : s.icon}</span>
            <div className="step-body">
              <div className="step-title">
                {s.title} <span className="faint">· {STATE_LABEL[s.state]}</span>
              </div>
              <div className="hint">{s.state === 'installing' || s.state === 'error' ? (log[s.id]?.at(-1) ?? s.text) : s.text}</div>
              {s.state === 'installing' && <ProgressLine value={progress[s.id]} />}
            </div>
            {s.state !== 'ready' && s.state !== 'installing' && (
              <button className="btn" onClick={s.action}>
                {s.state === 'outdated' ? 'Update' : s.state === 'error' ? 'Try again' : 'Install'}
              </button>
            )}
          </li>
        ))}
        <li className={`setup-step state-${claude?.loggedIn ? 'ready' : 'missing'}`}>
          <span className="step-icon">{claude?.loggedIn ? <Check /> : <Sparkles />}</span>
          <div className="step-body">
            <div className="step-title">
              Claude <span className="faint">· {claude?.loggedIn ? (claude.email ?? claude.subscription ?? 'Signed in') : 'Not signed in'}</span>
            </div>
            <div className="hint">
              {loggingIn
                ? 'Finish signing in in the browser window that opened.'
                : 'Studio runs Claude Code with your own Claude account. Sign-in happens in your browser; usage counts against your plan.'}
            </div>
          </div>
          {!claude?.loggedIn && (
            <button className="btn" disabled={loggingIn} onClick={() => void login()}>
              {loggingIn ? <span className="spinner" /> : null} Sign in
            </button>
          )}
        </li>
      </ol>
    </section>
  )
}
