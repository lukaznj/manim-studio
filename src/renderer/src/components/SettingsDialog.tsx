import { AudioLines, Check, Circle, Cpu, KeyRound, Laptop, LogOut, Settings2, Sparkles, Square } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { Component, ComponentState, ModelOption, VoiceOption, VoiceProvider, VoiceSettings } from '../../../shared/types'
import { api } from '../lib/api'
import { encodeWav } from '../lib/audio'
import { closeDialog, errorText, installComponent, openDialog, refreshClaude, toast, updateMeta, updateSettings, useStore } from '../store'
import { useRecorder } from './RecordingBooth'
import { Modal, ProgressLine, Tabs } from './ui'

type Tab = 'account' | 'voice' | 'env' | 'about'

export function SettingsDialog() {
  const dialog = useStore((s) => s.dialog)
  const open = dialog?.kind === 'settings'
  const [tab, setTab] = useState<Tab>('account')
  useEffect(() => {
    if (dialog?.kind === 'settings') setTab(dialog.tab ?? 'account')
  }, [dialog])

  return (
    <Modal open={open} onClose={closeDialog} title="Settings" icon={<Settings2 className="head-icon" />} width={720}>
      <div className="settings-tabs">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'account', label: 'Claude' },
            { value: 'voice', label: 'Voice' },
            { value: 'env', label: 'Environment' },
            { value: 'about', label: 'About' },
          ]}
        />
      </div>
      <div className="modal-body settings-body">
        {tab === 'account' && <AccountTab />}
        {tab === 'voice' && <VoiceTab />}
        {tab === 'env' && <EnvTab />}
        {tab === 'about' && <AboutTab />}
      </div>
    </Modal>
  )
}

function Row(props: { title: ReactNode; text?: ReactNode; children?: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-row-text">
        <div className="set-row-title">{props.title}</div>
        {props.text && <div className="hint">{props.text}</div>}
      </div>
      <div className="set-row-control">{props.children}</div>
    </div>
  )
}

function KeyField(props: { saved: boolean; placeholder: string; onSave: (key: string) => Promise<void> }) {
  const [key, setKey] = useState('')
  return (
    <div className="inline-form">
      <input className="input" type="password" placeholder={props.saved ? '••••••••••' : props.placeholder} value={key} onChange={(e) => setKey(e.target.value)} />
      <button
        className="btn"
        disabled={!key.trim()}
        onClick={async () => {
          await props.onSave(key)
          setKey('')
        }}
      >
        <KeyRound /> Save
      </button>
    </div>
  )
}

function AccountTab() {
  const claude = useStore((s) => s.claude)
  const settings = useStore((s) => s.settings)!
  const [models, setModels] = useState<ModelOption[] | null>(null)
  const [busy, setBusy] = useState(false)
  const usingKey = claude?.method === 'api-key'

  useEffect(() => {
    if (claude?.loggedIn)
      api
        .chatModels()
        .then(setModels)
        .catch(() => setModels([]))
  }, [claude?.loggedIn])

  const login = async () => {
    setBusy(true)
    try {
      await api.claudeLogin()
      await refreshClaude()
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const saveKey = async (key: string) => {
    useStore.setState({ settings: await api.setAnthropicKey(key) })
    await refreshClaude()
    toast(key ? 'API key saved' : 'API key removed', 'ok')
  }

  return (
    <div className="set-group">
      <div className={`account-card ${claude?.loggedIn ? 'on' : ''}`}>
        <Sparkles />
        <div>
          <strong>{usingKey ? 'Anthropic API key' : claude?.loggedIn ? claude.email ?? 'Signed in' : 'Not signed in'}</strong>
          <div className="hint">
            {usingKey
              ? 'Usage is billed to the API key’s Console account.'
              : claude?.loggedIn
                ? `Claude ${claude.subscription ?? ''} · usage counts against this plan`
                : 'Studio runs Claude Code with your own Claude account. Sign-in opens in your browser.'}
          </div>
        </div>
        {usingKey ? null : claude?.loggedIn ? (
          <button
            className="btn ghost small"
            onClick={async () => {
              await api.claudeLogout()
              await refreshClaude()
            }}
          >
            <LogOut /> Sign out
          </button>
        ) : (
          <button className="btn primary small" disabled={busy} onClick={() => void login()}>
            {busy && <span className="spinner" />} Sign in
          </button>
        )}
      </div>

      <Row
        title="Anthropic API key"
        text={
          settings.hasAnthropicKey
            ? 'Saved and encrypted on this computer; it takes precedence over the sign-in.'
            : 'Optional, instead of signing in: a key from console.anthropic.com, billed per use.'
        }
      >
        <div className="inline-form">
          <KeyField saved={settings.hasAnthropicKey} placeholder="sk-ant-…" onSave={saveKey} />
          {settings.hasAnthropicKey && (
            <button className="btn ghost" onClick={() => void saveKey('')}>
              Remove
            </button>
          )}
        </div>
      </Row>

      <Row title="Model" text="Which Claude model writes the scenes. The default is whatever your plan recommends.">
        <select className="select" value={settings.claudeModel} onChange={(e) => void updateSettings({ claudeModel: e.target.value })} disabled={!claude?.loggedIn}>
          {(models ?? [{ value: '', label: 'Default', description: '' }]).map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </Row>
      <p className="hint">A new model applies from the next conversation (the ↺ button in the chat).</p>
    </div>
  )
}

const PROVIDERS: { value: VoiceProvider; title: string; text: string; icon: ReactNode }[] = [
  { value: 'system', title: 'System voice', text: 'Free and offline, in the project’s language. Good for drafts and pacing.', icon: <Laptop /> },
  { value: 'elevenlabs', title: 'ElevenLabs', text: 'The most natural voices. Paid per character.', icon: <AudioLines /> },
  { value: 'omnivoice', title: 'OmniVoice', text: 'Local and free, 600+ languages, clones your voice from a short clip.', icon: <Cpu /> },
]

const EL_MODELS = [
  { id: 'eleven_multilingual_v2', label: 'Multilingual v2 (stable, recommended)' },
  { id: 'eleven_v3', label: 'v3 (more expressive)' },
  { id: 'eleven_flash_v2_5', label: 'Flash v2.5 (fast, cheaper)' },
  { id: 'eleven_turbo_v2_5', label: 'Turbo v2.5' },
]

const LANGUAGES = ['en', 'en-GB', 'es', 'fr', 'de', 'it', 'pt', 'pt-BR', 'nl', 'pl', 'cs', 'sk', 'sl', 'hr', 'sr', 'hu', 'ro', 'sv', 'da', 'nb', 'fi', 'tr', 'el', 'uk', 'ru', 'ar', 'hi', 'ja', 'ko', 'zh']
const languageName = new Intl.DisplayNames(['en'], { type: 'language' })

function VoiceTab() {
  const project = useStore((s) => s.project)
  const settings = useStore((s) => s.settings)!
  const setup = useStore((s) => s.setup)
  const voice: VoiceSettings = project?.meta.voice ?? settings.defaultVoice
  const [elVoices, setElVoices] = useState<VoiceOption[] | null>(null)
  const [sysVoices, setSysVoices] = useState<VoiceOption[]>([])

  const save = (patch: Partial<VoiceSettings>) => {
    const next = { ...voice, ...patch }
    if (project) void updateMeta({ voice: next })
    else void updateSettings({ defaultVoice: next })
  }

  useEffect(() => {
    api.systemVoices().then(setSysVoices).catch(() => setSysVoices([]))
  }, [voice.language])
  useEffect(() => {
    if (voice.provider === 'elevenlabs' && settings.hasElevenLabsKey)
      api
        .elevenLabsVoices()
        .then(setElVoices)
        .catch((e) => {
          setElVoices([])
          toast(errorText(e), 'error')
        })
  }, [voice.provider, settings.hasElevenLabsKey])

  const languages = LANGUAGES.includes(voice.language) ? LANGUAGES : [voice.language, ...LANGUAGES]

  return (
    <div className="set-group">
      <div className="eyebrow">{project ? `Voice for “${project.meta.name}”` : 'Default voice for new projects'}</div>
      <Row title="Narration language" text="Claude writes the narration and on-screen text in it; voices and subtitles follow it.">
        <select className="select" value={voice.language} onChange={(e) => save({ language: e.target.value, systemVoice: undefined })}>
          {languages.map((code) => (
            <option key={code} value={code}>
              {languageName.of(code)}
            </option>
          ))}
        </select>
      </Row>
      <div className="provider-cards">
        {PROVIDERS.map((p) => (
          <button key={p.value} className={`provider-card ${voice.provider === p.value ? 'on' : ''}`} onClick={() => save({ provider: p.value })}>
            {p.icon}
            <strong>{p.title}</strong>
            <span className="hint">{p.text}</span>
          </button>
        ))}
      </div>

      {voice.provider === 'system' && (
        <Row title="Voice" text={sysVoices.length ? 'Voices for the narration language are listed first.' : 'This system has no voice list; the best match is picked automatically.'}>
          <select className="select" value={voice.systemVoice ?? ''} onChange={(e) => save({ systemVoice: e.target.value || undefined })}>
            <option value="">Automatic (best voice for the language)</option>
            {sysVoices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} {v.description ? `— ${v.description}` : ''}
              </option>
            ))}
          </select>
        </Row>
      )}

      {voice.provider === 'elevenlabs' && (
        <>
          <Row title="API key" text={settings.hasElevenLabsKey ? 'Saved and encrypted on this computer.' : 'elevenlabs.io → Profile → API keys'}>
            <KeyField
              saved={settings.hasElevenLabsKey}
              placeholder="sk_…"
              onSave={async (key) => {
                useStore.setState({ settings: await api.setElevenLabsKey(key) })
                toast('Key saved', 'ok')
              }}
            />
          </Row>
          <Row title="Voice" text="Voices from your ElevenLabs library.">
            <select
              className="select"
              value={voice.elevenlabs?.voiceId ?? ''}
              disabled={!elVoices?.length}
              onChange={(e) => {
                const v = elVoices?.find((x) => x.id === e.target.value)
                save({ elevenlabs: { modelId: voice.elevenlabs?.modelId ?? EL_MODELS[0].id, voiceId: e.target.value, voiceName: v?.name } })
              }}
            >
              <option value="">{elVoices ? 'Choose a voice' : settings.hasElevenLabsKey ? 'Loading…' : 'Save a key first'}</option>
              {elVoices?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.description ? `— ${v.description}` : ''}
                </option>
              ))}
            </select>
          </Row>
          <Row title="Model">
            <select
              className="select"
              value={voice.elevenlabs?.modelId ?? EL_MODELS[0].id}
              onChange={(e) => save({ elevenlabs: { voiceId: voice.elevenlabs?.voiceId ?? '', voiceName: voice.elevenlabs?.voiceName, modelId: e.target.value } })}
            >
              {EL_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Row>
        </>
      )}

      {voice.provider === 'omnivoice' && (
        <>
          <Row title="OmniVoice model" text="About 3.3 GB of weights plus PyTorch, downloaded once. Uses the GPU on Apple Silicon and NVIDIA.">
            <InstallButton component="omnivoice" state={setup?.omnivoice ?? 'missing'} />
          </Row>
          {project ? <ReferenceRecorder /> : <p className="hint">The reference recording of your voice is set inside a project.</p>}
        </>
      )}

      <div className="set-divider" />
      <Row title="Exact bookmarks for recordings" text="Whisper (faster-whisper) finds where you said each word. About 500 MB.">
        <InstallButton component="transcribe" state={setup?.transcribe ?? 'missing'} />
      </Row>
    </div>
  )
}

// A few seconds of natural speech in the project's language makes the best clone.
const REFERENCE_TEXT: Record<string, string> = {
  en: 'A function assigns exactly one value to every input, and we draw its graph in a coordinate system.',
  hr: 'Funkcija pridružuje svakom elementu domene točno jedan element kodomene, a graf funkcije crtamo u koordinatnom sustavu.',
  de: 'Eine Funktion ordnet jedem Eingabewert genau einen Wert zu, und ihren Graphen zeichnen wir in ein Koordinatensystem.',
  es: 'Una función asigna exactamente un valor a cada entrada, y dibujamos su gráfica en un sistema de coordenadas.',
}

function ReferenceRecorder() {
  const project = useStore((s) => s.project)!
  const rec = useRecorder()
  const has = !!project.meta.voice.omnivoice?.refAudio
  const text = REFERENCE_TEXT[project.meta.voice.language.split('-')[0]] ?? REFERENCE_TEXT.en
  const toggle = async () => {
    try {
      if (rec.state === 'idle') await rec.start()
      else {
        const buffer = await rec.stop()
        if (!buffer) return
        if (buffer.duration < 3) return toast('That was too short. Read the whole sentence.', 'error')
        const meta = await api.saveVoiceReference(encodeWav(buffer), text)
        useStore.setState((s) => ({ project: s.project ? { ...s.project, meta } : null }))
        toast('Reference voice saved', 'ok')
      }
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }
  return (
    <div className="reference">
      <div className="set-row-title">Your voice, for cloning {has && <span className="badge mint">saved</span>}</div>
      <p className="hint">Read this naturally, 5–10 seconds:</p>
      <blockquote>{text}</blockquote>
      <button className={`btn ${rec.state !== 'idle' ? 'danger' : ''}`} onClick={() => void toggle()}>
        {rec.state === 'idle' ? <Circle /> : <Square />}
        {rec.state === 'countdown' ? `Starting in ${rec.count}…` : rec.state === 'recording' ? `Stop (${rec.elapsed.toFixed(1)} s)` : has ? 'Record again' : 'Record'}
      </button>
    </div>
  )
}

const COMPONENTS: { id: Component; title: string; text: string }[] = [
  { id: 'env', title: 'Manim environment', text: 'Python 3.12, manim 0.21, manim-voiceover, cairo/pango (pixi, conda-forge).' },
  { id: 'latex', title: 'LaTeX (TinyTeX)', text: 'For MathTex and Tex. Without it, only Text and shapes work.' },
  { id: 'omnivoice', title: 'OmniVoice', text: 'Local multilingual speech with voice cloning.' },
  { id: 'transcribe', title: 'Whisper', text: 'Word timings for human recordings.' },
]

function EnvTab() {
  const setup = useStore((s) => s.setup)
  const log = useStore((s) => s.setupLog)
  const progress = useStore((s) => s.setupProgress)
  const settings = useStore((s) => s.settings)!
  const [openLog, setOpenLog] = useState<Component | null>(null)
  if (!setup) return null
  return (
    <div className="set-group">
      {COMPONENTS.map((c) => (
        <div key={c.id} className="env-row">
          <Row title={c.title} text={setup.errors[c.id] ?? c.text}>
            <InstallButton component={c.id} state={setup[c.id]} />
          </Row>
          {setup[c.id] === 'installing' && <ProgressLine value={progress[c.id]} />}
          {!!log[c.id]?.length && (
            <button className="link-btn" onClick={() => setOpenLog(openLog === c.id ? null : c.id)}>
              {openLog === c.id ? 'Hide log' : 'Show log'}
            </button>
          )}
          {openLog === c.id && <pre className="env-log mono">{log[c.id]?.join('\n')}</pre>}
        </div>
      ))}
      <div className="set-divider" />
      <Row title="Render on save" text="Every save (⌘S) renders a preview. Turn it off for very slow scenes.">
        <label className="switch">
          <input type="checkbox" checked={settings.autoRender} onChange={(e) => void updateSettings({ autoRender: e.target.checked })} />
          <span />
        </label>
      </Row>
    </div>
  )
}

const STATE_TEXT: Record<ComponentState, string> = {
  missing: 'Install',
  installing: 'Installing…',
  ready: 'Ready',
  outdated: 'Update',
  unsupported: 'Not supported',
  error: 'Try again',
}

function InstallButton({ component, state }: { component: Component; state: ComponentState }) {
  if (state === 'ready')
    return (
      <span className="badge mint">
        <Check /> Ready
      </span>
    )
  if (state === 'unsupported') return <span className="badge">Not supported on this computer</span>
  return (
    <button className="btn small" disabled={state === 'installing'} onClick={() => void installComponent(component)}>
      {state === 'installing' && <span className="spinner" />} {STATE_TEXT[state]}
    </button>
  )
}

function AboutTab() {
  const app = useStore((s) => s.app)!
  const update = useStore((s) => s.update)
  const settings = useStore((s) => s.settings)!
  const status =
    update.state === 'checking'
      ? 'Checking…'
      : update.state === 'none'
        ? 'You have the latest version.'
        : update.state === 'available'
          ? `Version ${update.version} is available.`
          : update.state === 'downloading'
            ? `Downloading ${Math.round(update.percent)}%`
            : update.state === 'ready'
              ? `Version ${update.version} is ready. Restart to finish.`
              : update.state === 'error'
                ? update.message
                : ''
  return (
    <div className="set-group">
      <Row title={`Manim Studio ${app.version}`} text={`${app.platform} · ${app.arch} · open source (MIT)`}>
        <button className="btn small" onClick={() => void api.checkForUpdates()}>
          Check for updates
        </button>
      </Row>
      {status && <p className="hint">{status}</p>}
      {update.state === 'available' && (
        <button className="btn primary small" onClick={() => void api.downloadUpdate()}>
          Download {update.version}
        </button>
      )}
      {update.state === 'ready' && (
        <button className="btn primary small" onClick={() => void api.installUpdate()}>
          Restart and update
        </button>
      )}
      <Row title="Projects folder" text={<span className="mono">{settings.projectsDir}</span>}>
        <button
          className="btn small"
          onClick={async () => {
            const dir = await api.pickFolder()
            if (dir) void updateSettings({ projectsDir: dir })
          }}
        >
          Change
        </button>
      </Row>
      <Row title="Releases" text="If an automatic update fails, download the new version from the releases page.">
        <button className="btn small ghost" onClick={() => void api.openExternal(app.releasesUrl)}>
          Open
        </button>
      </Row>
      <button className="link-btn" onClick={() => openDialog({ kind: 'settings', tab: 'env' })}>
        Environment →
      </button>
    </div>
  )
}
