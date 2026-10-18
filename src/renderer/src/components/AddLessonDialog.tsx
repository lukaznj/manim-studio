import { t as uiText } from '../lib/i18n'
import { FileText, Plus, X } from 'lucide-react'
import { useState } from 'react'
import type { WatchSeries } from '../../../shared/types'
import { api } from '../lib/api'
import { errorText, selectStudied, toast } from '../store'
import { Modal } from './ui'

/** Add a full lesson to this course; a follow-up remains a separate action attached to a moment. */
export function AddLessonDialog({ open, onClose, series }: { open: boolean; onClose: () => void; series: WatchSeries }) {
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [sources, setSources] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const add = async () => {
    setBusy(true)
    setError('')
    try {
      const dir = await api.addCourseLesson(series.folder, { title, prompt, sources })
      onClose()
      setTitle('')
      setPrompt('')
      setSources([])
      await selectStudied(dir)
      toast(uiText('Your lesson is being made. You can keep studying while it finishes.'), 'ok')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={uiText('Add lesson')}
      icon={<Plus className="head-icon" />}
      width={560}
      footer={
        <>
          <button className="btn ghost" disabled={busy} onClick={onClose}>
            {uiText('Cancel')}
          </button>
          <button className="btn primary" disabled={busy || !title.trim() || (!prompt.trim() && !sources.length)} onClick={() => void add()}>
            {busy ? <span className="spinner" /> : <Plus />}
            {uiText('Create lesson')}
          </button>
        </>
      }
    >
      <div className="modal-body quick-form">
        <p className="hint">
          {uiText('A new lesson for this course, using the same notation and video settings. It will appear after your existing lessons.')}
        </p>
        <div className="field">
          <label htmlFor="lesson-title">{uiText('Lesson title')}</label>
          <input className="input" id="lesson-title" data-autofocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="lesson-topic">{uiText('What would you like to learn?')}</label>
          <textarea
            className="textarea ex-input"
            id="lesson-topic"
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={uiText('Describe the topic, ask a question, or add PDFs below.')}
          />
        </div>
        <div className="study-lesson-sources">
          {sources.map((file) => (
            <div key={file}>
              <FileText />
              <span>{file.split(/[\\/]/).pop()}</span>
              <button className="icon-btn" aria-label={uiText('Remove PDF')} onClick={() => setSources((all) => all.filter((p) => p !== file))}>
                <X />
              </button>
            </div>
          ))}
          <button
            className="btn small"
            onClick={() =>
              void api
                .pickPdfs()
                .then((files) => setSources((all) => [...new Set([...all, ...files])]))
                .catch((e) => toast(errorText(e), 'error'))
            }
          >
            <Plus />
            {uiText('Add PDFs')}
          </button>
        </div>
        {error && (
          <p className="key-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
