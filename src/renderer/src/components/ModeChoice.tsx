import { useState } from 'react'
import type { AppMode } from '../../../shared/types'
import { api } from '../lib/api'
import { errorText, installComponent, switchMode, updateSettings, useStore } from '../store'
import { AgentAccount, ElevenLabsAccount, VoiceForm, voiceProblem } from './SettingsDialog'
import { Modal, Tabs } from './ui'

/** New installations are guided through language, purpose, agent credentials and narration. */
export function ModeChoice() {
  const settings = useStore((s) => s.settings)
  const setup = useStore((s) => s.setup)
  const [step, setStep] = useState(0)
  const [mode, setMode] = useState<AppMode>('learn')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const open = !!settings && !settings.mode
  if (!settings) return null
  const hr = settings.uiLanguage === 'hr'
  const say = (en: string, croatian: string) => (hr ? croatian : en)
  const titles = [
    say('Welcome to Manim Studio', 'Dobro došli u Manim Studio'),
    say('What will you do?', 'Što želite raditi?'),
    say('Choose your agent', 'Odaberite agenta'),
    say('Connect your account', 'Povežite račun'),
    say('Choose your voice', 'Odaberite glas'),
  ]
  const finish = async () => {
    await updateSettings({ onboardingDone: true })
    await switchMode(mode)
  }
  const next = async () => {
    setError('')
    setBusy(true)
    try {
      if (step === 3) {
        const status = await api.claudeStatus(settings.agent)
        if (!status.loggedIn)
          throw new Error(
            say(
              'Sign in or add an API key to continue. You can also set this up later.',
              'Prijavite se ili dodajte API ključ za nastavak. To možete postaviti i kasnije.',
            ),
          )
      }
      if (step === 4) {
        const problem = voiceProblem(settings.defaultVoice, settings.hasElevenLabsKey, setup?.omnivoice)
        if (problem) throw new Error(problem)
        await finish()
      } else setStep(step + 1)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open={open}
      onClose={() => void finish()}
      title={titles[step]}
      width={740}
      className="settings-modal"
      footer={
        <>
          {step > 0 && (
            <button
              className="btn ghost"
              disabled={busy}
              onClick={() => {
                setError('')
                setStep(step - 1)
              }}
            >
              {say('Back', 'Natrag')}
            </button>
          )}
          {step >= 3 && (
            <button className="btn ghost" disabled={busy} onClick={() => (step === 4 ? void finish() : setStep(step + 1))}>
              {say('Set up later', 'Postavi kasnije')}
            </button>
          )}
          <button className="btn primary" disabled={busy} onClick={() => void next()}>
            {busy ? say('Checking…', 'Provjera…') : step === 4 ? say('Get started', 'Započni') : say('Continue', 'Nastavi')}
          </button>
        </>
      }
    >
      <div className="modal-body set-group">
        <div className="onboarding-progress" aria-label={`${step + 1} / 5`}>
          {titles.map((title, i) => (
            <span key={i} className={i <= step ? 'on' : ''} title={title} />
          ))}
        </div>
        {step === 0 && (
          <>
            <p>
              {say(
                'Choose your app language. You can change it in Settings → General. Narration starts in this language, and can be changed independently.',
                'Odaberite jezik aplikacije. Možete ga promijeniti u Postavkama → Općenito. Pripovijedanje počinje na ovom jeziku, a kasnije ga možete promijeniti zasebno.',
              )}
            </p>
            <Tabs
              radio="App language"
              value={settings.uiLanguage ?? 'en'}
              onChange={(uiLanguage) =>
                void updateSettings({ uiLanguage, defaultVoice: { ...settings.defaultVoice, language: uiLanguage, elevenlabs: undefined } })
              }
              items={[
                { value: 'en', label: 'English' },
                { value: 'hr', label: 'Hrvatski' },
              ]}
            />
          </>
        )}
        {step === 1 && (
          <div className="creation-choices">
            {(
              [
                [
                  'learn',
                  say('Learn', 'Uči'),
                  say(
                    'Turn topics, notes and exercises into videos. Watch and ask questions without using an editor.',
                    'Pretvorite teme, bilješke i zadatke u videozapise. Gledajte i postavljajte pitanja bez uređivanja koda.',
                  ),
                ],
                [
                  'create',
                  say('Create', 'Stvaraj'),
                  say(
                    'Produce videos with a code editor, timeline, preview controls and render servers.',
                    'Izrađujte videozapise uz uređivač koda, vremensku crtu, pretpregled i poslužitelje za renderiranje.',
                  ),
                ],
                [
                  'both',
                  say('Both', 'Oboje'),
                  say('Switch between learning and production from your library.', 'Prebacujte se između učenja i izrade u svojoj zbirci.'),
                ],
              ] as const
            ).map(([value, title, text]) => (
              <button
                className={`provider-card ${mode === value ? 'on' : ''}`}
                role="radio"
                aria-checked={mode === value}
                key={value}
                onClick={() => setMode(value)}
              >
                <strong>{title}</strong>
                <span className="hint">{text}</span>
              </button>
            ))}
          </div>
        )}
        {step === 2 && (
          <>
            <p>
              {say(
                'Your agent plans the explanation, writes the animation and checks the result. Use your existing subscription or a provider API key; API usage is billed separately.',
                'Agent planira objašnjenje, piše animaciju i provjerava rezultat. Koristite postojeću pretplatu ili API ključ pružatelja; korištenje API-ja naplaćuje se zasebno.',
              )}
            </p>
            <Tabs
              radio="Agent"
              value={settings.agent}
              onChange={(agent) => void updateSettings({ agent })}
              items={[
                { value: 'claude', label: 'Claude' },
                { value: 'codex', label: 'Codex' },
                { value: 'antigravity', label: 'Antigravity' },
              ]}
            />
            <p className="hint">
              {say(
                'Claude connects to Anthropic, Codex to OpenAI, and Antigravity to Google. Optional agents are installed when you choose them.',
                'Claude se povezuje s Anthropicom, Codex s OpenAI-jem, a Antigravity s Googleom. Dodatni agenti instaliraju se pri odabiru.',
              )}
            </p>
          </>
        )}
        {step === 3 && (
          <>
            <p>
              {say(
                'Sign in with your existing account, or choose API key and add your own key. Studio stores API keys encrypted on this computer.',
                'Prijavite se postojećim računom ili odaberite API ključ i dodajte svoj ključ. Studio pohranjuje API ključeve šifrirane na ovom računalu.',
              )}
            </p>
            <AgentAccount agent={settings.agent} />
          </>
        )}
        {step === 4 && (
          <>
            <p>
              {say(
                'ElevenLabs is recommended for natural narration and accurate animation timings. It needs a key and uses your ElevenLabs plan. OmniVoice runs locally for free, supports voice cloning, and needs a large download and more computer resources.',
                'ElevenLabs preporučujemo za prirodno pripovijedanje i precizno usklađivanje animacija. Potreban je ključ i koristi se vaš ElevenLabs plan. OmniVoice je besplatan i radi lokalno, podržava kloniranje glasa, ali zahtijeva veliko preuzimanje i više resursa računala.',
              )}
            </p>
            <ElevenLabsAccount />
            <VoiceForm voice={settings.defaultVoice} onChange={(defaultVoice) => void updateSettings({ defaultVoice })} inProject={false} />
            {setup?.env !== 'ready' && (
              <p className="hint">
                {say(
                  'Studio also needs its video environment. Install it from the library or Settings → Environment.',
                  'Studio zahtijeva i okruženje za videozapise. Instalirajte ga u zbirci ili u Postavkama → Okruženje.',
                )}{' '}
                <button className="btn small" onClick={() => void installComponent('env')}>
                  {say('Install', 'Instaliraj')}
                </button>
              </p>
            )}
          </>
        )}
        {error && (
          <p className="key-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
