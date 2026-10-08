import { Clapperboard, FolderOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Aspect, Theme } from '../../../shared/types'
import { api } from '../lib/api'
import { closeDialog, createProject, useStore } from '../store'
import { Modal } from './ui'

const ASPECTS: { value: Aspect; title: string; hint: string }[] = [
  { value: '16:9', title: 'Landscape', hint: 'For screens, projectors and YouTube' },
  { value: '9:16', title: 'Portrait', hint: 'For phones, full screen' },
]

const THEMES: { value: Theme; title: string }[] = [
  { value: 'dark', title: 'Dark' },
  { value: 'light', title: 'Light' },
]

// Narration languages offered first; any BCP 47 code works in project.json.
const LANGUAGES = ['en', 'en-GB', 'es', 'fr', 'de', 'it', 'pt', 'pt-BR', 'nl', 'pl', 'cs', 'sk', 'sl', 'hr', 'sr', 'hu', 'ro', 'sv', 'da', 'nb', 'fi', 'tr', 'el', 'uk', 'ru', 'ar', 'hi', 'ja', 'ko', 'zh']
const languageName = new Intl.DisplayNames(['en'], { type: 'language' })

export function NewProjectDialog() {
  const open = useStore((s) => s.dialog?.kind === 'new-project')
  const projectsDir = useStore((s) => s.settings?.projectsDir ?? '')
  const defaultLanguage = useStore((s) => s.settings?.defaultVoice.language ?? 'en')
  const [name, setName] = useState('')
  const [aspect, setAspect] = useState<Aspect>('9:16')
  const [theme, setTheme] = useState<Theme>('dark')
  const [language, setLanguage] = useState('en')
  const [parentDir, setParentDir] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setParentDir(projectsDir)
      setLanguage(defaultLanguage)
      setBusy(false)
    }
  }, [open, projectsDir, defaultLanguage])

  const submit = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    await createProject({ name: name.trim(), aspect, theme, language, parentDir })
    setBusy(false)
  }

  return (
    <Modal
      open={open}
      onClose={closeDialog}
      title="New project"
      icon={<Clapperboard className="head-icon" />}
      width={640}
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
                <button key={t.value} role="radio" aria-checked={theme === t.value} className={`swatch theme-${t.value} ${theme === t.value ? 'on' : ''}`} onClick={() => setTheme(t.value)}>
                  <span className="swatch-chip" />
                  {t.title}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="np-lang">Narration language</label>
            <select id="np-lang" className="select" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {languageName.of(code)}
                </option>
              ))}
            </select>
          </div>
          <div className="field grow span-2">
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
      </div>
    </Modal>
  )
}
