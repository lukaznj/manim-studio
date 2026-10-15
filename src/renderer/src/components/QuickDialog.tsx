import { FileText, Plus, X, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DEFAULT_TONE, TONES } from '../../../shared/tone'
import type { Aspect, Theme, Tone } from '../../../shared/types'
import { api } from '../lib/api'
import { LANGUAGES, languageName } from '../lib/languages'
import { closeDialog, errorText, openDialog, toast, useStore } from '../store'
import { ExportOn } from './ExportDialog'
import { voiceProblem } from './SettingsDialog'
import { Modal, Tabs } from './ui'

/**
 * Quick mode: say what the video should show, attach PDFs, and Studio makes it and exports it
 * without the editor (src/main/quick.ts). The voice is Settings → Voice's default.
 */
export function QuickDialog() {
  const open = useStore((s) => s.dialog?.kind === 'quick')
  const defaultVoice = useStore((s) => s.settings?.defaultVoice)
  const hasKey = useStore((s) => !!s.settings?.hasElevenLabsKey)
  const omnivoice = useStore((s) => s.setup?.omnivoice)
  const [prompt, setPrompt] = useState('')
  const [pdfs, setPdfs] = useState<string[]>([])
  const [aspect, setAspect] = useState<Aspect>('16:9')
  const [theme, setTheme] = useState<Theme>('dark')
  const [both, setBoth] = useState(false)
  const [server, setServer] = useState<string | undefined>()
  const [tone, setTone] = useState<Tone>(DEFAULT_TONE)
  const [language, setLanguage] = useState('en')
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setPrompt('')
    setPdfs([])
    setBusy(false)
    if (defaultVoice) setLanguage(defaultVoice.language)
  }, [open]) // a fresh form each time

  const add = (paths: string[]) => setPdfs((p) => [...p, ...paths.filter((x) => /\.pdf$/i.test(x) && !p.includes(x))])

  const start = async () => {
    if (!prompt.trim() || busy || voiceIssue) return
    setBusy(true)
    try {
      await api.startQuick({
        prompt,
        sources: pdfs,
        aspect,
        theme,
        tone,
        language,
        voice: defaultVoice ? { ...defaultVoice, language } : undefined,
        export: { themes: both ? ['dark', 'light'] : [theme], languages: [], languageVideos: false, server },
      })
      closeDialog()
    } catch (e) {
      toast(errorText(e), 'error')
      setBusy(false)
    }
  }

  // The default voice decides whether the video speaks: without one, the narration stays silent.
  const voiceIssue = voiceProblem(defaultVoice, hasKey, omnivoice)
  const languages = LANGUAGES.includes(language) ? LANGUAGES : [language, ...LANGUAGES]

  return (
    <Modal
      open={open}
      onClose={closeDialog}
      title="Quick video"
      icon={<Zap className="head-icon" />}
      width={680}
      footer={
        <>
          <button className="btn ghost" onClick={closeDialog}>
            Cancel
          </button>
          <button className="btn primary" disabled={!prompt.trim() || busy || !!voiceIssue} title={voiceIssue ?? undefined} onClick={() => void start()}>
            {busy ? <span className="spinner" /> : <Zap />} Make the video
          </button>
        </>
      }
    >
      <div className="modal-body quick-form">
        <p className="hint">
          Describe it, attach the material, and Studio does the rest: Claude writes the script and the scenes, checks the render and exports the video. You
          don't need the editor; it's there if you want to look.
        </p>
        <div className="field">
          <label htmlFor="quick-prompt">What should the video show?</label>
          <textarea
            id="quick-prompt"
            className="textarea quick-prompt"
            data-autofocus
            rows={4}
            placeholder="e.g. Explain Kirchhoff's current and voltage laws with one worked circuit, for first-year engineering students."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        <div
          className={`quick-pdfs ${dragging ? 'dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            add([...e.dataTransfer.files].map((f) => api.pathForFile(f)))
          }}
        >
          {pdfs.map((p) => (
            <span key={p} className="lang-chip" title={p}>
              <FileText /> {p.split(/[\\/]/).pop()}
              <button aria-label={`Remove ${p.split(/[\\/]/).pop()}`} onClick={() => setPdfs(pdfs.filter((x) => x !== p))}>
                <X />
              </button>
            </span>
          ))}
          <button className="btn small" onClick={() => void api.pickPdfs().then(add)}>
            <Plus /> {pdfs.length ? 'Add more PDFs' : 'Add PDFs'}
          </button>
          {!pdfs.length && <span className="hint">or drop them here: lecture notes, a textbook chapter, a worksheet. Optional.</span>}
        </div>

        <div className="quick-row">
          <div className="field">
            <span className="label">Format</span>
            <Tabs
              radio="Format"
              value={aspect}
              onChange={setAspect}
              items={[
                { value: '16:9', label: '16:9 landscape' },
                { value: '9:16', label: '9:16 portrait' },
              ]}
            />
          </div>
          <div className="field">
            <label htmlFor="quick-lang">Language</label>
            <select id="quick-lang" className="select" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {languages.map((code) => (
                <option key={code} value={code}>
                  {languageName.of(code)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="quick-row">
          <div className="field">
            <span className="label">Tone</span>
            <Tabs radio="Tone" value={tone} onChange={setTone} items={TONES.map((t) => ({ value: t.value, label: t.label }))} />
          </div>
          <div className="field">
            <span className="label">Theme</span>
            <Tabs
              radio="Theme"
              value={theme}
              onChange={setTheme}
              items={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
              ]}
            />
          </div>
        </div>
        <label className="export-check">
          <input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} /> Export both a light and a dark version
        </label>
        <ExportOn value={server} onChange={setServer} />
        {voiceIssue && (
          <div className="quick-warning">
            {voiceIssue}{' '}
            <button className="link-btn" onClick={() => openDialog({ kind: 'settings', tab: 'voice' })}>
              Choose one in Settings → Voice
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
