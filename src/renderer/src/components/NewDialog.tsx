import { t as uiText, format } from '../lib/i18n'
import { FileText, FolderOpen, Globe, GraduationCap, Image, Library, Plus, Settings, Volume2, X, Zap, Film } from 'lucide-react'
import { useEffect, useState } from 'react'
import { modelName } from '../../../shared/usage'
import { defaultAgentSelection } from '../../../shared/agent-selection'
import { DEFAULT_TONE } from '../../../shared/tone'
import type { Theme, Tone } from '../../../shared/types'
import { api } from '../lib/api'
import { languageName } from '../lib/languages'
import { closeDialog, createExerciseSet, errorText, openDialog, pickAndOpenProject, studying, toast, useStore, type Make } from '../store'
import { voiceProblem } from './SettingsDialog'
import { Modal, Tabs } from './ui'
import { useVoiceFor } from './VoicePicker'

const PDF = /\.pdf$/i
const PICTURE = /\.(png|jpe?g|gif|webp|pdf)$/i
const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p

const PLACEHOLDER: Record<Make, string> = {
  video: "e.g. Explain Kirchhoff's current and voltage laws with one worked circuit, for first-year engineering students.",
  course: 'What do you want to learn, and how? Add the course’s PDFs if you have them.',
  exercises:
    'Type or paste them here, one or many, e.g.\n1. Solve x² − 5x + 6 = 0.\n2. A ball is thrown at 12 m/s at 30°. How far does it fly?\n\nPaste a screenshot with ⌘V / Ctrl+V.',
}

/**
 * Everything new starts here: one box for the request and its material, and what to make of it,
 * a video (quick mode), a course (planned, then reviewed in the course dialog) or exercises.
 */
export function NewDialog() {
  const dialog = useStore((s) => (s.dialog?.kind === 'new' ? s.dialog : null))
  const open = !!dialog
  const settings = useStore((s) => s.settings)
  const creating = useStore((s) => !studying(s))
  const signedOut = useStore((s) => !!s.claude && !s.claude.loggedIn)
  const hasKey = !!settings?.hasElevenLabsKey
  const omnivoice = useStore((s) => s.setup?.omnivoice)
  const elevenLabsCheck = useStore((s) => s.elevenLabsCheck)
  const [make, setMake] = useState<Make>('video')
  const [text, setText] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const language = settings?.defaultVoice?.language ?? 'en'
  const voice = useVoiceFor(language)
  const theme: Theme = settings?.defaultTheme ?? 'dark'
  const tone: Tone = settings?.defaultTone ?? DEFAULT_TONE
  const selected = settings && defaultAgentSelection(settings)
  const voiceIssue = voiceProblem(voice, hasKey, omnivoice, elevenLabsCheck)

  useEffect(() => {
    if (!open) return
    setBusy(false)
    if (dialog?.make) setMake(dialog.make)
    if (hasKey && settings?.defaultVoice?.provider === 'elevenlabs') void api.checkElevenLabsKey().then((c) => useStore.setState({ elevenLabsCheck: c }))
  }, [open]) // the request stays while Settings is visited; it clears once something starts

  const accepts = make === 'exercises' ? PICTURE : PDF
  const usable = files.filter((f) => accepts.test(f))
  const add = (paths: string[]) => {
    const skipped = paths.filter((p) => !PICTURE.test(p))
    if (skipped.length) toast(format('Only pictures (PNG, JPEG, GIF, WebP) and PDFs can be added; skipped {0}.', [skipped.map(fileName).join(', ')]), 'error')
    setFiles((all) => [...all, ...paths.filter((p) => PICTURE.test(p) && !all.includes(p))])
  }
  const ready = make === 'video' ? !!text.trim() : !!text.trim() || usable.length > 0
  const done = () => {
    setText('')
    setFiles([])
  }

  const start = async () => {
    if (!ready || busy || voiceIssue) return
    setBusy(true)
    try {
      if (make === 'video') {
        await api.startQuick({ prompt: text, sources: usable, aspect: '16:9', theme, tone, language, voice, export: { themes: [theme], languages: [], languageVideos: false } })
        done()
        closeDialog()
      } else if (make === 'course') {
        done()
        openDialog({ kind: 'series', request: { pdfs: usable, text: text.trim() } })
      } else if (await createExerciseSet({ title: '', level: '', language, aspect: '16:9', theme, tone, voice, input: { text, files: usable } })) {
        done()
      } else setBusy(false)
    } catch (e) {
      toast(errorText(e), 'error')
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !busy && closeDialog()}
      title={uiText('New')}
      icon={<Plus className="head-icon" />}
      width={680}
      footer={
        <>
          {creating && (
            <div className="new-extras">
              <button className="btn ghost small" onClick={() => openDialog({ kind: 'new-project' })}>
                <Plus /> {uiText('Empty project')}
              </button>
              <button className="btn ghost small" onClick={() => { closeDialog(); void pickAndOpenProject() }}>
                <FolderOpen /> {uiText('Open folder…')}
              </button>
            </div>
          )}
          <button className="btn ghost" disabled={busy} onClick={closeDialog}>
            {uiText('Cancel')}
          </button>
          <button className="btn primary" disabled={!ready || busy || !!voiceIssue} title={voiceIssue ?? undefined} onClick={() => void start()}>
            {busy ? <span className="spinner" /> : make === 'video' ? <Zap /> : make === 'course' ? <Library /> : <GraduationCap />}
            {make === 'video' ? uiText('Make the video') : make === 'course' ? uiText('Plan the lessons') : uiText('Solve them')}
          </button>
        </>
      }
    >
      <div className="modal-body new-dialog">
        {signedOut && (
          <button className="btn ghost" onClick={() => openDialog({ kind: 'settings', tab: 'accounts' })}>
            {uiText('Connect your AI agent to make videos')}
          </button>
        )}
        <Tabs
          radio={uiText('What to make')}
          value={make}
          onChange={setMake}
          items={[
            { value: 'video', label: <><Zap />{uiText('Video')}</> },
            { value: 'course', label: <><Library />{uiText('Course')}</> },
            { value: 'exercises', label: <><GraduationCap />{uiText('Exercises')}</> },
          ]}
        />
        <div
          className={`new-box ${dragging ? 'dragging' : ''}`}
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
          <textarea
            className="new-input"
            data-autofocus
            rows={6}
            aria-label={uiText('What to make')}
            placeholder={uiText(PLACEHOLDER[make])}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const pictures = [...e.clipboardData.files].filter((f) => /^image\/(png|jpeg|gif|webp)$/.test(f.type))
              if (!pictures.length) return
              e.preventDefault()
              void Promise.all(pictures.map(async (f) => api.savePastedImage(new Uint8Array(await f.arrayBuffer()), f.type.split('/')[1] ?? 'png'))).then(add)
            }}
          />
          <div className="new-files">
            {files.map((p) => (
              <span key={p} className={`lang-chip ${accepts.test(p) ? '' : 'unused'}`} title={accepts.test(p) ? p : uiText('Only exercises use pictures')}>
                {PDF.test(p) ? <FileText /> : <Image />} {fileName(p)}
                <button aria-label={format('Remove {0}', [fileName(p)])} onClick={() => setFiles(files.filter((x) => x !== p))}>
                  <X />
                </button>
              </span>
            ))}
            <button className="btn small ghost" onClick={() => void (make === 'exercises' ? api.pickExerciseFiles() : api.pickPdfs()).then(add)}>
              <Plus /> {make === 'exercises' ? uiText('Add pictures or PDFs') : uiText('Add PDFs')}
            </button>
          </div>
        </div>
        <div className="quick-config">
          <span><Zap />{selected?.agent === 'codex' ? 'Codex' : selected?.agent === 'antigravity' ? 'Antigravity' : 'Claude'} · {modelName(selected?.model || 'default')}</span>
          <span><Volume2 />{languageName.of(language) ?? language}</span>
          <span><Film />16:9</span>
          {make === 'video' && <span><Globe />{uiText('Web research available')}</span>}
          <button className="link-btn" onClick={() => openDialog({ kind: 'settings', tab: 'account' })}><Settings />{uiText('Settings')}</button>
        </div>
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
