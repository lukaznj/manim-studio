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
    <Modal open={open} onClose={closeDialog} title="Postavke" icon={<Settings2 className="head-icon" />} width={720}>
      <div className="settings-tabs">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'account', label: 'Claude' },
            { value: 'voice', label: 'Glas' },
            { value: 'env', label: 'Okruženje' },
            { value: 'about', label: 'O aplikaciji' },
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

function AccountTab() {
  const claude = useStore((s) => s.claude)
  const settings = useStore((s) => s.settings)!
  const [models, setModels] = useState<ModelOption[] | null>(null)
  const [busy, setBusy] = useState(false)

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

  return (
    <div className="set-group">
      <div className={`account-card ${claude?.loggedIn ? 'on' : ''}`}>
        <Sparkles />
        <div>
          <strong>{claude?.loggedIn ? claude.email ?? 'Prijavljen' : 'Nisi prijavljen'}</strong>
          <div className="hint">
            {claude?.loggedIn
              ? `Claude ${claude.subscription ?? ''} · potrošnja ide na ovaj plan`
              : 'Prijava se otvara u pregledniku kod Anthropica. Svaki admin koristi svoj Claude plan.'}
          </div>
        </div>
        {claude?.loggedIn ? (
          <button
            className="btn ghost small"
            onClick={async () => {
              await api.claudeLogout()
              await refreshClaude()
            }}
          >
            <LogOut /> Odjava
          </button>
        ) : (
          <button className="btn primary small" disabled={busy} onClick={() => void login()}>
            {busy && <span className="spinner" />} Prijavi se
          </button>
        )}
      </div>

      <Row title="Model" text="Koji Claude model piše scene. Zadani je onaj koji tvoj plan preporučuje.">
        <select className="select" value={settings.claudeModel} onChange={(e) => void updateSettings({ claudeModel: e.target.value })} disabled={!claude?.loggedIn}>
          {(models ?? [{ value: '', label: 'Zadano', description: '' }]).map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </Row>
      <p className="hint">Novi model vrijedi od sljedećeg razgovora (ikona ↺ u razgovoru).</p>
    </div>
  )
}

const PROVIDERS: { value: VoiceProvider; title: string; text: string; icon: ReactNode }[] = [
  { value: 'system', title: 'Sistemski glas', text: 'Besplatno, bez interneta. Za skice i tempo (macOS: Lana).', icon: <Laptop /> },
  { value: 'elevenlabs', title: 'ElevenLabs', text: 'Najprirodniji hrvatski glas. Plaća se po znaku.', icon: <AudioLines /> },
  { value: 'omnivoice', title: 'OmniVoice', text: 'Lokalno i besplatno, klonira tvoj glas iz kratke snimke.', icon: <Cpu /> },
]

const EL_MODELS = [
  { id: 'eleven_multilingual_v2', label: 'Multilingual v2 — stabilan, preporučeno' },
  { id: 'eleven_v3', label: 'v3 — izražajniji' },
  { id: 'eleven_flash_v2_5', label: 'Flash v2.5 — brz i jeftiniji' },
  { id: 'eleven_turbo_v2_5', label: 'Turbo v2.5' },
]

function VoiceTab() {
  const project = useStore((s) => s.project)
  const settings = useStore((s) => s.settings)!
  const setup = useStore((s) => s.setup)
  const voice: VoiceSettings = project?.meta.voice ?? settings.defaultVoice
  const [key, setKey] = useState('')
  const [elVoices, setElVoices] = useState<VoiceOption[] | null>(null)
  const [sysVoices, setSysVoices] = useState<VoiceOption[]>([])

  const save = (patch: Partial<VoiceSettings>) => {
    const next = { ...voice, ...patch }
    if (project) void updateMeta({ voice: next })
    else void updateSettings({ defaultVoice: next })
  }

  useEffect(() => {
    api.systemVoices().then(setSysVoices).catch(() => setSysVoices([]))
  }, [])
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

  return (
    <div className="set-group">
      <div className="eyebrow">{project ? `Glas za „${project.meta.name}”` : 'Zadani glas za nove projekte'}</div>
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
        <Row title="Glas" text={sysVoices.length ? 'Hrvatski glasovi su na vrhu.' : 'Na ovom sustavu nema popisa glasova; koristi se zadani.'}>
          <select className="select" value={voice.systemVoice ?? 'Lana'} onChange={(e) => save({ systemVoice: e.target.value })}>
            {(sysVoices.length ? sysVoices : [{ id: 'Lana', name: 'Lana' }]).map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} {v.description ? `— ${v.description}` : ''}
              </option>
            ))}
          </select>
        </Row>
      )}

      {voice.provider === 'elevenlabs' && (
        <>
          <Row title="API ključ" text={settings.hasElevenLabsKey ? 'Spremljen i šifriran na ovom računalu.' : 'elevenlabs.io → Profile → API keys'}>
            <div className="inline-form">
              <input className="input" type="password" placeholder={settings.hasElevenLabsKey ? '••••••••••' : 'sk_…'} value={key} onChange={(e) => setKey(e.target.value)} />
              <button
                className="btn"
                disabled={!key.trim()}
                onClick={async () => {
                  useStore.setState({ settings: await api.setElevenLabsKey(key) })
                  setKey('')
                  toast('Ključ spremljen', 'ok')
                }}
              >
                <KeyRound /> Spremi
              </button>
            </div>
          </Row>
          <Row title="Glas" text="Glasovi iz tvoje ElevenLabs knjižnice.">
            <select
              className="select"
              value={voice.elevenlabs?.voiceId ?? ''}
              disabled={!elVoices?.length}
              onChange={(e) => {
                const v = elVoices?.find((x) => x.id === e.target.value)
                save({ elevenlabs: { modelId: voice.elevenlabs?.modelId ?? EL_MODELS[0].id, voiceId: e.target.value, voiceName: v?.name } })
              }}
            >
              <option value="">{elVoices ? 'Odaberi glas' : settings.hasElevenLabsKey ? 'Učitavam…' : 'Najprije spremi ključ'}</option>
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
          <Row title="OmniVoice model" text="Oko 3,3 GB modela + PyTorch, preuzima se jednom. Na Apple Siliconu koristi GPU.">
            <InstallButton component="omnivoice" state={setup?.omnivoice ?? 'missing'} />
          </Row>
          {project ? <ReferenceRecorder /> : <p className="hint">Referentnu snimku glasa postavljaš unutar projekta.</p>}
        </>
      )}

      <div className="set-divider" />
      <Row title="Precizni bookmarki za snimke" text="Whisper (faster-whisper) pronađe gdje si izgovorio koju riječ. Oko 500 MB.">
        <InstallButton component="transcribe" state={setup?.transcribe ?? 'missing'} />
      </Row>
    </div>
  )
}

const REFERENCE_TEXT = 'Funkcija pridružuje svakom elementu domene točno jedan element kodomene, a graf funkcije crtamo u koordinatnom sustavu.'

function ReferenceRecorder() {
  const project = useStore((s) => s.project)!
  const rec = useRecorder()
  const has = !!project.meta.voice.omnivoice?.refAudio
  const toggle = async () => {
    try {
      if (rec.state === 'idle') await rec.start()
      else {
        const buffer = await rec.stop()
        if (!buffer) return
        if (buffer.duration < 3) return toast('Snimka je prekratka — pročitaj cijelu rečenicu.', 'error')
        const meta = await api.saveVoiceReference(encodeWav(buffer), REFERENCE_TEXT)
        useStore.setState((s) => ({ project: s.project ? { ...s.project, meta } : null }))
        toast('Referentni glas spremljen', 'ok')
      }
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }
  return (
    <div className="reference">
      <div className="set-row-title">Tvoj glas za kloniranje {has && <span className="badge mint">spremljeno</span>}</div>
      <p className="hint">Pročitaj prirodno, 5–10 sekundi:</p>
      <blockquote>{REFERENCE_TEXT}</blockquote>
      <button className={`btn ${rec.state !== 'idle' ? 'danger' : ''}`} onClick={() => void toggle()}>
        {rec.state === 'idle' ? <Circle /> : <Square />}
        {rec.state === 'countdown' ? `Kreće za ${rec.count}…` : rec.state === 'recording' ? `Zaustavi (${rec.elapsed.toFixed(1)} s)` : has ? 'Snimi ponovno' : 'Snimi'}
      </button>
    </div>
  )
}

const COMPONENTS: { id: Component; title: string; text: string }[] = [
  { id: 'env', title: 'Manim okruženje', text: 'Python 3.12, manim 0.21, manim-voiceover, cairo/pango (pixi, conda-forge).' },
  { id: 'latex', title: 'LaTeX (TinyTeX)', text: 'Za MathTex i Tex. Bez njega rade samo Text i oblici.' },
  { id: 'omnivoice', title: 'OmniVoice', text: 'Lokalni hrvatski TTS s kloniranjem glasa.' },
  { id: 'transcribe', title: 'Whisper', text: 'Vremena riječi u ljudskim snimkama.' },
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
              {openLog === c.id ? 'Sakrij zapis' : 'Prikaži zapis'}
            </button>
          )}
          {openLog === c.id && <pre className="env-log mono">{log[c.id]?.join('\n')}</pre>}
        </div>
      ))}
      <div className="set-divider" />
      <Row title="Renderiraj pri spremanju" text="Svako spremanje (⌘S) pokreće pregled. Isključi za vrlo spore scene.">
        <label className="switch">
          <input type="checkbox" checked={settings.autoRender} onChange={(e) => void updateSettings({ autoRender: e.target.checked })} />
          <span />
        </label>
      </Row>
    </div>
  )
}

const STATE_TEXT: Record<ComponentState, string> = {
  missing: 'Instaliraj',
  installing: 'Instaliram…',
  ready: 'Spremno',
  outdated: 'Ažuriraj',
  unsupported: 'Nije podržano',
  error: 'Pokušaj ponovno',
}

function InstallButton({ component, state }: { component: Component; state: ComponentState }) {
  if (state === 'ready')
    return (
      <span className="badge mint">
        <Check /> Spremno
      </span>
    )
  if (state === 'unsupported') return <span className="badge">Nije podržano na ovom računalu</span>
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
      ? 'Provjeravam…'
      : update.state === 'none'
        ? 'Imaš najnoviju verziju.'
        : update.state === 'available'
          ? `Dostupna je verzija ${update.version}.`
          : update.state === 'downloading'
            ? `Preuzimam ${Math.round(update.percent)}%`
            : update.state === 'ready'
              ? `Verzija ${update.version} je spremna — ponovno pokreni.`
              : update.state === 'error'
                ? update.message
                : ''
  return (
    <div className="set-group">
      <Row title={`Manim Studio ${app.version}`} text={`${app.platform} · ${app.arch}`}>
        <button className="btn small" onClick={() => void api.checkForUpdates()}>
          Provjeri ažuriranja
        </button>
      </Row>
      {status && <p className="hint">{status}</p>}
      {update.state === 'available' && (
        <button className="btn primary small" onClick={() => void api.downloadUpdate()}>
          Preuzmi {update.version}
        </button>
      )}
      {update.state === 'ready' && (
        <button className="btn primary small" onClick={() => void api.installUpdate()}>
          Ponovno pokreni i ažuriraj
        </button>
      )}
      <Row title="Mapa projekata" text={<span className="mono">{settings.projectsDir}</span>}>
        <button
          className="btn small"
          onClick={async () => {
            const dir = await api.pickFolder()
            if (dir) void updateSettings({ projectsDir: dir })
          }}
        >
          Promijeni
        </button>
      </Row>
      <Row title="Sva izdanja" text="Ako automatsko ažuriranje ne uspije, nova verzija se može preuzeti ručno.">
        <button className="btn small ghost" onClick={() => void api.openExternal(app.releasesUrl)}>
          Otvori
        </button>
      </Row>
      <button className="link-btn" onClick={() => openDialog({ kind: 'settings', tab: 'env' })}>
        Okruženje →
      </button>
    </div>
  )
}
