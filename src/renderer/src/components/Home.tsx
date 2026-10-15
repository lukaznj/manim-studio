import { Check, ChevronLeft, CircleAlert, FolderOpen, Library, MoreHorizontal, Plus, Sigma, Sparkles, Terminal, Trash2, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ComponentState, ProjectSummary } from '../../../shared/types'
import { api } from '../lib/api'
import { revealLabel } from '../lib/platform'
import { ago, timecode } from '../lib/time'
import { installComponent, openDialog, openProject, pickAndOpenProject, refreshClaude, refreshProjects, toast, errorText, useStore } from '../store'
import { ProgressLine } from './ui'
import { SeriesPanel } from './SeriesPanel'

export function Home() {
  const projects = useStore((s) => s.projects)
  const setup = useStore((s) => s.setup)
  const claude = useStore((s) => s.claude)
  const needsSetup = !!setup && (setup.env !== 'ready' || setup.latex !== 'ready' || (claude && !claude.loggedIn))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
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
            <h1>Projects</h1>
            <p className="muted">Each project is one video: a scene in code, its voice and its subtitles.</p>
          </div>
          <div className="home-actions">
            <button className="btn ghost" onClick={() => void pickAndOpenProject()}>
              <FolderOpen /> Open folder…
            </button>
            <button className="btn large" onClick={() => openDialog({ kind: 'series' })} title="A series of videos from a course's PDFs">
              <Library /> New series
            </button>
            <button className="btn large" onClick={() => openDialog({ kind: 'quick' })} title="Describe it, attach PDFs, and Studio makes and exports it">
              <Zap /> Quick video
            </button>
            <button className="btn primary large" onClick={() => openDialog({ kind: 'new-project' })}>
              <Plus /> New project
            </button>
          </div>
        </header>

        {needsSetup && <SetupPanel />}
        <SeriesPanel />

        {projects.length === 0 ? (
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
            {items.map((item, i) =>
              'episodes' in item ? (
                <SeriesCard key={item.folder} folder={item.folder} episodes={item.episodes} index={i} />
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

/** A series on Home: its first episodes' pictures stacked, the title and how many episodes it has. */
function SeriesCard({ folder, episodes, index }: { folder: string; episodes: ProjectSummary[]; index: number }) {
  const first = episodes[0]
  const cover = episodes.find((e) => e.thumbnail) ?? first
  const latest = Math.max(...episodes.map((e) => e.updatedAt))
  const open = () => useStore.setState({ homeSeries: folder })
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
          <span className="faint project-ago">{ago(latest)}</span>
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
      onClick={() => !p.missing && void openProject(p.path)}
      onKeyDown={(e) => e.key === 'Enter' && !p.missing && void openProject(p.path)}
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
            <span className="badge coral">Folder not found</span>
          ) : (
            <>
              <span className="badge">{p.aspect}</span>
              {p.series && <span className="badge sun">Episode {p.series.episode}</span>}
              <span className="faint project-ago">{ago(p.updatedAt)}</span>
            </>
          )}
        </div>
      </div>
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
          {!p.missing && (
            <button onClick={() => void api.reveal(p.path)}>
              <FolderOpen /> Show in folder
            </button>
          )}
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
      <h2>Every video starts with an empty scene</h2>
      <p className="muted">Pick a format, describe what to show, and Claude writes the animation, the narration and the subtitles with you.</p>
      <button className="btn primary large" onClick={() => openDialog({ kind: 'new-project' })}>
        <Plus /> New project
      </button>
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
