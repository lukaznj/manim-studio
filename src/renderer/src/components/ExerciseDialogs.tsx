import { t as uiText, format } from '../lib/i18n'
import { Film, FileText, Image, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ExerciseInput } from '../../../shared/types'
import { api } from '../lib/api'
import { closeDialog, errorText, toast, useStore } from '../store'
import { Modal } from './ui'

const FILE = /\.(png|jpe?g|gif|webp|pdf)$/i
const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p

/** Exercises typed, pasted (screenshots), dropped or picked: one or many in each. */
function ExerciseInputFields({ input, onChange }: { input: ExerciseInput; onChange: (i: ExerciseInput) => void }) {
  const [dragging, setDragging] = useState(false)
  const add = (paths: string[]) => {
    const odd = paths.filter((p) => !FILE.test(p))
    if (odd.length) toast(format('Only pictures (PNG, JPEG, GIF, WebP) and PDFs can be added; skipped {0}.', [odd.map(fileName).join(', ')]), 'error')
    onChange({ ...input, files: [...input.files, ...paths.filter((p) => FILE.test(p) && !input.files.includes(p))] })
  }
  return (
    <>
      <div className="field">
        <label htmlFor="ex-text">{uiText('Exercises')}</label>
        <textarea
          id="ex-text"
          className="textarea ex-input"
          data-autofocus
          rows={6}
          placeholder={uiText(
            'Type or paste them here, one or many, e.g.\n1. Solve x² − 5x + 6 = 0.\n2. A ball is thrown at 12 m/s at 30°. How far does it fly?\n\nPaste a screenshot with ⌘V / Ctrl+V.',
          )}
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
            <button aria-label={format('Remove {0}', [fileName(p)])} onClick={() => onChange({ ...input, files: input.files.filter((x) => x !== p) })}>
              <X />
            </button>
          </span>
        ))}
        <button className="btn small" onClick={() => void api.pickExerciseFiles().then(add)}>
          <Plus /> {input.files.length ? uiText('Add more') : uiText('Add pictures or PDFs')}
        </button>
        {!input.files.length && <span className="hint">{uiText('or drop them here: photos of a textbook page, screenshots, a problem sheet.')}</span>}
      </div>
    </>
  )
}

const empty = (): ExerciseInput => ({ text: '', files: [] })
const hasInput = (i: ExerciseInput) => !!i.text.trim() || !!i.files.length

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
      title={format('Add exercises to “{0}”', [set.title])}
      icon={<Plus className="head-icon" />}
      width={640}
      footer={
        <>
          <button className="btn ghost" onClick={closeDialog}>
            {uiText('Cancel')}
          </button>
          <button className="btn primary" disabled={!hasInput(input) || busy} onClick={() => void add()}>
            {busy ? <span className="spinner" /> : <Plus />} {uiText(" Add and solve")}
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
      title={uiText('Lecture video')}
      icon={<Film className="head-icon" />}
      width={520}
      footer={
        <>
          <button className="btn ghost" onClick={closeDialog}>
            {uiText('Cancel')}
          </button>
          <button
            className="btn primary"
            disabled={!chosen.length}
            onClick={() => {
              closeDialog()
              void api.makeLecture(set.folder, chosen).catch((e) => toast(errorText(e), 'error'))
            }}
          >
            <Film /> {uiText(" Make the lecture video")}
          </button>
        </>
      }
    >
      <div className="modal-body">
        <p className="hint">
          {uiText(
            'The videos are joined in order, with their subtitles and a chapter list for YouTube, in the set’s lecture folder. Nothing is rendered again, so it takes seconds.',
          )}
        </p>
        <ul className="ex-lecture-list">
          {ready.map((i) => (
            <li key={i.dir}>
              <label className="export-check">
                <input
                  type="checkbox"
                  checked={chosen.includes(i.dir)}
                  onChange={(e) =>
                    setChosen(
                      e.target.checked ? ready.filter((x) => x.dir === i.dir || chosen.includes(x.dir)).map((x) => x.dir) : chosen.filter((d) => d !== i.dir),
                    )
                  }
                />
                <span className="mono faint">{i.number}</span> {i.title}
              </label>
            </li>
          ))}
        </ul>
        {ready.length < set.items.length && <p className="faint">{uiText('Exercises still being made can be added once their video is done.')}</p>}
      </div>
    </Modal>
  )
}
