import { t as uiText, localize, format, currentLanguage } from '../lib/i18n'
import { AudioLines, Check, Circle, Cpu, KeyRound, LogOut, Monitor, Moon, Plug, Plus, RefreshCw, Settings2, Sparkles, Square, Sun, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type {
  Agent,
  Background,
  ClaudeAuth,
  ClaudeDesktopStatus,
  ClaudeStatus,
  Component,
  ComponentState,
  ElevenLabsCheck,
  ElevenLabsUsage,
  KeyCheck,
  MediaItem,
  PlanUsage,
  ProjectMeta,
  Settings,
  Theme,
  VoiceProvider,
  VideoEncoderInfo,
  VoiceSettings,
} from '../../../shared/types'
import { DEFAULT_TONE, TONES } from '../../../shared/tone'
import { DEFAULT_EL_MODEL, EL_MODELS } from '../../../shared/voice'
import { api } from '../lib/api'
import { LANGUAGES, languageName } from '../lib/languages'
import { encodeWav } from '../lib/audio'
import { resetTime } from '../lib/time'
import {
  canEdit,
  studying,
  closeDialog,
  errorText,
  installComponent,
  openDialog,
  refreshClaude,
  refreshUsage,
  renderNow,
  startTour,
  switchMode,
  toast,
  updateMeta,
  updateSettings,
  useStore,
} from '../store'
import { ModelControls, usageLevel } from './ChatPane'
import { RevoiceButton, useOutdatedVoice, voiceLabel } from './Revoice'
import { VoicePicker } from './VoicePicker'
import { useRecorder } from './RecordingBooth'
import { Modal, ProgressLine, Tabs } from './ui'

type Tab = 'account' | 'accounts' | 'voice' | 'video' | 'env' | 'about' | 'develop'

export function SettingsDialog() {
  const dialog = useStore((s) => s.dialog)
  const open = dialog?.kind === 'settings'
  const developerMode = useStore((s) => s.settings?.developerMode)
  const [tab, setTab] = useState<Tab>('account')
  useEffect(() => {
    if (dialog?.kind === 'settings') setTab(dialog.tab ?? 'account')
  }, [dialog])

  return (
    <Modal open={open} onClose={closeDialog} title={uiText('Settings')} icon={<Settings2 className="head-icon" />} width={780} className="settings-modal">
      <div className="settings-tabs">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'account', label: 'Agent' },
            { value: 'accounts', label: 'Accounts' },
            { value: 'voice', label: 'Voice' },
            { value: 'video', label: 'Video' },
            { value: 'env', label: 'Environment' },
            { value: 'about', label: 'General' },
            ...(developerMode ? [{ value: 'develop' as const, label: 'Develop' }] : []),
          ]}
        />
      </div>
      <div className="modal-body settings-body">
        {tab === 'account' && <AgentTab />}
        {tab === 'accounts' && <AccountsTab />}
        {tab === 'voice' && <VoiceTab />}
        {tab === 'video' && <VideoTab />}
        {tab === 'env' && <EnvTab />}
        {tab === 'about' && <AboutTab />}
        {tab === 'develop' && <DevelopTab onDisable={() => setTab('about')} />}
      </div>
    </Modal>
  )
}

function Row(props: { title: ReactNode; text?: ReactNode; children?: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-row-text">
        <div className="set-row-title">{localize(props.title)}</div>
        {props.text && <div className="hint">{localize(props.text)}</div>}
      </div>
      <div className="set-row-control">{props.children}</div>
    </div>
  )
}

/** An API key: once saved it shows as saved (it never comes back to the window), with Replace and Remove. */
function KeyField(props: { saved: boolean; placeholder: string; onSave: (key: string) => Promise<void> }) {
  const [key, setKey] = useState('')
  const [replacing, setReplacing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await props.onSave(key.trim())
      setKey('')
      setReplacing(false)
    } catch (e) {
      setError(errorText(e)) // the key stays typed in, to fix its permissions and save it again
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div className="inline-form">
        {props.saved && (
          <span className="badge mint">
            <Check /> {uiText(' Key saved')}
          </span>
        )}
        <button className="btn small" onClick={() => setReplacing(true)}>
          <KeyRound /> {props.saved ? uiText('Replace key') : uiText('Add key')}
        </button>
        {props.saved && (
          <button className="btn small ghost" onClick={() => void props.onSave('')}>
            {uiText('Remove')}
          </button>
        )}
      </div>
      <Modal
        open={replacing}
        onClose={() => {
          setReplacing(false)
          setKey('')
          setError(null)
        }}
        title={uiText('Add API key')}
        width={460}
      >
        <div className="modal-body set-group">
          <p className="hint">{uiText('The key is checked and stored encrypted on this computer.')}</p>
          <input
            className="input"
            aria-label={uiText('API key')}
            data-autofocus
            type="password"
            autoComplete="off"
            placeholder={props.placeholder}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && key.trim() && !busy && void save()}
          />
          {error && (
            <p className="key-error" role="alert">
              {error}
            </p>
          )}
          <button className="btn primary" disabled={!key.trim() || busy} onClick={() => void save()}>
            {busy ? uiText('Checking…') : uiText('Save key')}
          </button>
        </div>
      </Modal>
    </>
  )
}

const planName = (plan?: string) => (plan ? plan[0].toUpperCase() + plan.slice(1) : '')

/** Settings → Agent: who writes the scenes, Claude, Codex (ADR 0022) or Antigravity (ADR 0031), and its model. Sign-ins are under Accounts. */
function AgentTab() {
  const agent = useStore((s) => s.settings!.agent)
  const settings = useStore((s) => s.settings)!
  const models = useStore((s) => s.models)
  const status = useStore((s) => s.claude)
  const signedIn = !!status?.loggedIn
  const seriesAgents = useStore((s) => s.settings!.seriesAgents)
  const pick = async (next: Agent) => {
    await updateSettings({ agent: next })
    await refreshClaude()
  }
  return (
    <div className="set-group">
      <Row
        title={uiText('Agent')}
        text={uiText(
          'Who writes the scenes, solves exercises and makes series episodes. Quick mode, series planning and translation use it too. Switching starts a new conversation.',
        )}
      >
        <Tabs
          radio="Agent"
          value={agent}
          onChange={(v) => void pick(v)}
          items={[
            { value: 'claude', label: 'Claude' },
            { value: 'codex', label: 'Codex' },
            { value: 'antigravity', label: 'Antigravity' },
          ]}
        />
      </Row>
      {!status ? (
        <Row title={uiText('Checking account…')} />
      ) : signedIn ? (
        <Row title={uiText('Model and effort')} text={uiText('Which model writes the scenes and how much it reasons first. Also under the chat box.')}>
          <ModelControls />
        </Row>
      ) : (
        <Row title={format('{0} isn’t signed in', [AGENT_NAMES[agent]])} text={uiText('Sign in, or add an API key, under Accounts.')}>
          <button className="btn small primary" onClick={() => openDialog({ kind: 'settings', tab: 'accounts' })}>
            <KeyRound /> {uiText(' Accounts')}
          </button>
        </Row>
      )}
      <Row
        title={uiText('Agents at once')}
        text={uiText(
          'How many agents an unattended series or an exercise set runs at once: for a series, one writes the scripts in order and the others make each video as soon as its script is ready. More is faster, but uses your plan’s limits faster and renders more at once on this computer.',
        )}
      >
        <Tabs
          radio="Agents at once"
          value={String(seriesAgents || 3)}
          onChange={(v) => void updateSettings({ seriesAgents: Number(v) })}
          items={['1', '2', '3', '4'].map((n) => ({ value: n, label: n }))}
        />
      </Row>
      {agent === 'codex' && signedIn && (
        <Row
          title={uiText('When an OpenAI model is busy')}
          text={uiText(
            'For chat and background video turns: retry once, then use this model on the same account. Account limits, sign-in errors and interrupted tool work never trigger a model switch. Episode model comparisons keep their assigned model.',
          )}
        >
          <select
            className="input"
            aria-label={uiText('OpenAI fallback model')}
            value={settings.codexFallbackModel ?? ''}
            onChange={(e) => void updateSettings({ codexFallbackModel: e.target.value })}
          >
            <option value="">{uiText('No automatic fallback')}</option>
            {models
              .filter((m) => m.value && m.value !== settings.codexModel)
              .map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            {settings.codexFallbackModel && !models.some((m) => m.value === settings.codexFallbackModel && m.value !== settings.codexModel) && (
              <option value={settings.codexFallbackModel}>{settings.codexFallbackModel}</option>
            )}
          </select>
        </Row>
      )}
    </div>
  )
}

const AGENT_NAMES: Record<Agent, string> = { claude: 'Claude', codex: 'Codex', antigravity: 'Antigravity' }
const accountStatus = new Map<string, ClaudeStatus>()

/**
 * Settings → Accounts: every agent's sign-in and API key, whether it's the chosen one or not, so
 * someone with several can keep them all ready and switch in Settings → Agent; and the voice's key.
 */
function AccountsTab() {
  return (
    <div className="set-group">
      {(['claude', 'codex', 'antigravity'] as const).map((a) => (
        <AgentAccount key={a} agent={a} />
      ))}
      <ElevenLabsAccount />
      <ClaudeDesktopRow />
      <DesktopConnections />
    </div>
  )
}

/** One agent's account: whether it writes the scenes now, and its sign-in, read for that agent. */
export function AgentAccount({ agent }: { agent: Agent }) {
  const chosen = useStore((s) => s.settings!.agent === agent)
  const keys = useStore((s) =>
    [
      s.settings!.hasAnthropicKey,
      s.settings!.hasOpenAIKey,
      s.settings!.hasGeminiKey,
      s.settings!.claudeAuth,
      s.settings!.codexAuth,
      s.settings!.antigravityAuth,
    ].join(),
  )
  const installs = useStore((s) => `${s.setup?.codex}:${s.setup?.antigravity}`)
  const cacheKey = `${agent}:${keys}:${installs}`
  const [loaded, setLoaded] = useState<{ key: string; status: ClaudeStatus } | null>(() => {
    const status = accountStatus.get(cacheKey)
    return status ? { key: cacheKey, status } : null
  })
  const status = loaded?.key === cacheKey ? loaded.status : (accountStatus.get(cacheKey) ?? null)
  const accept = (status: ClaudeStatus) => {
    accountStatus.set(cacheKey, status)
    setLoaded({ key: cacheKey, status })
  }
  const refresh = async () => {
    accept(await api.claudeStatus(agent))
    if (chosen) await refreshClaude()
  }
  useEffect(() => {
    let active = true
    void api.claudeStatus(agent).then(
      (status) => active && accept(status),
      (e) => active && accept({ loggedIn: false, error: errorText(e) }),
    )
    return () => {
      active = false
    }
  }, [cacheKey])
  return (
    <section className="account-section">
      <header className="account-head">
        <strong>{AGENT_NAMES[agent]}</strong>
        {status ? (
          status.loggedIn ? (
            <span className="badge mint">{uiText(' Ready')}</span>
          ) : (
            <span className="badge">{uiText('Not set up')}</span>
          )
        ) : (
          <span className="badge">{uiText('Checking…')}</span>
        )}
        <span className="account-head-end">{chosen && <span className="badge">{uiText('Selected in Agent')}</span>}</span>
      </header>
      {!status ? (
        <div className="account-loading hint" role="status">
          <span className="spinner" /> {uiText('Checking account…')}
        </div>
      ) : agent === 'codex' ? (
        <CodexAccount status={localize(status)} refresh={refresh} />
      ) : agent === 'antigravity' ? (
        <AntigravityAccount status={localize(status)} refresh={refresh} />
      ) : (
        <ClaudeAccount status={localize(status)} refresh={refresh} chosen={chosen} />
      )}
    </section>
  )
}

type AccountProps = { status: ClaudeStatus | null; refresh: () => Promise<void> }

/** How an agent signs in: its account or an API key. One choice shows its own part; the other is hidden. */
function AuthSwitch(props: {
  agent: string
  account: string
  value: ClaudeAuth
  onChange: (auth: ClaudeAuth) => void | Promise<void>
  accountText: string
  keyText: string
}) {
  return (
    <Row title={`Use ${props.agent} with`} text={props.value === 'api-key' ? props.keyText : props.accountText}>
      <Tabs
        radio={`Use ${props.agent} with`}
        value={props.value}
        onChange={(v) => void props.onChange(v)}
        items={[
          { value: 'account', label: props.account },
          { value: 'api-key', label: 'API key' },
        ]}
      />
    </Row>
  )
}

/** The ElevenLabs key, the same one Settings → Voice shows. */
export function ElevenLabsAccount() {
  const settings = useStore((s) => s.settings)!
  return (
    <section className="account-section">
      <header className="account-head">
        <strong>{uiText('ElevenLabs')}</strong>
        {settings.hasElevenLabsKey ? <span className="badge mint">{uiText(' Ready')}</span> : <span className="badge">{uiText('Not set up')}</span>}
        <span className="account-head-end hint">{uiText('For narration')}</span>
      </header>
      <Row
        title={uiText('ElevenLabs API key')}
        text={
          settings.hasElevenLabsKey
            ? uiText('Saved and encrypted on this computer.')
            : uiText('A key from elevenlabs.io → Developers → API keys, for its voices.')
        }
      >
        <KeyField
          saved={settings.hasElevenLabsKey}
          placeholder={uiText('sk_…')}
          onSave={async (key) => {
            useStore.setState({ settings: await api.setElevenLabsKey(key), elevenLabsCheck: null })
            toast(key ? 'API key saved' : 'API key removed', 'ok')
          }}
        />
      </Row>
      {settings.hasElevenLabsKey && <ElevenLabsStatus />}
    </section>
  )
}

/** Codex: its program, installed once; the ChatGPT sign-in or an OpenAI API key; model and effort. */
function CodexAccount({ status, refresh }: AccountProps) {
  const settings = useStore((s) => s.settings)!
  const setup = useStore((s) => s.setup)
  const [busy, setBusy] = useState(false)
  const installed = setup?.codex === 'ready'
  const auth = settings.codexAuth ?? (settings.hasOpenAIKey ? 'api-key' : 'account') // as codex.ts reads it

  const login = async () => {
    setBusy(true)
    try {
      await api.claudeLogin('codex')
      await refresh()
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Row
        title={uiText('Program')}
        text={uiText("OpenAI's coding agent. Its program, about 140 MB, is downloaded once from OpenAI's npm package and checked against its published hash.")}
      >
        <InstallButton component="codex" state={setup?.codex ?? 'missing'} />
      </Row>
      {installed && (
        <AuthSwitch
          agent="Codex"
          account="ChatGPT account"
          value={auth}
          onChange={async (codexAuth) => {
            await updateSettings({ codexAuth })
            await refresh()
          }}
          accountText="Your ChatGPT account, signed in in your browser. Usage counts against your plan."
          keyText="Your own OpenAI API key, billed per use to its platform.openai.com account."
        />
      )}
      {installed && auth === 'account' && (
        <div className={`account-card ${status?.loggedIn ? 'on' : ''}`}>
          <Sparkles />
          <div>
            <strong>{status?.loggedIn ? uiText('Signed in') : uiText('Not signed in')}</strong>
            <div className="hint">{status?.loggedIn ? status.subscription : uiText('Sign-in opens in your browser.')}</div>
          </div>
          {status?.loggedIn ? (
            <button
              className="btn ghost small"
              onClick={async () => {
                await api.claudeLogout('codex')
                await refresh()
              }}
            >
              <LogOut /> {uiText(' Sign out')}
            </button>
          ) : (
            <button className="btn primary small" disabled={busy} onClick={() => void login()}>
              {busy && <span className="spinner" />} {uiText(' Sign in with ChatGPT')}
            </button>
          )}
        </div>
      )}
      {installed && auth === 'api-key' && (
        <Row title="OpenAI API key" text={settings.hasOpenAIKey ? 'Saved and encrypted on this computer.' : 'A key from platform.openai.com → API keys.'}>
          <KeyField
            saved={settings.hasOpenAIKey}
            placeholder={uiText('sk-…')}
            onSave={async (key) => {
              useStore.setState({ settings: await api.setOpenAIKey(key) })
              await refresh()
              toast(key ? 'API key saved' : 'API key removed', 'ok')
            }}
          />
        </Row>
      )}
      {installed && auth === 'api-key' && settings.hasOpenAIKey && (
        <KeyStatus check={(again) => api.checkOpenAIKey(again)} fix="platform.openai.com → API keys" />
      )}
    </>
  )
}

/** Settings → Accounts → Antigravity (ADR 0031): install the CLI, then the Google sign-in or a Gemini API key. */
function AntigravityAccount({ status, refresh }: AccountProps) {
  const settings = useStore((s) => s.settings)!
  const setup = useStore((s) => s.setup)
  const windows = useStore((s) => s.app?.platform === 'win32') // its sign-in opens in a console window there
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const installed = setup?.antigravity === 'ready'
  const auth = settings.antigravityAuth ?? (settings.hasGeminiKey ? 'api-key' : 'account') // as antigravity.ts reads it
  useEffect(() => api.on('claude-login', (e) => e.url && setUrl(e.url)), [])

  const login = async () => {
    setBusy(true)
    setUrl(null)
    setCode('')
    try {
      const st = await api.claudeLogin('antigravity')
      await refresh()
      if (!st.loggedIn) toast('The Google sign-in wasn’t completed.', 'error')
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy(false)
      setUrl(null)
    }
  }

  return (
    <>
      <Row
        title={uiText('Program')}
        text={uiText(
          "Google's coding agent, with Gemini 4 Argon. Its program is downloaded once (about 60 MB, 180 MB unpacked) from Google's GitHub release and checked against its published hash. It works only inside the project.",
        )}
      >
        <InstallButton component="antigravity" state={setup?.antigravity ?? 'missing'} />
      </Row>
      {installed && (
        <AuthSwitch
          agent="Antigravity"
          account="Google account"
          value={auth}
          onChange={async (antigravityAuth) => {
            await updateSettings({ antigravityAuth })
            await refresh()
          }}
          accountText="Your Google account. Usage counts against your Google AI plan."
          keyText="Your own Gemini API key, billed per use to its aistudio.google.com account."
        />
      )}
      {installed && auth === 'account' && (
        <div className={`account-card ${status?.loggedIn ? 'on' : ''}`}>
          <Sparkles />
          <div>
            <strong>{status?.loggedIn ? uiText('Signed in') : uiText('Not signed in')}</strong>
            <div className="hint">
              {status?.loggedIn ? status.subscription : uiText(windows ? 'Sign-in opens in a window of its own.' : 'Sign-in opens in your browser.')}
            </div>
          </div>
          {status?.loggedIn ? (
            <button
              className="btn ghost small"
              onClick={async () => {
                await api.claudeLogout('antigravity')
                await refresh()
              }}
            >
              <LogOut /> {uiText(' Sign out')}
            </button>
          ) : (
            <button className="btn primary small" disabled={busy} onClick={() => void login()}>
              {busy && <span className="spinner" />} {uiText(' Sign in with Google')}
            </button>
          )}
        </div>
      )}
      {busy && !status?.loggedIn && (
        <div className="code-entry">
          {url ? (
            <>
              <p className="hint">
                <a href="#" onClick={() => void api.openExternal(url)}>
                  {uiText('Open the Google sign-in')}
                </a>
                {uiText(', then paste the code it shows:')}
              </p>
              <input className="input mono" placeholder={uiText('Authorization code')} value={code} onChange={(e) => setCode(e.target.value)} />
              <button className="btn" disabled={!code.trim()} onClick={() => void api.claudeLoginCode(code, 'antigravity')}>
                {uiText('Confirm')}
              </button>
            </>
          ) : (
            <p className="hint">
              {windows
                ? uiText(
                    'In the Antigravity window: choose Google OAuth, sign in in the browser and paste the code there. It closes by itself once you’re signed in.',
                  )
                : uiText('Starting the sign-in…')}
            </p>
          )}
        </div>
      )}
      {installed && auth === 'api-key' && (
        <Row title="Gemini API key" text={settings.hasGeminiKey ? 'Saved and encrypted on this computer.' : 'A key from aistudio.google.com → API keys.'}>
          <KeyField
            saved={settings.hasGeminiKey}
            placeholder={uiText('AIza…')}
            onSave={async (key) => {
              useStore.setState({ settings: await api.setGeminiKey(key) })
              await refresh()
              toast(key ? 'API key saved' : 'API key removed', 'ok')
            }}
          />
        </Row>
      )}
      {installed && auth === 'api-key' && settings.hasGeminiKey && (
        <KeyStatus check={(again) => api.checkGeminiKey(again)} fix="aistudio.google.com → API keys" />
      )}
    </>
  )
}

/** Claude: its own account's sign-in (Claude Code's) or an Anthropic API key; the plan's limits when it's the chosen agent. */
function ClaudeAccount({ status: claude, refresh, chosen }: AccountProps & { chosen: boolean }) {
  const settings = useStore((s) => s.settings)!
  const usage = useStore((s) => s.usage)
  const [busy, setBusy] = useState(false)
  const apiKey = settings.claudeAuth === 'api-key'

  useEffect(() => void (chosen && refreshUsage(true)), [chosen])

  const setAuth = async (claudeAuth: ClaudeAuth) => {
    await updateSettings({ claudeAuth })
    await refresh()
  }

  const login = async () => {
    setBusy(true)
    try {
      await api.claudeLogin('claude')
      await refresh()
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const saveKey = async (key: string) => {
    useStore.setState({ settings: await api.setAnthropicKey(key) })
    await refresh()
    toast(key ? 'API key saved' : 'API key removed', 'ok')
  }

  return (
    <>
      <AuthSwitch
        agent="Claude"
        account="Claude account"
        value={settings.claudeAuth}
        onChange={setAuth}
        accountText="Your Claude account. Usage counts against your plan, shared with claude.ai and Claude Desktop."
        keyText="Your own Anthropic API key, billed per use to its Console account."
      />

      {apiKey ? (
        <>
          <Row
            title="Anthropic API key"
            text={settings.hasAnthropicKey ? 'Saved and encrypted on this computer.' : 'A key from console.anthropic.com → API keys.'}
          >
            <div className="inline-form">
              <KeyField saved={settings.hasAnthropicKey} placeholder={uiText('sk-ant-…')} onSave={saveKey} />
            </div>
          </Row>
          {settings.hasAnthropicKey && <KeyStatus check={(again) => api.checkAnthropicKey(again)} fix="console.anthropic.com → API keys" />}
        </>
      ) : (
        <>
          <div className={`account-card ${claude?.loggedIn ? 'on' : ''}`}>
            <Sparkles />
            <div>
              <strong>{claude?.loggedIn ? (claude.email ?? uiText('Signed in')) : uiText('Not signed in')}</strong>
              <div className="hint">
                {claude?.loggedIn
                  ? format('Claude {0}', [planName(claude.subscription)])
                  : uiText('Studio runs Claude Code with your own Claude account. Sign-in opens in your browser.')}
              </div>
            </div>
            {claude?.loggedIn ? (
              <button
                className="btn ghost small"
                onClick={async () => {
                  await api.claudeLogout('claude')
                  await refresh()
                }}
              >
                <LogOut /> {uiText(' Sign out')}
              </button>
            ) : (
              <button className="btn primary small" disabled={busy} onClick={() => void login()}>
                {busy && <span className="spinner" />} {uiText(' Sign in')}
              </button>
            )}
          </div>
          {chosen && usage && <PlanUsageList usage={usage} />}
        </>
      )}
    </>
  )
}

/** Every limit of the plan, with when it resets. */
function PlanUsageList({ usage }: { usage: PlanUsage }) {
  return (
    <div className="plan-usage">
      <div className="eyebrow">{uiText('Plan usage · shared with claude.ai and Claude Desktop')}</div>
      {usage.windows.map((w) => (
        <div key={w.label} className={`plan-usage-row ${usageLevel(w.percent)}`}>
          <span>{uiText(w.label)}</span>
          <span className="usage-bar">
            <span style={{ width: `${Math.min(100, w.percent)}%` }} />
          </span>
          <span className="mono">{Math.round(w.percent)}%</span>
          <span className="hint">{w.resetsAt ? format('resets {0}', [resetTime(w.resetsAt, currentLanguage())]) : ''}</span>
        </div>
      ))}
    </div>
  )
}

/** Installs the Claude Desktop extension, or says it's there (Claude Desktop's own records, re-read on focus). */
function DesktopConnections() {
  const [open, setOpen] = useState(false)
  const [config, setConfig] = useState('')
  const [codexCommand, setCodexCommand] = useState('')
  return (
    <>
      <Row
        title={uiText('Codex / ChatGPT Desktop')}
        text={uiText(
          'Make videos from your conversation through the local Studio plugin. Learn returns a video to the chat; Create opens the editor. In Both, requests default to Learn unless production is requested.',
        )}
      >
        <button
          className="btn small"
          onClick={() => {
            setOpen(true)
            void api.desktopConnection().then((c) => {
              setConfig(c.config)
              setCodexCommand(c.codexCommand)
            })
          }}
        >
          <Plug /> {uiText('Connect')}
        </button>
      </Row>
      <Modal open={open} onClose={() => setOpen(false)} title={uiText('Connect a desktop assistant')} width={600}>
        <div className="modal-body set-group">
          <p className="hint">
            {uiText(
              'Import the Studio plugin ZIP in a desktop client with local plugin support. It requires Node.js 18 or later. For Codex, you can also add a stdio MCP server using the configuration below. Restart the connection after updating Studio.',
            )}
          </p>
          <button className="btn primary" onClick={() => void api.showDesktopPlugin()}>
            {uiText('Show plugin ZIP')}
          </button>
          <pre className="env-log mono">{config}</pre>
          <button
            className="btn small"
            onClick={() => void navigator.clipboard.writeText(codexCommand).then(() => toast(uiText('Configuration copied'), 'ok'))}
          >
            {uiText('Copy Codex setup command')}
          </button>
          <button className="btn small" onClick={() => void navigator.clipboard.writeText(config).then(() => toast('Configuration copied', 'ok'))}>
            {uiText('Copy configuration')}
          </button>
          <p className="hint">
            {uiText(
              'Use local chats. ChatGPT web needs a hosted connection; this integration runs only on your computer. Video playback inside the chat depends on the client; every completed video is also in your Studio library.',
            )}
          </p>
        </div>
      </Modal>
    </>
  )
}

function ClaudeDesktopRow() {
  const [status, setStatus] = useState<ClaudeDesktopStatus | null>(null)
  useEffect(() => {
    const check = () => void api.claudeDesktopStatus().then(setStatus)
    check()
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [])
  const outdated = !!status?.installed && status.version !== status.current
  const text = !status?.installed
    ? 'Ask Claude Desktop to make a video from your discussion. Learn works in the background; Create opens the editor. The video is returned as a chat resource and saved in your library. Install the extension to connect.'
    : outdated
      ? format('Claude Desktop has version {0} of the extension and this app ships {1}. Update it so both have the same tools.', [
          status.version,
          status.current,
        ])
      : status.enabled
        ? 'The Manim Studio extension is installed. Ask Claude in the Claude desktop app for a maths video.'
        : 'The extension is installed but turned off. Turn it on in Claude Desktop → Settings → Extensions.'
  return (
    <Row title={uiText('Claude Desktop')} text={text}>
      {status?.installed && !outdated ? (
        <span className={`badge ${status.enabled ? 'mint' : ''}`}>
          <Check /> {status.enabled ? uiText('Installed') : uiText('Turned off')}
        </span>
      ) : (
        <button className="btn small" onClick={() => void api.installClaudeExtension().catch((e) => toast(errorText(e), 'error'))}>
          <Plug /> {outdated ? uiText('Update in Claude Desktop') : uiText('Connect')}
        </button>
      )}
    </Row>
  )
}

const PROVIDERS: { value: VoiceProvider; title: string; text: string; icon: ReactNode }[] = [
  { value: 'elevenlabs', title: 'ElevenLabs', text: 'The most natural voices. Paid per character.', icon: <AudioLines /> },
  { value: 'omnivoice', title: 'OmniVoice', text: 'Local and free, 600+ languages, clones your voice from a short clip.', icon: <Cpu /> },
]

// The themes' own backgrounds (python/studio/brand.py), shown until the project picks its own.
const THEME_BG: Record<Theme, string> = { dark: '#0b1626', light: '#f7f8fa' }

/** The open project's look: theme, background colours, a background picture. Changes re-render the preview. */
function VideoTab() {
  const settings = useStore((s) => s.settings)!
  const project = useStore((s) => s.project)
  const editing = useStore((s) => !studying(s))
  return (
    <div className="set-group">
      {
        <Row
          title={uiText('Export quality')}
          text={uiText(
            'The size of the videos Studio makes for you to study: exercises, follow-ups and courses. 720p renders about twice as fast and is plenty on a laptop; 1080p is sharper on a big screen.',
          )}
        >
          <Tabs
            radio="Study videos"
            value={String(settings.studySize ?? (settings.mode === 'create' ? 1080 : 720))}
            onChange={(v) => void updateSettings({ studySize: Number(v) as 720 | 1080 })}
            items={[
              { value: '720', label: '720p' },
              { value: '1080', label: '1080p' },
            ]}
          />
        </Row>
      }

      <Row title={uiText('Aspect ratio')} text={uiText('Used for new videos. Existing videos keep their layout.')}>
        <Tabs
          radio="Aspect ratio"
          value={settings.defaultAspect ?? '16:9'}
          onChange={(defaultAspect) => void updateSettings({ defaultAspect })}
          items={[
            { value: '16:9', label: '16:9 landscape' },
            { value: '9:16', label: '9:16 portrait' },
          ]}
        />
      </Row>
      <Row title={uiText('Video theme')}>
        <Tabs
          radio="Video theme"
          value={settings.defaultTheme ?? 'dark'}
          onChange={(defaultTheme) => void updateSettings({ defaultTheme })}
          items={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
        />
      </Row>
      <Row title={uiText('Background type')}>
        <Tabs
          radio="Background type"
          value={settings.defaultBackground && Object.values(settings.defaultBackground).some(Boolean) ? 'custom' : 'theme'}
          onChange={(value) => void updateSettings({ defaultBackground: value === 'theme' ? {} : { dark: THEME_BG.dark, light: THEME_BG.light } })}
          items={[
            { value: 'theme', label: 'Theme background' },
            { value: 'custom', label: 'Custom colour' },
          ]}
        />
      </Row>
      <Row title={uiText('Background colour')} text={uiText('Default background for new videos.')}>
        <input
          aria-label={uiText('Default background colour')}
          type="color"
          value={settings.defaultBackground?.[settings.defaultTheme ?? 'dark'] ?? THEME_BG[settings.defaultTheme ?? 'dark']}
          onChange={(e) => void updateSettings({ defaultBackground: { ...settings.defaultBackground, [settings.defaultTheme ?? 'dark']: e.target.value } })}
        />
      </Row>
      {project && <ProjectVideo />}
      {editing && (
        <>
          <Row
            title={uiText('Preview quality')}
            text={uiText(
              'The preview while you work: higher is sharper, but renders take longer. Exports have their own size: the one chosen in the export dialog, or Study videos above for videos made to study.',
            )}
          >
            <div className="stack-controls">
              <Tabs
                radio="Preview resolution"
                value={String(settings.previewSize)}
                onChange={(v) => void updateSettings({ previewSize: Number(v) as Settings['previewSize'] }).then(() => project && renderNow())}
                items={[
                  { value: '480', label: '480p' },
                  { value: '720', label: '720p' },
                  { value: '1080', label: '1080p' },
                ]}
              />
              <Tabs
                radio="Preview frame rate"
                value={String(settings.previewFps)}
                onChange={(v) => void updateSettings({ previewFps: Number(v) as Settings['previewFps'] }).then(() => project && renderNow())}
                items={[
                  { value: '15', label: '15 fps' },
                  { value: '24', label: '24 fps' },
                  { value: '30', label: '30 fps' },
                ]}
              />
            </div>
          </Row>

          <Row title={uiText('Render on save')}>
            <label className="switch">
              <input type="checkbox" checked={settings.autoRender} onChange={(e) => void updateSettings({ autoRender: e.target.checked })} />
              <span />
            </label>
          </Row>
          <GpuEncoding />
          <RenderServers />
        </>
      )}
    </div>
  )
}

function ProjectVideo() {
  const project = useStore((s) => s.project)
  const [pictures, setPictures] = useState<MediaItem[]>([])
  const [colours, setColours] = useState<Background>({})
  const timer = useRef<number>(undefined)

  useEffect(() => {
    if (!project) return
    setColours(project.meta.background ?? {})
    void api.listMedia().then((items) => setPictures(items.filter((i) => i.kind === 'image')))
  }, [project?.path])

  if (!project) return <p className="hint">{uiText('Open a project to set its theme and background.')}</p>
  const meta = project.meta
  const background = meta.background ?? {}
  const save = async (patch: Partial<ProjectMeta>) => {
    await updateMeta(patch)
    void renderNow()
  }
  // The colour picker reports every drag step; save once it settles.
  const pickColour = (theme: Theme, colour: string | undefined) => {
    const next = { ...colours, [theme]: colour }
    setColours(next)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void save({ background: { ...background, ...next, [theme]: colour } }), 500)
  }

  return (
    <div className="set-group">
      <div className="eyebrow">
        {uiText('Video of “')}
        {meta.name}”
      </div>
      <Row title={uiText('Theme')} text={uiText('Text and accent colours. Export can make the other version too.')}>
        <Tabs
          radio="Theme"
          value={meta.theme}
          onChange={(theme) => void save({ theme })}
          items={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
        />
      </Row>
      <Row
        title={uiText('Script first')}
        text={uiText(
          "Claude plans the video in a script (the idea, each section's narration and visuals) and waits for your approval before writing the code.",
        )}
      >
        <Tabs
          radio="Script first"
          value={meta.scriptFirst ? 'on' : 'off'}
          onChange={(v) => void updateMeta({ scriptFirst: v === 'on' })}
          items={[
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
        />
      </Row>
      <Row title={uiText('Background colour')} text={uiText("Each theme's background, if you want another than its own. Keep text readable.")}>
        <div className="bg-colours">
          {(['dark', 'light'] as Theme[]).map((t) => (
            <label key={t} className="bg-colour">
              <input
                type="color"
                value={colours[t] ?? THEME_BG[t]}
                onChange={(e) => pickColour(t, e.target.value)}
                aria-label={format('{0} background', [t])}
              />
              <span>{t === 'dark' ? uiText('Dark') : uiText('Light')}</span>
              {colours[t] && (
                <button className="link-btn" onClick={() => pickColour(t, undefined)}>
                  {uiText('Reset')}
                </button>
              )}
            </label>
          ))}
        </div>
      </Row>
      <Row
        title={uiText('Background picture')}
        text={uiText("A picture from the project's media, covering the frame behind everything. Add pictures in the Media tab.")}
      >
        <select
          className="select"
          value={background.image ?? ''}
          onChange={(e) => void save({ background: { ...background, image: e.target.value || undefined } })}
        >
          <option value="">{uiText('None')}</option>
          {pictures.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </Row>
    </div>
  )
}

/** The open video's voice, or the default that new projects start with. */
function VoiceTab() {
  const project = useStore((s) => s.project)
  const settings = useStore((s) => s.settings)!
  const [scope, setScope] = useState<'project' | 'default'>('project')
  const forProject = !!project && scope === 'project'

  return (
    <div className="set-group">
      {project ? (
        <Row
          title={uiText('Voice for')}
          text={forProject ? format('Only “{0}”.', [project.meta.name]) : uiText('What new projects start with; each can then pick its own.')}
        >
          <Tabs
            radio="Voice for"
            value={scope}
            onChange={setScope}
            items={[
              { value: 'project', label: 'This video' },
              { value: 'default', label: 'New projects' },
            ]}
          />
        </Row>
      ) : (
        <div className="eyebrow">{uiText('Default voice for new projects')}</div>
      )}
      <VoiceForm
        voice={forProject ? project.meta.voice : settings.defaultVoice}
        inProject={forProject}
        onChange={(voice) => void (forProject ? updateMeta({ voice }) : updateSettings({ defaultVoice: voice }))}
      />
      <Row title={uiText('Tone')} text={uiText('How the narration talks.')}>
        <Tabs
          radio="Tone"
          value={(forProject ? project.meta.tone : settings.defaultTone) ?? DEFAULT_TONE}
          onChange={(tone) => void (forProject ? updateMeta({ tone }) : updateSettings({ defaultTone: tone }))}
          items={TONES.map((t) => ({ value: t.value, label: t.label }))}
        />
      </Row>
      {forProject && <RevoiceRow />}
    </div>
  )
}

/** After a voice change: the narration still has the old voice until the next render. */
function RevoiceRow() {
  const outdated = useOutdatedVoice()
  if (!outdated) return null
  const credit = outdated.to.provider === 'elevenlabs' ? ` That uses up to ${outdated.characters.toLocaleString('en')} ElevenLabs characters.` : ''
  return (
    <div className="revoice">
      <Row
        title={uiText('The narration still has the old voice')}
        text={format('It was made with {0}. Re-voicing speaks it again; your recordings stay.{1}', [voiceLabel(outdated.from), credit])}
      >
        <RevoiceButton className="btn primary small" />
      </Row>
    </div>
  )
}

/** Language, provider and voice: in Settings → Voice and in the new-project dialog. */
/** What's missing before this voice can speak, or null when it's ready. */
export function voiceProblem(voice: VoiceSettings | undefined, hasKey: boolean, omnivoice?: ComponentState, check?: ElevenLabsCheck | null): string | null {
  if (!voice) return uiText('Choose a voice for the narration.')
  if (voice.provider === 'elevenlabs' && !hasKey) return uiText('Add your ElevenLabs API key for the narration.')
  if (voice.provider === 'elevenlabs' && check?.problem && !check.voices && !check.tts) return `${check.problem} Replace the key in Settings → Accounts.`
  if (voice.provider === 'elevenlabs' && check && (!check.tts || !check.voices))
    return `Your ElevenLabs key is missing ${[!check.tts && 'Text to Speech', !check.voices && 'Voices (Read)'].filter(Boolean).join(' and ')}: switch ${!check.tts && !check.voices ? 'them' : 'it'} on at elevenlabs.io → Developers → API keys, then check again in the voice settings.`
  if (voice.provider === 'elevenlabs' && !voice.elevenlabs?.voiceId) return uiText('Choose an ElevenLabs voice for the narration.')
  if (voice.provider === 'omnivoice' && omnivoice !== 'ready') return uiText('Install the OmniVoice model for the narration.')
  return null
}

export function VoiceForm({ voice, onChange, inProject }: { voice: VoiceSettings; onChange: (voice: VoiceSettings) => void; inProject: boolean }) {
  const [needsKey, setNeedsKey] = useState(false)
  const settings = useStore((s) => s.settings)!
  const setup = useStore((s) => s.setup)
  const save = (patch: Partial<VoiceSettings>) => onChange({ ...voice, ...patch })
  const el = voice.elevenlabs
  const modelId = el?.modelId ?? DEFAULT_EL_MODEL
  // A project made with a model no longer offered (e.g. Multilingual v2) keeps it until changed.
  const models = EL_MODELS.some((m) => m.id === modelId) ? EL_MODELS : [...EL_MODELS, { id: modelId, label: modelId }]

  const languages = LANGUAGES.includes(voice.language) ? LANGUAGES : [voice.language, ...LANGUAGES]

  // A new language, or no voice yet: start with the language's own voice (elevenLabsDefaultVoice).
  const latest = useRef(voice)
  latest.current = voice
  const pickFor = async (language: string) => {
    const v = await api.elevenLabsDefaultVoice(language).catch(() => null)
    const now = latest.current
    if (!v || now.language !== language || now.provider !== 'elevenlabs') return
    onChange({ ...now, elevenlabs: { modelId: now.elevenlabs?.modelId ?? DEFAULT_EL_MODEL, voiceId: v.id, voiceName: v.name } })
  }
  useEffect(() => {
    if (voice.provider === 'elevenlabs' && !el?.voiceId && settings.hasElevenLabsKey) void pickFor(voice.language)
  }, [voice.provider, el?.voiceId, settings.hasElevenLabsKey])

  return (
    <>
      <Modal open={needsKey} onClose={() => setNeedsKey(false)} title={uiText('Connect ElevenLabs')} width={480}>
        <div className="modal-body set-group">
          <p className="hint">
            {uiText(
              'Add an ElevenLabs key in Accounts before selecting it. ElevenLabs provides natural voices and accurate timings; usage is billed by ElevenLabs.',
            )}
          </p>
          <button
            className="btn primary"
            onClick={() => {
              setNeedsKey(false)
              openDialog({ kind: 'settings', tab: 'accounts' })
            }}
          >
            {uiText('Open Accounts')}
          </button>
        </div>
      </Modal>
      <div className="provider-cards" role="radiogroup" aria-label={uiText('Voice')}>
        {PROVIDERS.map((p) => (
          <button
            key={p.value}
            role="radio"
            aria-checked={voice.provider === p.value}
            className={`provider-card ${voice.provider === p.value ? 'on' : ''}`}
            onClick={() => {
              if (p.value === 'elevenlabs' && !settings.hasElevenLabsKey) setNeedsKey(true)
              else save({ provider: p.value })
            }}
          >
            {p.icon}
            <strong>{p.title}</strong>
            <span className="hint">{localize(p.text)}</span>
          </button>
        ))}
      </div>

      <Row title={uiText('Narration language')} text={uiText('Claude writes the narration and on-screen text in it; voices and subtitles follow it.')}>
        <select
          className="select"
          value={voice.language}
          onChange={(e) => {
            save({ language: e.target.value })
            if (voice.provider === 'elevenlabs') void pickFor(e.target.value)
          }}
        >
          {languages.map((code) => (
            <option key={code} value={code}>
              {languageName.of(code)}
            </option>
          ))}
        </select>
      </Row>
      {voice.provider === 'elevenlabs' && (
        <>
          <Row
            title={uiText('Voice')}
            text={format('The most used voices in {0}, or search the library. ▶ plays a sample.', [languageName.of(voice.language)])}
          >
            <VoicePicker
              language={voice.language}
              hasKey={settings.hasElevenLabsKey}
              value={el?.voiceId ? { id: el.voiceId, name: el.voiceName } : undefined}
              onPick={(v) => save({ elevenlabs: { modelId, voiceId: v.id, voiceName: v.name } })}
            />
          </Row>
          <Row title={uiText('Model')}>
            <select
              className="select"
              value={modelId}
              onChange={(e) => save({ elevenlabs: { voiceId: el?.voiceId ?? '', voiceName: el?.voiceName, modelId: e.target.value } })}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {localize(m.label)}
                </option>
              ))}
            </select>
          </Row>
        </>
      )}

      {voice.provider === 'omnivoice' && (
        <>
          <Row
            title={uiText('OmniVoice model')}
            text={uiText('About 3.3 GB of weights plus PyTorch, downloaded once. Uses the GPU on Apple Silicon and NVIDIA.')}
          >
            <InstallButton component="omnivoice" state={setup?.omnivoice ?? 'missing'} />
          </Row>
          {inProject ? (
            <ReferenceRecorder />
          ) : (
            <p className="hint">{uiText('You record your voice for cloning inside the project, under Settings → Voice.')}</p>
          )}
        </>
      )}
    </>
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
      <div className="set-row-title">
        {uiText('Your voice, for cloning ')}
        {has && <span className="badge mint">{uiText('saved')}</span>}
      </div>
      <p className="hint">{uiText('Read this naturally, 5–10 seconds:')}</p>
      <blockquote>{text}</blockquote>
      <button className={`btn ${rec.state !== 'idle' ? 'danger' : ''}`} onClick={() => void toggle()}>
        {rec.state === 'idle' ? <Circle /> : <Square />}
        {rec.state === 'countdown'
          ? format('Starting in {0}…', [rec.count])
          : rec.state === 'recording'
            ? format('Stop ({0} s)', [rec.elapsed.toFixed(1)])
            : has
              ? uiText('Record again')
              : uiText('Record')}
      </button>
    </div>
  )
}

const COMPONENTS: { id: Component; title: string; text: string }[] = [
  { id: 'env', title: 'Manim environment', text: 'Python 3.12, manim 0.21, manim-voiceover, cairo/pango (pixi, conda-forge).' },
  { id: 'latex', title: 'LaTeX (TinyTeX)', text: 'For MathTex and Tex. Without it, only Text and shapes work.' },
  { id: 'omnivoice', title: 'OmniVoice', text: 'Local multilingual speech with voice cloning.' },
  { id: 'transcribe', title: 'Exact bookmarks for recordings', text: 'Whisper (faster-whisper) finds where you said each word. About 500 MB.' },
]

function EnvTab() {
  const setup = useStore((s) => s.setup)
  const log = useStore((s) => s.setupLog)
  const progress = useStore((s) => s.setupProgress)
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
              {openLog === c.id ? uiText('Hide log') : uiText('Show log')}
            </button>
          )}
          {openLog === c.id && <pre className="env-log mono">{log[c.id]?.join('\n')}</pre>}
        </div>
      ))}
    </div>
  )
}

/** Exports encode on the GPU when one works here (ADR 0034): which one, and a way to turn it off. */
function GpuEncoding() {
  const mode = useStore((s) => s.settings!.gpuEncoding ?? 'auto')
  const [info, setInfo] = useState<VideoEncoderInfo | null>(null)
  const [checking, setChecking] = useState(false)
  const check = async (again: boolean) => {
    setChecking(true)
    try {
      setInfo(await api.videoEncoder(again))
    } finally {
      setChecking(false)
    }
  }
  useEffect(() => void check(false), [])
  const text = checking
    ? uiText('Checking this computer’s graphics…')
    : info?.encoder
      ? format(
          'Exports encode their video on the GPU with {0}, which is faster than the CPU. Previews stay on the CPU. If it fails, the export carries on on the CPU.',
          [info.label],
        )
      : info?.error
        ? format('The check failed: {0}', [info.error])
        : 'No GPU encoder works on this computer, so exports encode on the CPU. Supported: Apple VideoToolbox on Macs, NVIDIA (NVENC), and AMD on Windows (Media Foundation).'
  return (
    <Row title={uiText('GPU video encoding')} text={text}>
      <div className="inline-form">
        {info?.encoder && (
          <Tabs
            radio="GPU video encoding"
            value={mode}
            onChange={(v) => void updateSettings({ gpuEncoding: v })}
            items={[
              { value: 'auto', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
          />
        )}
        <button className="btn small ghost" disabled={checking} onClick={() => void check(true)}>
          {checking ? <span className="spinner" /> : <RefreshCw />} {uiText(' Check again')}
        </button>
      </div>
    </Row>
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
        <Check /> {uiText(' Ready')}
      </span>
    )
  if (state === 'unsupported') return <span className="badge">{uiText('Not supported on this computer')}</span>
  return (
    <button className="btn small" disabled={state === 'installing'} onClick={() => void installComponent(component)}>
      {state === 'installing' && <span className="spinner" />} {localize(STATE_TEXT[state])}
    </button>
  )
}

/**
 * Render servers (ADR 0021): other machines that render exports, so this one stays free. Paired
 * with the code the server prints; each is checked when the tab opens.
 */
function RenderServers() {
  const [pairing, setPairing] = useState(false)
  const [pairError, setPairError] = useState('')
  const servers = useStore((s) => s.settings?.renderServers ?? [])
  const [status, setStatus] = useState<Record<string, string>>({})
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    for (const s of servers)
      api.checkServer(s.id).then(
        (i) =>
          setStatus((st) => ({
            ...st,
            [s.id]: `${i.cores} cores · ${i.busy ? `busy${i.waiting ? `, ${i.waiting} waiting` : ''}` : 'ready'} · version ${i.version}`,
          })),
        (e) => setStatus((st) => ({ ...st, [s.id]: errorText(e) })),
      )
  }, [servers.length])

  const refresh = async () => useStore.setState({ settings: await api.getSettings() })
  const add = async () => {
    setBusy(true)
    try {
      await api.addServer(code)
      setPairing(false)
      setPairError('')
      setCode('')
      await refresh()
      toast('Paired. Exports can now run there (Export → Export on).', 'ok')
    } catch (e) {
      setPairError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="render-servers">
      <Row
        title={uiText('Render servers')}
        text={uiText(
          "Another computer renders your exports, so this one stays free. Run Manim Studio's render server there (github.com/lukaznj/manim-studio-renderer), then paste the pairing code it prints.",
        )}
      />
      {servers.map((s) => (
        <div key={s.id} className="render-server">
          <Cpu />
          <div>
            <strong>{s.name}</strong> <span className="mono faint">{s.url}</span>
            <div className="hint">{status[s.id] ?? uiText('Checking…')}</div>
          </div>
          <button className="btn small ghost" onClick={() => void api.removeServer(s.id).then(refresh)}>
            {uiText('Remove')}
          </button>
        </div>
      ))}
      <button className="btn" onClick={() => setPairing(true)}>
        <Plus /> {uiText('Pair render server')}
      </button>
      <Modal
        open={pairing}
        onClose={() => {
          setPairing(false)
          setCode('')
          setPairError('')
        }}
        title={uiText('Pair render server')}
        width={500}
      >
        <div className="modal-body set-group">
          <p className="hint">{uiText('1. Start Manim Studio Renderer on the other computer.')}</p>
          <button className="link-btn" onClick={() => void api.openExternal('https://github.com/lukaznj/manim-studio-renderer')}>
            {uiText('Open server setup')}
          </button>
          <p className="hint">{uiText('2. Paste the pairing code it displays. Studio checks the connection before saving.')}</p>
          <input
            className="input mono"
            data-autofocus
            aria-label={uiText('Pairing code')}
            placeholder={uiText('msw1.…')}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          {pairError && <p role="alert">{pairError}</p>}
          <button className="btn primary" disabled={!code.trim() || busy} onClick={() => void add()}>
            {busy ? uiText('Connecting…') : uiText('Pair server')}
          </button>
        </div>
      </Modal>
    </div>
  )
}

function AboutTab() {
  const unlock = useRef({ count: 0, at: 0 })
  const app = useStore((s) => s.app)!
  const update = useStore((s) => s.update)
  const settings = useStore((s) => s.settings)!
  const project = useStore((s) => s.project)
  const status =
    update.state === 'checking'
      ? 'Checking…'
      : update.state === 'none'
        ? 'You have the latest version.'
        : update.state === 'available'
          ? format('Version {0} is available.', [update.version])
          : update.state === 'downloading'
            ? format('Downloading {0}%', [Math.round(update.percent)])
            : update.state === 'ready'
              ? format('Version {0} is ready. Restart to finish.', [update.version])
              : update.state === 'error'
                ? update.message
                : ''
  return (
    <div
      className="set-group"
      onClickCapture={(event) => {
        if (!(event.target as HTMLElement).closest('.version-unlock')) unlock.current.count = 0
      }}
    >
      <Row
        title={uiText('How you use Manim Studio')}
        text={
          settings.mode === 'learn'
            ? uiText('Learn: courses and exercises become videos to study, with a chat to ask about them. No editor.')
            : settings.mode === 'both'
              ? uiText('Both: Home has a Create tab (projects and the editor) and a Learn tab (courses to study).')
              : uiText('Create: the full studio, with the editor, the timeline and exports for publishing.')
        }
      >
        <Tabs
          radio="How you use Manim Studio"
          value={settings.mode ?? 'create'}
          onChange={(mode) => void switchMode(mode)}
          items={[
            { value: 'learn', label: 'Learn' },
            { value: 'create', label: 'Create' },
            { value: 'both', label: 'Both' },
          ]}
        />
      </Row>
      <Row title={uiText('App language')} text={uiText('The interface language. Narration is chosen separately under Voice.')}>
        <Tabs
          radio="App language"
          value={settings.uiLanguage ?? 'en'}
          onChange={(uiLanguage) => void updateSettings({ uiLanguage })}
          items={[
            { value: 'en', label: 'English' },
            { value: 'hr', label: 'Hrvatski' },
          ]}
        />
      </Row>
      <Row title={uiText('Appearance')} text={uiText('System follows your computer’s light or dark setting.')}>
        <Tabs
          radio="Appearance"
          value={settings.appearance}
          onChange={(appearance) => void updateSettings({ appearance })}
          items={[
            {
              value: 'system',
              label: (
                <>
                  <Monitor />
                  {uiText('System')}
                </>
              ),
            },
            {
              value: 'light',
              label: (
                <>
                  <Sun />
                  {uiText('Light')}
                </>
              ),
            },
            {
              value: 'dark',
              label: (
                <>
                  <Moon />
                  {uiText('Dark')}
                </>
              ),
            },
          ]}
        />
      </Row>
      <Row title={uiText('Projects folder')} text={<span className="mono">{settings.projectsDir}</span>}>
        <button
          className="btn small"
          onClick={async () => {
            const dir = await api.pickFolder()
            if (dir) void updateSettings({ projectsDir: dir })
          }}
        >
          {uiText('Change')}
        </button>
      </Row>
      {canEdit({ settings }) && (
        <Row title={uiText('Tutorial')} text={uiText('A short tour of the editor: the code, Claude, the timeline, media, narration and export.')}>
          <button className="btn small" disabled={!project} title={project ? undefined : uiText('Open a project first')} onClick={startTour}>
            {uiText('Show the tutorial')}
          </button>
        </Row>
      )}
      <Row
        title={
          <button
            className="version-unlock"
            onClick={() => {
              if (settings.developerMode) return
              const now = Date.now()
              unlock.current.count = now - unlock.current.at < 1600 ? unlock.current.count + 1 : 1
              unlock.current.at = now
              if (unlock.current.count === 5) {
                void updateSettings({ developerMode: true })
                toast('Developer mode enabled', 'ok')
              }
            }}
          >
            {format('Manim Studio {0}', [app.version])}
          </button>
        }
        text={format('{0} · {1} · open source (MIT)', [app.platform, app.arch])}
      >
        <button className="btn small" onClick={() => void api.checkForUpdates()}>
          {uiText('Check for updates')}
        </button>
      </Row>
      {status && <p className="hint">{localize(status)}</p>}
      {update.state === 'available' && (
        <button className="btn primary small" onClick={() => void api.downloadUpdate()}>
          {uiText('Download ')}
          {update.version}
        </button>
      )}
      {update.state === 'ready' && (
        <button className="btn primary small" onClick={() => void api.installUpdate()}>
          {uiText('Restart and update')}
        </button>
      )}
      {update.state === 'error' && (
        <button className="btn small ghost" onClick={() => void api.openExternal(app.releasesUrl)}>
          {uiText('Download from GitHub')}
        </button>
      )}
    </div>
  )
}

function DevelopTab({ onDisable }: { onDisable: () => void }) {
  const enabled = useStore((s) => !!s.settings?.developerEpisodeModels)
  const settings = useStore((s) => s.settings)!
  return (
    <div className="set-group">
      <Row
        title={uiText('Episode model comparison')}
        text={uiText(
          'In Learn, choose an agent and model for each episode after reviewing a course or mini-series plan. Only connected accounts are offered. Assignments stay with the episodes when reordered and resumed.',
        )}
      >
        <Tabs
          radio={uiText('Episode model comparison')}
          value={enabled ? 'on' : 'off'}
          onChange={(v) => void updateSettings({ developerEpisodeModels: v === 'on' })}
          items={[
            { value: 'off', label: 'Off' },
            { value: 'on', label: 'On' },
          ]}
        />
      </Row>
      <p className="hint">
        {uiText(
          'Each assigned model writes the script, makes the video and fixes its render. Automatic model fallback is disabled for comparisons so the results keep the model you selected.',
        )}
      </p>
      {(
        [
          [
            'developerUsageMetrics',
            'Usage graphs',
            'Record per-turn agent tokens, ElevenLabs request billing and account plan windows. Account percentages are shared with other apps; missing provider counters remain unavailable.',
          ],
          ['developerTimingMetrics', 'Episode timing', 'Measure scripting, implementation, render checks, fixes and export, with active and wall time.'],
          [
            'developerResourceMetrics',
            'Hardware graphs',
            'Sample Studio process-tree RAM and CPU, whole-computer CPU, and supported device-wide GPU counters about every five seconds. Unsupported counters are marked unavailable.',
          ],
        ] as const
      ).map(([key, title, text]) => (
        <Row key={key} title={uiText(title)} text={uiText(text)}>
          <Tabs
            radio={uiText(title)}
            value={settings[key] ? 'on' : 'off'}
            onChange={(value) => void updateSettings({ [key]: value === 'on' })}
            items={[
              { value: 'off', label: 'Off' },
              { value: 'on', label: 'On' },
            ]}
          />
        </Row>
      ))}
      <p className="hint">
        {uiText(
          'Measured episodes run one at a time, including export, for clearer attribution. Each episode gets an offline HTML report, and the series gets a combined report. Data stays in the project; measurement adds some overhead.',
        )}
      </p>
      <button
        className="btn small ghost"
        onClick={async () => {
          await updateSettings({
            developerMode: false,
            developerEpisodeModels: false,
            developerUsageMetrics: false,
            developerTimingMetrics: false,
            developerResourceMetrics: false,
          })
          onDisable()
        }}
      >
        {uiText('Turn off developer mode')}
      </button>
    </div>
  )
}

const PERMISSIONS: { key: 'tts' | 'voices' | 'user'; label: string; why: string }[] = [
  { key: 'tts', label: 'Text to Speech', why: 'speaks the narration' },
  { key: 'voices', label: 'Voices: Read', why: 'lists the voices' },
  { key: 'user', label: 'User', why: 'the usage meter; optional' },
]

/** A saved Anthropic or OpenAI key, tried for real (src/main/keys.ts): what it may do, and what stops it. */
function KeyStatus({ check, fix }: { check: (again: boolean) => Promise<KeyCheck>; fix: string }) {
  const [result, setResult] = useState<KeyCheck | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async (again = false) => {
    setBusy(true)
    try {
      setResult(await check(again))
    } catch (e) {
      setResult({ items: [], problem: errorText(e) })
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => void run(), [])
  return (
    <div className="el-status">
      <div className="el-permissions">
        {!result && (
          <span className="faint">
            <span className="spinner" /> {uiText(' Checking the key…')}
          </span>
        )}
        {result?.items.map((i) => (
          <span key={i.label} className={i.ok ? 'ok' : 'bad'} title={i.why}>
            {i.ok ? <Check /> : <X />} {i.label}
          </span>
        ))}
        <button className="link-btn" disabled={busy} onClick={() => void run(true)} title={uiText('Tries the key again (one tiny request)')}>
          {uiText(' Check again')}
        </button>
      </div>
      {result?.problem && (
        <p className="key-error">
          {result.problem}
          {result.rejected ? format(' Replace it with a key from {0}.', [fix]) : ''}
        </p>
      )}
      {result && !result.problem && result.items.some((i) => !i.ok) && (
        <p className="key-error">
          {uiText('Edit the key at ')}
          {fix} {uiText(' and allow what’s crossed out, then check again.')}
        </p>
      )}
    </div>
  )
}

/** The saved ElevenLabs key's permissions, tried for real, and this month's characters. */
function ElevenLabsStatus() {
  const check = useStore((s) => s.elevenLabsCheck)
  const [usage, setUsage] = useState<ElevenLabsUsage | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async (again = false) => {
    setBusy(true)
    try {
      const [c, u] = await Promise.all([api.checkElevenLabsKey(again), api.elevenLabsUsage()])
      useStore.setState({ elevenLabsCheck: c }) // voiceProblem stops a series or quick video on it
      setUsage(u)
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => void (!check && run()), [check]) // again after a new key (cleared when it's saved)
  const nf = new Intl.NumberFormat()
  const rejected = !!check?.problem && !check.voices && !check.tts // the key itself, not a permission
  return (
    <div className="el-status">
      <div className="el-permissions">
        {PERMISSIONS.map((p) => (
          <span key={p.key} className={!check ? 'faint' : check[p.key] ? 'ok' : p.key === 'user' ? 'faint' : 'bad'} title={p.why}>
            {!check ? <span className="spinner" /> : check[p.key] ? <Check /> : <X />} {p.label}
          </span>
        ))}
        <button className="link-btn" disabled={busy} onClick={() => void run(true)} title={uiText('Tries the key again (speaks one character)')}>
          {uiText(' Check again')}
        </button>
      </div>
      {rejected ? (
        <p className="key-error">
          {check.problem} {uiText(' Replace it with a key from elevenlabs.io → Developers → API keys.')}
        </p>
      ) : (
        <>
          {check?.problem && <p className="key-error">{check.problem}</p>}
          {check && (!check.tts || !check.voices) && (
            <p className="key-error">{uiText('Edit the key at elevenlabs.io → Developers → API keys and switch on what’s crossed out, then check again.')}</p>
          )}
        </>
      )}
      {usage ? (
        <div className="el-usage" title={format('ElevenLabs {0} plan', [usage.tier])}>
          <ProgressLine value={usage.limit ? usage.used / usage.limit : 0} />
          <span className="hint">
            {nf.format(usage.used)} {uiText(' of ')}
            {nf.format(usage.limit)} {uiText(' characters this month')}
            {usage.resetsAt ? format(' · resets {0}', [new Date(usage.resetsAt).toLocaleDateString([], { month: 'short', day: 'numeric' })]) : ''}
          </span>
        </div>
      ) : (
        check &&
        !check.user &&
        !rejected && <span className="hint">{uiText('Give the key the User permission to see how many characters are left this month.')}</span>
      )}
    </div>
  )
}
