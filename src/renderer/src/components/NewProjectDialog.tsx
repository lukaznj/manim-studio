import { Clapperboard, FolderOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DEFAULT_TONE, TONES } from '../../../shared/tone'
import type { Aspect, Theme, Tone, VoiceSettings } from '../../../shared/types'
import { api } from '../lib/api'
import { closeDialog, createProject, useStore } from '../store'
import { VoiceForm } from './SettingsDialog'
import { Modal, Tabs } from './ui'

const ASPECTS: { value: Aspect; title: string; hint: string }[] = [
  {
    value: '16:9',
    title: 'Landscape',
    hint: 'For screens, projectors and YouTube',
  },
  { value: '9:16', title: 'Portrait', hint: 'For phones, full screen' },
]

const THEMES: { value: Theme; title: string }[] = [
  { value: 'dark', title: 'Dark' },
  { value: 'light', title: 'Light' },
]

export function NewProjectDialog() {
  const open = useStore((s) => s.dialog?.kind === 'new-project')
  const projectsDir = useStore((s) => s.settings?.projectsDir ?? '')
  const defaultVoice = useStore((s) => s.settings?.defaultVoice)
  const [name, setName] = useState('')
  const [aspect, setAspect] = useState<Aspect>('9:16')
  const [theme, setTheme] = useState<Theme>('dark')
  const [tone, setTone] = useState<Tone>(DEFAULT_TONE)
  const [scriptFirst, setScriptFirst] = useState(true)
  const [voice, setVoice] = useState<VoiceSettings>({
    provider: 'elevenlabs',
    language: 'en',
  })
  const [parentDir, setParentDir] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setParentDir(projectsDir)
      if (defaultVoice) setVoice(defaultVoice)
      setBusy(false)
    }
  }, [open]) // a fresh form each time it opens, from the defaults of that moment

  const submit = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    await createProject({
      name: name.trim(),
      aspect,
      theme,
      tone,
      scriptFirst,
      language: voice.language,
      voice,
      parentDir,
    })
    setBusy(false)
  }

  return (
    <Modal
      open={open}
      onClose={closeDialog}
      title="New project"
      icon={<Clapperboard className="head-icon" />}
      width={960}
      footer={
        <>
          <button className="btn ghost" onClick={closeDialog}>
            Cancel
          </button>
          <button className="btn primary" disabled={!name.trim() || busy} onClick={() => void submit()}>
            {busy && <span className="spinner" />} Create project
          </button>
        </>
      }
    >
      <div className="modal-body new-project">
        <div className="np-main">
          <div className="field">
            <label htmlFor="np-name">Video title</label>
            <input
              id="np-name"
              className="input"
              data-autofocus
              placeholder="e.g. Quadratic functions: the vertex of a parabola"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
            />
          </div>

          <div className="field">
            <span className="label">Format</span>
            <div className="aspect-cards" role="radiogroup">
              {ASPECTS.map((a) => (
                <button
                  key={a.value}
                  role="radio"
                  aria-checked={aspect === a.value}
                  className={`aspect-card ${aspect === a.value ? 'on' : ''}`}
                  onClick={() => setAspect(a.value)}
                >
                  <div className="aspect-stage">
                    <div className={`aspect-frame ${a.value === '9:16' ? 'portrait' : 'landscape'} theme-${theme}`}>
                      <svg viewBox="0 0 40 30" preserveAspectRatio="xMidYMid meet">
                        <path d="M8 6 C 14 30, 26 30, 32 6" className="aspect-curve" />
                        <circle cx="20" cy="23.5" r="1.8" className="aspect-dot" />
                      </svg>
                    </div>
                  </div>
                  <div className="aspect-label">
                    <strong>{a.title}</strong> <span className="mono faint">{a.value}</span>
                    <div className="hint">{a.hint}</div>
                  </div>
                </button>
              ))}
            </div>
            <span className="hint">The format can’t be changed later: the scene’s layout depends on it.</span>
          </div>

          <div className="np-row">
            <div className="field">
              <span className="label">Video theme</span>
              <div className="theme-swatches" role="radiogroup">
                {THEMES.map((t) => (
                  <button
                    key={t.value}
                    role="radio"
                    aria-checked={theme === t.value}
                    className={`swatch theme-${t.value} ${theme === t.value ? 'on' : ''}`}
                    onClick={() => setTheme(t.value)}
                  >
                    <span className="swatch-chip" />
                    {t.title}
                  </button>
                ))}
              </div>
            </div>
            <div className="field grow">
              <span className="label">Folder</span>
              <div className="path-pick">
                <span className="mono path-text" title={parentDir}>
                  {parentDir}
                </span>
                <button
                  className="btn small"
                  onClick={async () => {
                    const dir = await api.pickFolder()
                    if (dir) setParentDir(dir)
                  }}
                >
                  <FolderOpen /> Change
                </button>
              </div>
            </div>
          </div>
          <div className="field">
            <span className="label">Tone</span>
            <Tabs radio="Tone" value={tone} onChange={setTone} items={TONES.map((t) => ({ value: t.value, label: t.label }))} />
            <span className="hint">{TONES.find((t) => t.value === tone)?.hint} You can change it later, or ask for another in the chat.</span>
          </div>
          <label className="export-check">
            <input type="checkbox" checked={scriptFirst} onChange={(e) => setScriptFirst(e.target.checked)} />
            <span>
              Plan a script first <span className="hint">Claude writes the plan (the idea, each section's narration and visuals) for you to approve before the code.</span>
            </span>
          </label>
        </div>

        <div className="np-voice set-group">
          <div className="eyebrow">Narration</div>
          <VoiceForm voice={voice} onChange={setVoice} inProject={false} />
        </div>
      </div>
    </Modal>
  )
}
