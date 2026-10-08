import { Check, CircleAlert, FolderOpen, MoreHorizontal, Plus, Sigma, Sparkles, Terminal, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ComponentState, ProjectSummary } from '../../../shared/types'
import { api } from '../lib/api'
import { ago, timecode } from '../lib/time'
import { installComponent, openDialog, openProject, refreshClaude, refreshProjects, toast, errorText, useStore } from '../store'
import { ProgressLine } from './ui'

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

  const openFolder = async () => {
    try {
      const dir = await api.pickProject()
      if (dir) await openProject(dir)
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  return (
    <div className="home">
      <div className="home-inner">
        <header className="home-head">
          <div>
            <h1>Projects</h1>
            <p className="muted">Each project is one video: a scene in code, its voice and its subtitles.</p>
          </div>
          <div className="home-actions">
            <button className="btn ghost" onClick={() => void openFolder()}>
              <FolderOpen /> Open folder…
            </button>
            <button className="btn primary large" onClick={() => openDialog({ kind: 'new-project' })}>
              <Plus /> New project
            </button>
          </div>
        </header>

        {needsSetup && <SetupPanel />}

        {projects.length === 0 ? (
          <EmptyState />
        ) : (
          <section className="project-grid">
            {projects.map((p, i) => (
              <ProjectCard key={p.path} project={p} index={i} />
            ))}
          </section>
        )}
      </div>
    </div>
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
              <span className="faint">{ago(p.updatedAt)}</span>
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
              Claude <span className="faint">· {claude?.loggedIn ? claude.email ?? claude.subscription ?? 'Signed in' : 'Not signed in'}</span>
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
