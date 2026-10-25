import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  BookOpen,
  Check,
  CircleAlert,
  Clapperboard,
  Cpu,
  ExternalLink,
  GraduationCap,
  KeyRound,
  Layers,
  MessageCircleQuestion,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Agent, AppMode, ClaudeStatus, Component, ComponentState, SetupStatus, VoiceSettings } from '../../../shared/types'
import { DEFAULT_EL_MODEL } from '../../../shared/voice'
import { api } from '../lib/api'
import { format, t } from '../lib/i18n'
import { LANGUAGES, languageName } from '../lib/languages'
import { errorText, installComponent, openDialog, refreshClaude, refreshProjects, switchMode, updateSettings, useStore } from '../store'
import { ProjectsFolderStep } from './ProjectsFolderStep'
import { ElevenLabsStatus } from './SettingsDialog'
import { ProgressLine } from './ui'
import { VoicePicker } from './VoicePicker'

/**
 * First launch (ADR 0044): a guided, full-window walk through what Manim Studio is and everything
 * it needs, one decision per page. It replaces Home until a mode is chosen. Every step saves as it
 * goes, so quitting halfway loses nothing; optional steps can be left for later.
 */
const STEPS = ['welcome', 'how', 'mode', 'install', 'folder', 'agent', 'connect', 'voice', 'done'] as const
type Step = (typeof STEPS)[number]

const AGENTS: { id: Agent; name: string; maker: string; plan: string; key: string; keyUrl: string; keyPlace: string }[] = [
  {
    id: 'claude',
    name: 'Claude',
    maker: 'Anthropic',
    plan: 'Works with a Claude Pro or Max plan.',
    key: 'Anthropic API key',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPlace: 'sk-ant-…',
  },
  {
    id: 'codex',
    name: 'Codex',
    maker: 'OpenAI',
    plan: 'Works with a ChatGPT Plus or Pro plan.',
    key: 'OpenAI API key',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPlace: 'sk-…',
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    maker: 'Google',
    plan: 'Works with a Google AI plan, with Gemini 4 Argon.',
    key: 'Gemini API key',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyPlace: 'AIza…',
  },
]

export function Onboarding() {
  const settings = useStore((s) => s.settings)!
  const [at, setAt] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const [mode, setMode] = useState<AppMode>('learn')
  const [folder, setFolder] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const step = STEPS[at]

  const go = (to: number) => {
    setError('')
    setDir(to > at ? 1 : -1)
    setAt(to)
  }
  const next = async () => {
    setBusy(true)
    setError('')
    try {
      if (step === 'mode') startInstalls(mode)
      if (step === 'folder' && folder) {
        useStore.setState({ settings: await api.useProjectsFolder(folder) })
        await refreshProjects()
      }
      if (step === 'done') return void (requiredReady(useStore.getState().setup) && (await finish()))
      go(at + 1)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const finish = async (then?: () => void) => {
    await updateSettings({ onboardingDone: true })
    await switchMode(mode)
    then?.()
  }

  // Enter continues, like a phone's "Next"; not while typing in a field.
  const nextRef = useRef(next)
  nextRef.current = next
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest('input, textarea, select')
      if (e.key === 'Enter' && !typing && !e.metaKey && !e.ctrlKey) void nextRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const setup = useStore((s) => s.setup)
  const connected = useStore((s) => !!s.claude?.loggedIn)
  const voiced = settings.defaultVoice.provider === 'elevenlabs' ? !!settings.hasElevenLabsKey : setup?.omnivoice === 'ready'
  const optional = (step === 'connect' && !connected) || (step === 'voice' && !voiced)
  const waiting = step === 'done' && !requiredReady(setup)
  const art: Step = waiting ? 'install' : step // while the last page waits, the stage shows the install
  const allSet = connected && voiced && requiredReady(setup) // the done page's own button is then the main action
  return (
    <div className="onb">
      <aside className="onb-stage" aria-hidden>
        <div className="onb-stage-grid" />
        <div className="onb-art" key={art + (step === 'mode' ? mode : '')}>
          <Art step={art} mode={mode} />
        </div>
        <p className="onb-stage-caption">{t(CAPTIONS[art])}</p>
      </aside>

      <section className="onb-main">
        <header className="onb-top">
          <div className="onb-dots" aria-label={format('Step {0} of {1}', [at + 1, STEPS.length])}>
            {STEPS.map((s, i) => (
              <span key={s} className={i < at ? 'done' : i === at ? 'on' : ''} />
            ))}
          </div>
          {step === 'welcome' && <LanguageSwitch />}
        </header>

        <div className="onb-scroll">
          <div className={`onb-page ${dir > 0 ? 'fwd' : 'back'}`} key={step}>
            {step === 'welcome' && <Welcome />}
            {step === 'how' && <How />}
            {step === 'mode' && <ModePage mode={mode} onChange={setMode} />}
            {step === 'install' && <InstallPage mode={mode} />}
            {step === 'folder' && <FolderPage folder={folder} onChange={setFolder} />}
            {step === 'agent' && <AgentPage />}
            {step === 'connect' && <ConnectPage agent={settings.agent} />}
            {step === 'voice' && <VoicePage />}
            {step === 'done' && (
              <DonePage mode={mode} onFirstVideo={() => void finish(() => openDialog({ kind: 'quick' }))} onFix={(s) => go(STEPS.indexOf(s))} />
            )}
            {error && (
              <p className="onb-error" role="alert">
                <CircleAlert /> {error}
              </p>
            )}
          </div>
        </div>

        <footer className="onb-foot">
          {at > 0 ? (
            <button className="onb-btn ghost" disabled={busy} onClick={() => go(at - 1)}>
              <ArrowLeft /> {t('Back')}
            </button>
          ) : (
            <span />
          )}
          <div className="onb-foot-end">
            {optional && (
              <button className={step === 'connect' ? 'onb-btn' : 'onb-link'} disabled={busy} onClick={() => go(at + 1)}>
                {t('Set up later')}
              </button>
            )}
            {/* Signing in is the page's own action; until it's done, the only way on is to skip. */}
            {!(optional && step === 'connect') && (
              <button className={`onb-btn ${step === 'done' && allSet ? '' : 'primary'}`} disabled={busy || waiting} onClick={() => void next()}>
                {step === 'welcome' ? t('Get started') : step === 'done' ? (waiting ? t('Waiting for the install…') : t('Open my library')) : t('Continue')}
                {step !== 'done' && <ArrowRight />}
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  )
}

const CAPTIONS: Record<Step, string> = {
  welcome: 'Maths, explained in motion.',
  how: 'From your material to a finished video.',
  mode: 'You can switch any time.',
  install: 'Installed once, into Studio’s own folder.',
  folder: 'Your videos, where you want them.',
  agent: 'The agent writes every scene.',
  connect: 'Your password never touches Studio.',
  voice: 'Every video is narrated.',
  done: 'Ready when you are.',
}

function LanguageSwitch() {
  const settings = useStore((s) => s.settings)!
  const set = (uiLanguage: 'en' | 'hr') =>
    void updateSettings({ uiLanguage, defaultVoice: { ...settings.defaultVoice, language: uiLanguage, elevenlabs: undefined } })
  return (
    <div className="onb-lang" role="radiogroup" aria-label={t('App language')}>
      {(
        [
          ['en', 'English'],
          ['hr', 'Hrvatski'],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          role="radio"
          aria-checked={(settings.uiLanguage ?? 'en') === value}
          className={(settings.uiLanguage ?? 'en') === value ? 'on' : ''}
          onClick={() => set(value)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function Head({ eyebrow, title, lead }: { eyebrow?: string; title: string; lead?: ReactNode }) {
  return (
    <>
      {eyebrow && <p className="onb-eyebrow">{t(eyebrow)}</p>}
      <h1 className="onb-title">{t(title)}</h1>
      {lead && <p className="onb-lead">{typeof lead === 'string' ? t(lead) : lead}</p>}
    </>
  )
}

// --- pages ------------------------------------------------------------------------------

function Welcome() {
  return (
    <>
      <Head
        eyebrow="Welcome to Manim Studio"
        title="Maths videos that explain themselves"
        lead="Give it a topic, your notes or a page of exercises. An AI agent turns them into animated, narrated videos in the style of 3Blue1Brown, made with manim."
      />
      <ul className="onb-points">
        <li style={{ ['--i' as string]: 0 }}>
          <BookOpen />
          <div>
            <strong>{t('Learn from your own course')}</strong>
            <span>{t('Lessons made from your lecture notes, and worked solutions for your exercises.')}</span>
          </div>
        </li>
        <li style={{ ['--i' as string]: 1 }}>
          <MessageCircleQuestion />
          <div>
            <strong>{t('Ask about any moment')}</strong>
            <span>{t('Pause anywhere and ask. Didn’t follow a step? Get a slower video of just that part.')}</span>
          </div>
        </li>
        <li style={{ ['--i' as string]: 2 }}>
          <Clapperboard />
          <div>
            <strong>{t('Make videos to publish')}</strong>
            <span>{t('A full editor with the code, a timeline, your own narration and YouTube-ready exports.')}</span>
          </div>
        </li>
      </ul>
      <p className="onb-note">{t('Setting up takes about five minutes. Studio explains each step as you go.')}</p>
    </>
  )
}

function How() {
  const steps: [ReactNode, string, string][] = [
    [<BookOpen key="i" />, 'You give it something to explain', 'A topic in a sentence, your lecture PDFs, or photos of exercises.'],
    [
      <Wand2 key="i" />,
      'An AI agent writes the video',
      'It plans the explanation as a script, then animates every step in code with manim, the library behind 3Blue1Brown.',
    ],
    [<Clapperboard key="i" />, 'Studio renders and narrates it', 'Your computer draws the animation, a voice reads the script, and subtitles follow along.'],
    [<GraduationCap key="i" />, 'You watch, ask and adjust', 'Ask questions about any moment, request a slower explanation, or edit the video yourself.'],
  ]
  return (
    <>
      <Head eyebrow="How it works" title="From your material to a finished video" />
      <ol className="onb-steps">
        {steps.map(([icon, title, text], i) => (
          <li key={title} style={{ ['--i' as string]: i }}>
            <span className="onb-step-icon">{icon}</span>
            <div>
              <strong>{t(title)}</strong>
              <span>{t(text)}</span>
            </div>
          </li>
        ))}
      </ol>
    </>
  )
}

function ModePage({ mode, onChange }: { mode: AppMode; onChange: (m: AppMode) => void }) {
  const items: [AppMode, ReactNode, string, string, string][] = [
    ['learn', <GraduationCap key="i" />, 'Learn', 'For students', 'Turn your courses and exercises into videos to watch and ask about. No code, no editor.'],
    [
      'create',
      <Clapperboard key="i" />,
      'Create',
      'For teachers and creators',
      'Make videos to publish, with the code, a timeline, your own narration and exports.',
    ],
    ['both', <Layers key="i" />, 'Both', 'Study and make', 'Your library gets a Learn tab and a Create tab, and you switch between them.'],
  ]
  return (
    <>
      <Head eyebrow="Your way of working" title="How will you use Manim Studio?" />
      <div className="onb-cards" role="radiogroup" aria-label={t('How will you use Manim Studio?')}>
        {items.map(([value, icon, title, who, text], i) => (
          <button
            key={value}
            role="radio"
            aria-checked={mode === value}
            className={`onb-card ${mode === value ? 'on' : ''}`}
            style={{ ['--i' as string]: i }}
            onClick={() => onChange(value)}
          >
            <span className="onb-card-icon">{icon}</span>
            <span className="onb-card-body">
              <strong>
                {t(title)} <em>{t(who)}</em>
              </strong>
              <span>{t(text)}</span>
            </span>
            <span className="onb-card-check">{mode === value && <Check />}</span>
          </button>
        ))}
      </div>
      <p className="onb-note">{t('Not sure? Start with Learn. You can switch any time in Settings → General.')}</p>
    </>
  )
}

const REQUIRED: Component[] = ['env', 'latex']
const INSTALLS: Partial<Record<Component, { title: string; text: string; size: string }>> = {
  env: {
    title: 'Animation engine',
    text: 'Python and manim, the library that draws every animation, plus the tools for narration and subtitles.',
    size: 'About 750 MB',
  },
  latex: { title: 'Formula typesetting', text: 'LaTeX, so equations look like they do in a textbook.', size: 'About 250 MB' },
  transcribe: {
    title: 'Timing for your own recordings',
    text: 'Whisper finds where you said each word when you record narration yourself. It starts after the engine.',
    size: 'About 500 MB',
  },
  omnivoice: {
    title: 'OmniVoice model',
    text: 'Downloaded once. To clone your voice, record a few sentences in a project’s voice settings.',
    size: 'About 3.3 GB',
  },
}

/** Whether the app can make videos at all; until then it waits on the setup screen. */
export const requiredReady = (setup: SetupStatus | null): boolean => !!setup && REQUIRED.every((c) => setup[c] === 'ready')

const wanted = (state: ComponentState | undefined) => state === 'missing' || state === 'outdated'

/**
 * Starts everything the chosen mode needs, in the background. Whisper waits for the engine: both are
 * pixi environments in one folder, and two pixi installs there at once would collide. OmniVoice is
 * installed only when someone picks it.
 */
export function startInstalls(mode: AppMode): void {
  const setup = useStore.getState().setup
  if (!setup) return
  if (wanted(setup.latex)) void installComponent('latex')
  const whisper = () => {
    if (mode !== 'learn' && wanted(useStore.getState().setup?.transcribe) && useStore.getState().setup?.env === 'ready') void installComponent('transcribe')
  }
  if (wanted(setup.env)) void installComponent('env').then(whisper)
  else whisper()
}

/** One component's install: what it is, its size, live progress, and a retry when it fails. */
function InstallRow({ id, offer, i = 0 }: { id: Component; offer?: boolean; i?: number }) {
  const state = useStore((s) => s.setup?.[id]) ?? 'missing'
  const error = useStore((s) => s.setup?.errors[id])
  const p = useStore((s) => s.setupProgress[id])
  const info = INSTALLS[id] ?? {
    title: format('Installing {0}', [AGENTS.find((a) => a.id === id)?.name ?? id]),
    text: 'Its program is downloaded once from the provider and checked before it runs.',
    size: '',
  }
  return (
    <div className={`onb-install ${state}`} style={{ ['--i' as string]: i }}>
      <span className="onb-install-icon">{state === 'ready' ? <Check /> : state === 'error' ? <CircleAlert /> : <Cpu />}</span>
      <div className="onb-install-body">
        <div className="onb-install-head">
          <strong>{t(info.title)}</strong>
          <span>
            {state === 'ready'
              ? t('Installed')
              : state === 'installing'
                ? p !== undefined && p < 1
                  ? `${Math.round(p * 100)}%`
                  : t('Installing…')
                : state === 'error'
                  ? t('Didn’t finish')
                  : info.size && t(info.size)}
          </span>
        </div>
        <span className="onb-install-text">{t(info.text)}</span>
        {state === 'installing' && <ProgressLine value={p !== undefined && p < 1 ? p : undefined} />}
        {state === 'error' && (
          <div className="onb-install-error">
            <span>{error}</span>
            <button className="onb-btn small" onClick={() => void installComponent(id)}>
              {t('Try again')}
            </button>
          </div>
        )}
        {offer && wanted(state) && (
          <button className="onb-btn small" onClick={() => void installComponent(id)}>
            {format('Install {0}', [t(info.title)])}
          </button>
        )}
      </div>
    </div>
  )
}

/** The components every video needs, already installing since the mode was chosen. */
function InstallPage({ mode }: { mode: AppMode }) {
  const setup = useStore((s) => s.setup)
  useEffect(() => startInstalls(mode), [!!setup]) // in case the status hadn't loaded when the mode was chosen
  const all = requiredReady(setup)
  return (
    <>
      <Head
        eyebrow="Setting up your computer"
        title={all ? 'Your computer is ready' : 'Installing what Studio needs'}
        lead="Studio draws videos on your own computer. What it needs is installed once into its own folder; nothing else on your computer changes."
      />
      <div className="onb-installs">
        {[...REQUIRED, ...(mode === 'learn' ? [] : (['transcribe'] as const))].map((c, i) => (
          <InstallRow key={c} id={c} i={i} />
        ))}
      </div>
      <p className="onb-note">
        {all
          ? t('Everything’s installed. Continue to choose where your projects go.')
          : t('This takes a few minutes. Carry on with the setup: it keeps installing in the background.')}
      </p>
    </>
  )
}

/**
 * Shown instead of the app while the engine or LaTeX isn't ready: when onboarding ended mid-install,
 * the app was quit during it, or an update needs a newer engine. Nothing works without them.
 */
export function SetupGate() {
  const mode = useStore((s) => s.settings?.mode ?? 'learn')
  useEffect(() => startInstalls(mode), [])
  return (
    <div className="onb onb-gate">
      <aside className="onb-stage" aria-hidden>
        <div className="onb-stage-grid" />
        <div className="onb-art">
          <InstallArt />
        </div>
        <p className="onb-stage-caption">{t(CAPTIONS.install)}</p>
      </aside>
      <section className="onb-main">
        <div className="onb-scroll">
          <div className="onb-page fwd">
            <Head
              eyebrow="Almost there"
              title="Finishing the setup"
              lead="Studio is installing what it needs to make videos. It opens by itself as soon as it’s done."
            />
            <div className="onb-installs">
              {REQUIRED.map((c, i) => (
                <InstallRow key={c} id={c} i={i} />
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function FolderPage({ folder, onChange }: { folder: string | null; onChange: (dir: string) => void }) {
  const hr = useStore((s) => s.settings?.uiLanguage === 'hr')
  const say = (en: string, croatian: string) => (hr ? croatian : en)
  return (
    <>
      <Head eyebrow="Your projects" title="Where should your videos go?" />
      <div className="onb-folder">
        <ProjectsFolderStep say={say} value={folder} onChange={onChange} />
      </div>
    </>
  )
}

function AgentPage() {
  const agent = useStore((s) => s.settings!.agent)
  return (
    <>
      <Head
        eyebrow="Your AI agent"
        title="Who should write your videos?"
        lead="The agent plans each explanation, writes the animation code, and looks at the rendered frames to fix what’s off. Pick the one you already pay for."
      />
      <div className="onb-cards" role="radiogroup" aria-label={t('Who should write your videos?')}>
        {AGENTS.map((a, i) => (
          <button
            key={a.id}
            role="radio"
            aria-checked={agent === a.id}
            className={`onb-card ${agent === a.id ? 'on' : ''}`}
            style={{ ['--i' as string]: i }}
            onClick={() => void updateSettings({ agent: a.id }).then(refreshClaude)}
          >
            <span className={`onb-card-icon agent-${a.id}`}>
              <Sparkles />
            </span>
            <span className="onb-card-body">
              <strong>
                {a.name} <em>{a.maker}</em>
                {a.id === 'claude' && <span className="badge sun">{t('Recommended')}</span>}
              </strong>
              <span>{t(a.plan)}</span>
            </span>
            <span className="onb-card-check">{agent === a.id && <Check />}</span>
          </button>
        ))}
      </div>
      <div className="onb-explain">
        <KeyRound />
        <p>
          <strong>{t('A plan or an API key?')}</strong>{' '}
          {t('A plan you already pay for has generous limits and costs nothing extra. An API key is billed per use by the provider, and suits occasional use.')}
        </p>
      </div>
    </>
  )
}

/** A key typed in place, checked by the main process before it's stored; its error says what to fix. */
function KeyInput({ placeholder, onSave }: { placeholder: string; onSave: (key: string) => Promise<void> }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await onSave(key.trim())
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="onb-key">
      <div className="onb-code">
        <input
          className="input mono"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && key.trim() && void save()}
        />
        <button className="onb-btn small" disabled={busy || !key.trim()} onClick={() => void save()}>
          {busy ? <span className="spinner" /> : <KeyRound />} {busy ? t('Checking…') : t('Check and save')}
        </button>
      </div>
      {error && (
        <p className="onb-error">
          <CircleAlert /> {error}
        </p>
      )}
    </div>
  )
}

const AUTH_SETTING = { claude: 'claudeAuth', codex: 'codexAuth', antigravity: 'antigravityAuth' } as const

/** Signs the chosen agent in: its program first (Codex, Antigravity), then the account, or an API key. */
function ConnectPage({ agent }: { agent: Agent }) {
  const a = AGENTS.find((x) => x.id === agent)!
  const settings = useStore((s) => s.settings)!
  const setup = useStore((s) => s.setup)
  const windows = useStore((s) => s.app?.platform === 'win32')
  const [status, setStatus] = useState<ClaudeStatus | null>(null)
  const [waiting, setWaiting] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [needsCode, setNeedsCode] = useState(false)
  const [code, setCode] = useState('')
  const [useKey, setUseKey] = useState(settings[AUTH_SETTING[agent]] === 'api-key')
  const [problem, setProblem] = useState('')
  const program = agent === 'claude' ? null : (agent as Component)
  const programState = program ? (setup?.[program] ?? 'missing') : 'ready'

  const check = async () => setStatus(await api.claudeStatus(agent).catch(() => ({ loggedIn: false })))
  useEffect(() => {
    void check()
    return api.on('claude-login', (e) => {
      if (e.url) setUrl(e.url)
      if (e.needsCode) setNeedsCode(true)
    })
  }, [agent])
  useEffect(() => {
    if (program && programState === 'missing') void installComponent(program)
    if (programState === 'ready') void check()
  }, [programState])

  const signIn = async () => {
    setProblem('')
    setUrl(null)
    setNeedsCode(false)
    setWaiting(true)
    try {
      await updateSettings({ [AUTH_SETTING[agent]]: 'account' })
      const st = await api.claudeLogin(agent)
      setStatus(st)
      await refreshClaude()
      if (!st.loggedIn) setProblem(t('The sign-in wasn’t completed. Try again, or use an API key instead.'))
    } catch (e) {
      setProblem(errorText(e))
    } finally {
      setWaiting(false)
    }
  }
  const saveKey = async (key: string) => {
    await updateSettings({ [AUTH_SETTING[agent]]: 'api-key' })
    const saved = agent === 'claude' ? await api.setAnthropicKey(key) : agent === 'codex' ? await api.setOpenAIKey(key) : await api.setGeminiKey(key)
    useStore.setState({ settings: saved })
    await refreshClaude()
    await check()
  }
  const ready = !!status?.loggedIn

  return (
    <>
      <Head
        eyebrow={format('Connect {0}', [a.name])}
        title={ready ? format('{0} is connected', [a.name]) : format('Sign in to {0}', [a.name])}
        lead={ready ? undefined : t(a.plan) + ' ' + t('You sign in in your browser; Studio never sees your password.')}
      />
      {program && programState !== 'ready' ? (
        <InstallRow id={program} />
      ) : ready ? (
        <div className="onb-success">
          <span className="onb-success-mark">
            <Check />
          </span>
          <div>
            <strong>{status?.email || status?.subscription || t('Signed in')}</strong>
            <span>{t('Your agent is ready to write videos.')}</span>
          </div>
        </div>
      ) : (
        <>
          {!useKey && (
            <div className="onb-signin">
              <button className="onb-btn primary big" disabled={waiting} onClick={() => void signIn()}>
                {waiting ? <span className="spinner" /> : <Sparkles />}{' '}
                {format('Sign in with {0}', [agent === 'codex' ? 'ChatGPT' : agent === 'antigravity' ? 'Google' : 'Claude'])}
              </button>
              {waiting && (
                <div className="onb-signin-wait">
                  <p>
                    {agent === 'antigravity' && windows
                      ? t(
                          'In the Antigravity window: choose Google OAuth, sign in in the browser and paste the code there. It closes by itself once you’re signed in.',
                        )
                      : t('Finish signing in in your browser, then come back here.')}
                  </p>
                  {url && (
                    <button className="onb-link" onClick={() => void api.openExternal(url)}>
                      <ExternalLink /> {t('Open the sign-in page again')}
                    </button>
                  )}
                  {(needsCode || (agent === 'antigravity' && url)) && (
                    <div className="onb-code">
                      <input
                        className="input mono"
                        data-autofocus
                        placeholder={t('Paste the code from the browser')}
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                      />
                      <button className="onb-btn small" disabled={!code.trim()} onClick={() => void api.claudeLoginCode(code, agent)}>
                        {t('Confirm')}
                      </button>
                    </div>
                  )}
                </div>
              )}
              {problem && (
                <p className="onb-error">
                  <CircleAlert /> {problem}
                </p>
              )}
            </div>
          )}
          <div className={`onb-keybox ${useKey ? 'open' : ''}`}>
            <button className="onb-link" onClick={() => setUseKey(!useKey)}>
              {useKey ? <Sparkles /> : <KeyRound />} {useKey ? format('Sign in with your {0} account instead', [a.maker]) : t('Use an API key instead')}
            </button>
            {useKey && (
              <div className="onb-keysteps">
                <ol>
                  <li>
                    {format('Create a key on {0}’s site.', [a.maker])}{' '}
                    <button className="onb-link inline" onClick={() => void api.openExternal(a.keyUrl)}>
                      <ExternalLink /> {t('Open the API keys page')}
                    </button>
                  </li>
                  <li>{t('Paste it here. Studio checks that it works, then stores it encrypted on this computer.')}</li>
                </ol>
                <KeyInput placeholder={a.keyPlace} onSave={saveKey} />
                <p className="onb-note">{t('API usage is billed per use by the provider, separately from any plan.')}</p>
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}

/** Narration: the language first, then ElevenLabs (recommended) or OmniVoice, and what each needs. */
function VoicePage() {
  const settings = useStore((s) => s.settings)!
  const voice = settings.defaultVoice
  const save = (v: VoiceSettings) => updateSettings({ defaultVoice: v })
  const latest = useRef(voice)
  latest.current = voice
  const pickFor = async (language: string) => {
    const v = await api.elevenLabsDefaultVoice(language).catch(() => null)
    const now = latest.current
    if (!v || now.language !== language) return
    await save({ ...now, elevenlabs: { modelId: now.elevenlabs?.modelId ?? DEFAULT_EL_MODEL, voiceId: v.id, voiceName: v.name } })
  }
  useEffect(() => {
    if (voice.provider === 'elevenlabs' && !voice.elevenlabs?.voiceId && settings.hasElevenLabsKey) void pickFor(voice.language)
  }, [voice.provider, voice.elevenlabs?.voiceId, settings.hasElevenLabsKey])
  const languages = LANGUAGES.includes(voice.language) ? LANGUAGES : [voice.language, ...LANGUAGES]

  const options: [VoiceSettings['provider'], ReactNode, string, string, string[], string[]][] = [
    [
      'elevenlabs',
      <AudioLines key="i" />,
      'ElevenLabs',
      'Recommended',
      ['The most natural voices, in 30 languages', 'Animations land exactly on the spoken word'],
      ['Needs a free or paid ElevenLabs account'],
    ],
    [
      'omnivoice',
      <Cpu key="i" />,
      'OmniVoice',
      'Free, on your computer',
      ['Free, and works offline', 'Can clone your own voice from a short recording'],
      ['A 3.3 GB download, and slower on older computers'],
    ],
  ]
  return (
    <>
      <Head
        eyebrow="Narration"
        title="How should your videos sound?"
        lead="Every video is narrated: the agent writes what’s said, and a voice reads it while the animation follows."
      />
      <label className="onb-field">
        <span>{t('Narration language')}</span>
        <select
          className="select"
          value={voice.language}
          onChange={(e) => void save({ ...voice, language: e.target.value, elevenlabs: undefined }).then(() => pickFor(e.target.value))}
        >
          {languages.map((code) => (
            <option key={code} value={code}>
              {languageName.of(code)}
            </option>
          ))}
        </select>
      </label>
      <div className="onb-cards two" role="radiogroup" aria-label={t('Voice')}>
        {options.map(([value, icon, title, tag, pros, cons], i) => (
          <button
            key={value}
            role="radio"
            aria-checked={voice.provider === value}
            className={`onb-card tall ${voice.provider === value ? 'on' : ''}`}
            style={{ ['--i' as string]: i }}
            onClick={() => void save({ ...voice, provider: value })}
          >
            <span className="onb-card-top">
              <span className="onb-card-icon">{icon}</span>
              <span className="onb-card-check">{voice.provider === value && <Check />}</span>
            </span>
            <strong>
              {title} {value === 'elevenlabs' ? <span className="badge sun">{t(tag)}</span> : <em>{t(tag)}</em>}
            </strong>
            <ul>
              {pros.map((p) => (
                <li key={p} className="pro">
                  <Check /> {t(p)}
                </li>
              ))}
              {cons.map((c) => (
                <li key={c} className="con">
                  <CircleAlert /> {t(c)}
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>

      {voice.provider === 'elevenlabs' ? (
        <div className="onb-panel" key="el">
          {!settings.hasElevenLabsKey ? (
            <>
              <strong>{t('Connect ElevenLabs')}</strong>
              <ol className="onb-numbered">
                <li>
                  {t('Sign in or create an account at elevenlabs.io. The free plan is enough to try it.')}{' '}
                  <button className="onb-link inline" onClick={() => void api.openExternal('https://elevenlabs.io/app/settings/api-keys')}>
                    <ExternalLink /> {t('Open ElevenLabs API keys')}
                  </button>
                </li>
                <li>
                  {t('Create an API key and switch on these permissions:')} <b>{t('Text to Speech')}</b>, <b>{t('Voices: Read')}</b>
                  {t(' and ')}
                  <b>{t('User')}</b> {t('(for the usage meter).')}
                </li>
                <li>{t('Paste the key here. Studio tries it before saving it.')}</li>
              </ol>
              <KeyInput
                placeholder="sk_…"
                onSave={async (key) => {
                  useStore.setState({ settings: await api.setElevenLabsKey(key), elevenLabsCheck: null })
                }}
              />
            </>
          ) : (
            <>
              <strong>{t('Choose a voice')}</strong>
              <ElevenLabsStatus />
              <VoicePicker
                language={voice.language}
                hasKey
                value={voice.elevenlabs?.voiceId ? { id: voice.elevenlabs.voiceId, name: voice.elevenlabs.voiceName } : undefined}
                onPick={(v) =>
                  void save({ ...voice, elevenlabs: { modelId: voice.elevenlabs?.modelId ?? DEFAULT_EL_MODEL, voiceId: v.id, voiceName: v.name } })
                }
              />
              <p className="onb-note">{t('Press ▶ next to a voice to hear it. You can change it per video later.')}</p>
            </>
          )}
        </div>
      ) : (
        <div className="onb-panel" key="omni">
          <InstallRow id="omnivoice" offer />
        </div>
      )}
    </>
  )
}

function DonePage({ mode, onFirstVideo, onFix }: { mode: AppMode; onFirstVideo: () => void; onFix: (step: Step) => void }) {
  const settings = useStore((s) => s.settings)!
  const setup = useStore((s) => s.setup)
  const claude = useStore((s) => s.claude)
  const engine = requiredReady(setup)
  const v = settings.defaultVoice
  const voiceReady = v.provider === 'elevenlabs' ? !!settings.hasElevenLabsKey : setup?.omnivoice === 'ready'
  const agentName = AGENTS.find((a) => a.id === settings.agent)!.name
  const rows: [boolean, string, string, Step][] = [
    [!!claude?.loggedIn, format('Agent: {0}', [agentName]), claude?.loggedIn ? t('Connected') : t('Not connected yet'), 'connect'],
    [
      voiceReady,
      format('Voice: {0}', [v.provider === 'elevenlabs' ? 'ElevenLabs' : 'OmniVoice']),
      voiceReady ? (v.elevenlabs?.voiceName ?? t('Ready')) + ` · ${languageName.of(v.language)}` : t('Not set up yet'),
      'voice',
    ],
  ]
  const ready = engine && rows.every(([ok]) => ok)
  return (
    <>
      <Head
        eyebrow={ready ? 'All done' : 'Last step'}
        title={ready ? 'You’re all set' : engine ? 'Two last things' : 'Almost there'}
        lead={
          !engine
            ? 'Studio is finishing the install. It takes a few more minutes; the app opens as soon as it’s done.'
            : !ready
              ? 'Videos need an agent to write them and a voice to narrate them. Set them up now, or later in Settings.'
              : mode === 'create'
                ? 'Start with a quick video, or open the editor from your library.'
                : 'Start with a quick video on any topic, or turn a course’s PDFs into lessons.'
        }
      />
      {!engine && (
        <div className="onb-installs">
          {REQUIRED.map((c, i) => (
            <InstallRow key={c} id={c} i={i} />
          ))}
        </div>
      )}
      <ul className="onb-summary">
        {rows.map(([ok, title, text, step], i) => (
          <li key={title} className={ok ? 'ok' : ''} style={{ ['--i' as string]: i }}>
            <span>{ok ? <Check /> : <CircleAlert />}</span>
            <div>
              <strong>{title}</strong>
              <em>{text}</em>
            </div>
            {!ok && (
              <button className="onb-btn small" onClick={() => onFix(step)}>
                {t('Set up')}
              </button>
            )}
          </li>
        ))}
      </ul>
      {ready && (
        <button className="onb-btn primary big" onClick={onFirstVideo}>
          <Wand2 /> {t('Make your first video')}
        </button>
      )}
      <p className="onb-note">{t('You can change any of this later in Settings.')}</p>
    </>
  )
}

// --- illustrations: drawn like a manim animation -------------------------------------------

function Art({ step, mode }: { step: Step; mode: AppMode }) {
  switch (step) {
    case 'welcome':
      return (
        <svg viewBox="0 0 400 300" className="onb-svg">
          <path className="draw axis" d="M40 250 H370" style={{ ['--d' as string]: '0s' }} pathLength={1} />
          <path className="draw axis" d="M90 280 V30" style={{ ['--d' as string]: '.15s' }} pathLength={1} />
          <path id="onb-curve" className="draw curve" d="M60 70 Q205 430 350 70" style={{ ['--d' as string]: '.45s' }} pathLength={1} />
          <path className="draw tangent" d="M137 210 L273 210" style={{ ['--d' as string]: '1.6s' }} pathLength={1} />
          <circle className="onb-runner" r="7" />
          <text className="pop formula" x="250" y="60" style={{ ['--d' as string]: '1.3s' }}>
            y = x²
          </text>
        </svg>
      )
    case 'how':
      return (
        <svg viewBox="0 0 400 300" className="onb-svg">
          <rect className="draw soft" x="30" y="95" width="80" height="105" rx="8" pathLength={1} style={{ ['--d' as string]: '0s' }} />
          {[120, 140, 160].map((y, i) => (
            <path key={y} className="draw muted" d={`M46 ${y} H${94 - i * 12}`} pathLength={1} style={{ ['--d' as string]: `${0.3 + i * 0.1}s` }} />
          ))}
          <path className="draw arrow" d="M122 148 H158 M150 140 L158 148 L150 156" pathLength={1} style={{ ['--d' as string]: '.7s' }} />
          <rect className="draw soft" x="168" y="95" width="80" height="105" rx="8" pathLength={1} style={{ ['--d' as string]: '.85s' }} />
          <text className="pop code" x="208" y="157" style={{ ['--d' as string]: '1.15s' }}>
            {'{ }'}
          </text>
          <path className="draw arrow" d="M260 148 H296 M288 140 L296 148 L288 156" pathLength={1} style={{ ['--d' as string]: '1.35s' }} />
          <rect className="draw curve" x="306" y="105" width="70" height="86" rx="8" pathLength={1} style={{ ['--d' as string]: '1.5s' }} />
          <path className="pop play" d="M333 132 L353 148 L333 164 Z" style={{ ['--d' as string]: '1.85s' }} />
        </svg>
      )
    case 'mode':
      return (
        <svg viewBox="0 0 400 300" className="onb-svg">
          <g className={mode === 'create' ? 'dim' : ''}>
            <path className="draw curve" d="M70 150 L150 115 L230 150 L150 185 Z" pathLength={1} style={{ ['--d' as string]: '0s' }} />
            <path className="draw curve" d="M105 165 V200 Q150 225 195 200 V165" pathLength={1} style={{ ['--d' as string]: '.3s' }} />
            <path className="draw muted" d="M230 150 V195" pathLength={1} style={{ ['--d' as string]: '.55s' }} />
          </g>
          <g className={mode === 'learn' ? 'dim' : ''}>
            <rect className="draw soft" x="265" y="105" width="110" height="80" rx="10" pathLength={1} style={{ ['--d' as string]: '.4s' }} />
            <path className="pop play" d="M310 130 L335 145 L310 160 Z" style={{ ['--d' as string]: '.85s' }} />
            <path className="draw muted" d="M265 205 H375" pathLength={1} style={{ ['--d' as string]: '.7s' }} />
          </g>
        </svg>
      )
    case 'install':
      return <InstallArt />
    case 'folder':
      return (
        <svg viewBox="0 0 400 300" className="onb-svg">
          <path className="draw curve" d="M90 100 H170 L190 120 H310 V230 H90 Z" pathLength={1} style={{ ['--d' as string]: '0s' }} />
          {[0, 1, 2].map((i) => (
            <rect key={i} className="pop card" x={120 + i * 60} y={150} width="46" height="56" rx="6" style={{ ['--d' as string]: `${0.6 + i * 0.15}s` }} />
          ))}
        </svg>
      )
    case 'agent':
      return (
        <svg viewBox="0 0 400 300" className="onb-svg">
          <path
            className="draw soft"
            d="M85 70 H330 Q345 70 345 85 V195 Q345 210 330 210 H150 L110 240 V210 H85 Q70 210 70 195 V85 Q70 70 85 70 Z"
            pathLength={1}
            style={{ ['--d' as string]: '0s' }}
          />
          {[
            [100, 210],
            [118, 280],
            [118, 245],
            [100, 190],
          ].map(([x, w], i) => (
            <path
              key={i}
              className={`draw ${i === 2 ? 'curve' : 'muted'}`}
              d={`M${x} ${105 + i * 24} H${w}`}
              pathLength={1}
              style={{ ['--d' as string]: `${0.5 + i * 0.25}s` }}
            />
          ))}
          <path className="pop spark" d="M300 118 l6 14 l14 6 l-14 6 l-6 14 l-6 -14 l-14 -6 l14 -6 Z" style={{ ['--d' as string]: '1.6s' }} />
        </svg>
      )
    case 'connect':
      return (
        <svg viewBox="0 0 400 300" className="onb-svg">
          <rect className="draw soft" x="140" y="130" width="120" height="95" rx="14" pathLength={1} style={{ ['--d' as string]: '0s' }} />
          <path className="draw curve" d="M165 130 V100 Q165 65 200 65 Q235 65 235 100 V130" pathLength={1} style={{ ['--d' as string]: '.35s' }} />
          <circle className="pop dot" cx="200" cy="172" r="10" style={{ ['--d' as string]: '.8s' }} />
          <path className="draw curve" d="M200 182 V200" pathLength={1} style={{ ['--d' as string]: '1s' }} />
        </svg>
      )
    case 'voice':
      return (
        <svg viewBox="0 0 400 300" className="onb-svg">
          {Array.from({ length: 13 }, (_, i) => {
            const h = [30, 60, 95, 140, 110, 170, 120, 160, 90, 130, 70, 45, 25][i]
            return (
              <rect key={i} className="wave" x={68 + i * 21} y={150 - h / 2} width="11" height={h} rx="5.5" style={{ ['--d' as string]: `${i * 0.07}s` }} />
            )
          })}
        </svg>
      )
    case 'done':
      return (
        <svg viewBox="0 0 400 300" className="onb-svg">
          <circle className="draw curve" cx="200" cy="150" r="78" pathLength={1} style={{ ['--d' as string]: '0s' }} />
          <path className="draw check" d="M163 152 L190 178 L240 124" pathLength={1} style={{ ['--d' as string]: '.6s' }} />
          {[
            [90, 80],
            [320, 90],
            [80, 220],
            [330, 215],
            [200, 40],
            [205, 265],
          ].map(([x, y], i) => (
            <circle key={i} className="pop confetti" cx={x} cy={y} r={i % 2 ? 5 : 7} style={{ ['--d' as string]: `${1 + i * 0.08}s` }} />
          ))}
        </svg>
      )
  }
}

/** The installs' real progress, drawn as two rings filling up. */
function InstallArt() {
  const setup = useStore((s) => s.setup)
  const progress = useStore((s) => s.setupProgress)
  const ring = (c: Component, cx: number, label: string) => {
    const p = progress[c]
    const busy = setup?.[c] === 'installing' && (p === undefined || p >= 1)
    const done = setup?.[c] === 'ready' ? 1 : busy ? 0.25 : (p ?? 0)
    const r = 52
    const len = 2 * Math.PI * r
    return (
      <g key={c}>
        <circle cx={cx} cy={150} r={r} className="ring-bg" />
        <circle
          cx={cx}
          cy={150}
          r={r}
          className={`ring ${busy ? 'busy' : ''}`}
          strokeDasharray={len}
          strokeDashoffset={len * (1 - done)}
          transform={`rotate(-90 ${cx} 150)`}
        />
        <text x={cx} y={158} className="ring-label">
          {setup?.[c] === 'ready' ? '✓' : label}
        </text>
      </g>
    )
  }
  return (
    <svg viewBox="0 0 400 300" className="onb-svg">
      {ring('env', 130, 'π')}
      {ring('latex', 270, '∫')}
    </svg>
  )
}
