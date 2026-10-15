import { Film, FileText, GraduationCap, Image, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DEFAULT_TONE, TONES } from '../../../shared/tone'
import type { Aspect, ExerciseInput, Theme, Tone } from '../../../shared/types'
import { api } from '../lib/api'
import { LANGUAGES, languageName } from '../lib/languages'
import { closeDialog, createExerciseSet, errorText, openDialog, toast, useStore } from '../store'
import { voiceProblem } from './SettingsDialog'
import { Modal, Tabs } from './ui'
import { useVoiceFor } from './VoicePicker'

const FILE = /\.(png|jpe?g|gif|webp|pdf)$/i
const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p

/** Exercises typed, pasted (screenshots), dropped or picked: one or many in each. */
function ExerciseInputFields({ input, onChange }: { input: ExerciseInput; onChange: (i: ExerciseInput) => void }) {
  const [dragging, setDragging] = useState(false)
  const add = (paths: string[]) => {
    const odd = paths.filter((p) => !FILE.test(p))
    if (odd.length) toast(`Only pictures (PNG, JPEG, GIF, WebP) and PDFs can be added; skipped ${odd.map(fileName).join(', ')}.`, 'error')
    onChange({ ...input, files: [...input.files, ...paths.filter((p) => FILE.test(p) && !input.files.includes(p))] })
  }
  return (
    <>
      <div className="field">
        <label htmlFor="ex-text">Exercises</label>
        <textarea
          id="ex-text"
          className="textarea ex-input"
          data-autofocus
          rows={6}
          placeholder={'Type or paste them here, one or many, e.g.\n1. Solve x² − 5x + 6 = 0.\n2. A ball is thrown at 12 m/s at 30°. How far does it fly?\n\nPaste a screenshot with ⌘V / Ctrl+V.'}
          value={input.text}
          onChange={(e) => onChange({ ...input, text: e.target.value })}
          onPaste={(e) => {
            const pictures = [...e.clipboardData.files].filter((f) => /^image\/(png|jpeg|gif|webp)$/.test(f.type))
            if (!pictures.length) return
            e.preventDefault()
            void Promise.all(pictures.map(async (f) => api.savePastedImage(new Uint8Array(await f.arrayBuffer()), f.type.split('/')[1] ?? 'png'))).then(add)
          }}
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
        {input.files.map((p) => (
          <span key={p} className="lang-chip" title={p}>
            {/\.pdf$/i.test(p) ? <FileText /> : <Image />} {fileName(p)}
            <button aria-label={`Remove ${fileName(p)}`} onClick={() => onChange({ ...input, files: input.files.filter((x) => x !== p) })}>
              <X />
            </button>
          </span>
        ))}
        <button className="btn small" onClick={() => void api.pickExerciseFiles().then(add)}>
          <Plus /> {input.files.length ? 'Add more' : 'Add pictures or PDFs'}
        </button>
        {!input.files.length && <span className="hint">or drop them here: photos of a textbook page, screenshots, a problem sheet.</span>}
      </div>
    </>
  )
}

const empty = (): ExerciseInput => ({ text: '', files: [] })
const hasInput = (i: ExerciseInput) => !!i.text.trim() || !!i.files.length

/** A new exercise set: its first exercises and how its videos sound and look. */
export function NewExerciseSetDialog() {
  const open = useStore((s) => s.dialog?.kind === 'exercises')
  const defaultVoice = useStore((s) => s.settings?.defaultVoice)
  const hasKey = useStore((s) => !!s.settings?.hasElevenLabsKey)
  const omnivoice = useStore((s) => s.setup?.omnivoice)
  const elevenLabsCheck = useStore((s) => s.elevenLabsCheck)
  const [input, setInput] = useState(empty)
  const [title, setTitle] = useState('')
  const [level, setLevel] = useState('')
  const [aspect, setAspect] = useState<Aspect>('16:9')
  const [theme, setTheme] = useState<Theme>('dark')
  const [tone, setTone] = useState<Tone>(DEFAULT_TONE)
  const [language, setLanguage] = useState('en')
  const voice = useVoiceFor(language)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setInput(empty())
    setTitle('')
    setBusy(false)
    if (defaultVoice) setLanguage(defaultVoice.language)
  }, [open]) // a fresh form each time
  useEffect(() => {
    if (open && hasKey && defaultVoice?.provider === 'elevenlabs') void api.checkElevenLabsKey().then((c) => useStore.setState({ elevenLabsCheck: c }))
  }, [open, hasKey])

  const voiceIssue = voiceProblem(voice, hasKey, omnivoice, elevenLabsCheck)
  const languages = LANGUAGES.includes(language) ? LANGUAGES : [language, ...LANGUAGES]
  const start = async () => {
    if (!hasInput(input) || busy || voiceIssue) return
    setBusy(true)
    const ok = await createExerciseSet({
      title,
      level,
      language,
      aspect,
      theme,
      tone,
      voice,
      input,
    })
    if (!ok) setBusy(false)
  }

  return (
    <Modal
      open={open}
      onClose={closeDialog}
      title="New exercise set"
      icon={<GraduationCap className="head-icon" />}
      width={680}
      footer={
        <>
          <button className="btn ghost" onClick={closeDialog}>
            Cancel
          </button>
          <button className="btn primary" disabled={!hasInput(input) || busy || !!voiceIssue} title={voiceIssue ?? undefined} onClick={() => void start()}>
            {busy ? <span className="spinner" /> : <GraduationCap />} Solve them
          </button>
        </>
      }
    >
      <div className="modal-body quick-form">
        <p className="hint">
          Give it exercises, one or a whole sheet. Claude reads them, writes a checked step-by-step solution for each, then makes a short video of it. You can
          add more at any time, ask about any step, and join the videos into a lecture.
        </p>
        <ExerciseInputFields input={input} onChange={setInput} />
        <div className="quick-row">
          <div className="field">
            <label htmlFor="ex-title">Title</label>
            <input id="ex-title" className="input" placeholder="Optional: taken from the exercises" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ex-level">Who it’s for</label>
            <input id="ex-level" className="input" placeholder="e.g. Croatian matura, first-year physics" value={level} onChange={(e) => setLevel(e.target.value)} />
          </div>
        </div>
        <div className="quick-row">
          <div className="field">
            <label htmlFor="ex-lang">Language</label>
            <select id="ex-lang" className="select" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {languages.map((code) => (
                <option key={code} value={code}>
                  {languageName.of(code)}
                </option>
              ))}
            </select>
            {voice?.provider === 'elevenlabs' && voice.elevenlabs?.voiceName && <span className="hint">Voice: {voice.elevenlabs.voiceName}</span>}
          </div>
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

/** More exercises for the open set. */
export function AddExercisesDialog() {
  const open = useStore((s) => s.dialog?.kind === 'add-exercises')
  const set = useStore((s) => s.exerciseSet)
  const [input, setInput] = useState(empty)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) {
      setInput(empty())
      setBusy(false)
    }
  }, [open])
  if (!set) return null
  const add = async () => {
    setBusy(true)
    try {
      await api.addExercises(set.folder, input)
      closeDialog()
    } catch (e) {
      toast(errorText(e), 'error')
      setBusy(false)
    }
  }
  return (
    <Modal
      open={open}
      onClose={closeDialog}
      title={`Add exercises to “${set.title}”`}
      icon={<Plus className="head-icon" />}
      width={640}
      footer={
        <>
          <button className="btn ghost" onClick={closeDialog}>
            Cancel
          </button>
          <button className="btn primary" disabled={!hasInput(input) || busy} onClick={() => void add()}>
            {busy ? <span className="spinner" /> : <Plus />} Add and solve
          </button>
        </>
      }
    >
      <div className="modal-body quick-form">
        <ExerciseInputFields input={input} onChange={setInput} />
      </div>
    </Modal>
  )
}

/** The finished exercises' videos, joined in order into one lecture video. */
export function LectureDialog() {
  const open = useStore((s) => s.dialog?.kind === 'lecture')
  const set = useStore((s) => s.exerciseSet)
  const ready = set?.items.filter((i) => i.video) ?? []
  const [chosen, setChosen] = useState<string[]>([])
  useEffect(() => {
    if (open) setChosen(ready.map((i) => i.dir))
  }, [open])
  if (!set) return null
  return (
    <Modal
      open={open}
      onClose={closeDialog}
      title="Lecture video"
      icon={<Film className="head-icon" />}
      width={520}
      footer={
        <>
          <button className="btn ghost" onClick={closeDialog}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!chosen.length}
            onClick={() => {
              closeDialog()
              void api.makeLecture(set.folder, chosen).catch((e) => toast(errorText(e), 'error'))
            }}
          >
            <Film /> Make the lecture video
          </button>
        </>
      }
    >
      <div className="modal-body">
        <p className="hint">
          The videos are joined in order, with their subtitles and a chapter list for YouTube, in the set’s lecture folder. Nothing is rendered again, so it
          takes seconds.
        </p>
        <ul className="ex-lecture-list">
          {ready.map((i) => (
            <li key={i.dir}>
              <label className="export-check">
                <input
                  type="checkbox"
                  checked={chosen.includes(i.dir)}
                  onChange={(e) => setChosen(e.target.checked ? ready.filter((x) => x.dir === i.dir || chosen.includes(x.dir)).map((x) => x.dir) : chosen.filter((d) => d !== i.dir))}
                />
                <span className="mono faint">{i.number}</span> {i.title}
              </label>
            </li>
          ))}
        </ul>
        {ready.length < set.items.length && <p className="faint">Exercises still being made can be added once their video is done.</p>}
      </div>
    </Modal>
  )
}
