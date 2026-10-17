import { t as uiText, format } from '../lib/i18n'
import { FileText, Plus, X, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DEFAULT_TONE } from '../../../shared/tone'
import type { Aspect, Theme, Tone } from '../../../shared/types'
import { api } from '../lib/api'
import { closeDialog, errorText, openDialog, toast, useStore } from '../store'
import { ExportOn } from './ExportDialog'
import { voiceProblem } from './SettingsDialog'
import { Modal } from './ui'
import { useVoiceFor } from './VoicePicker'

/**
 * Quick mode: say what the video should show, attach PDFs, and Studio makes it and exports it
 * without the editor (src/main/quick.ts). The voice is Settings → Voice's default.
 */
export function QuickDialog() {
  const open = useStore((s) => s.dialog?.kind === 'quick')
  const defaultVoice = useStore((s) => s.settings?.defaultVoice)
  const defaults = useStore((s) => s.settings)
  const hasKey = useStore((s) => !!s.settings?.hasElevenLabsKey)
  const omnivoice = useStore((s) => s.setup?.omnivoice)
  const [prompt, setPrompt] = useState('')
  const [pdfs, setPdfs] = useState<string[]>([])
  const aspect: Aspect = defaults?.defaultAspect ?? '16:9'
  const theme: Theme = defaults?.defaultTheme ?? 'dark'
  const [both, setBoth] = useState(false)
  const [server, setServer] = useState<string | undefined>()
  const tone: Tone = defaults?.defaultTone ?? DEFAULT_TONE
  const language = defaultVoice?.language ?? 'en'
  const voice = useVoiceFor(language)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setPrompt('')
    setPdfs([])
    setBusy(false)
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
        voice,
        export: { themes: both ? ['dark', 'light'] : [theme], languages: [], languageVideos: false, server },
      })
      closeDialog()
    } catch (e) {
      toast(errorText(e), 'error')
      setBusy(false)
    }
  }

  // The default voice decides whether the video speaks: without one, the narration stays silent.
  const elevenLabsCheck = useStore((s) => s.elevenLabsCheck)
  const voiceIssue = voiceProblem(voice, hasKey, omnivoice, elevenLabsCheck)
  // No voice form here: check the key's permissions when it narrates with ElevenLabs.
  useEffect(() => {
    if (open && hasKey && defaultVoice?.provider === 'elevenlabs') void api.checkElevenLabsKey().then((c) => useStore.setState({ elevenLabsCheck: c }))
  }, [open, hasKey])

  return (
    <Modal
      open={open}
      onClose={closeDialog}
      title={uiText('Quick video')}
      icon={<Zap className="head-icon" />}
      width={680}
      footer={
        <>
          <button className="btn ghost" onClick={closeDialog}>
            {uiText('Cancel')}
          </button>
          <button className="btn primary" disabled={!prompt.trim() || busy || !!voiceIssue} title={voiceIssue ?? undefined} onClick={() => void start()}>
            {busy ? <span className="spinner" /> : <Zap />} {uiText(" Make the video")}
          </button>
        </>
      }
    >
      <div className="modal-body quick-form">
        <p className="hint">
          {uiText(
            "Describe it, attach the material, and Studio does the rest: Claude writes the script and the scenes, checks the render and exports the video. You don't need the editor; it's there if you want to look.",
          )}
        </p>
        <div className="field">
          <label htmlFor="quick-prompt">{uiText('What should the video show?')}</label>
          <textarea
            id="quick-prompt"
            className="textarea quick-prompt"
            data-autofocus
            rows={4}
            placeholder={uiText("e.g. Explain Kirchhoff's current and voltage laws with one worked circuit, for first-year engineering students.")}
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
              <button aria-label={format('Remove {0}', [p.split(/[\\/]/).pop()])} onClick={() => setPdfs(pdfs.filter((x) => x !== p))}>
                <X />
              </button>
            </span>
          ))}
          <button className="btn small" onClick={() => void api.pickPdfs().then(add)}>
            <Plus /> {pdfs.length ? uiText('Add more PDFs') : uiText('Add PDFs')}
          </button>
          {!pdfs.length && <span className="hint">{uiText('or drop them here: lecture notes, a textbook chapter, a worksheet. Optional.')}</span>}
        </div>

        <label className="export-check">
          <input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} /> {uiText(" Export both a light and a dark version")}
        </label>
        <ExportOn value={server} onChange={setServer} />
        {voiceIssue && (
          <div className="quick-warning">
            {voiceIssue}{' '}
            <button className="link-btn" onClick={() => openDialog({ kind: 'settings', tab: 'voice' })}>
              {uiText('Choose one in Settings → Voice')}
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
