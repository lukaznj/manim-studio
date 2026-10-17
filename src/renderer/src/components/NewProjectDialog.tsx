import { t as uiText } from '../lib/i18n'
import { Clapperboard, FolderOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DEFAULT_TONE } from '../../../shared/tone'
import type { Aspect, Theme, Tone, VoiceSettings } from '../../../shared/types'
import { api } from '../lib/api'
import { closeDialog, createProject, useStore } from '../store'
import { Modal } from './ui'

export function NewProjectDialog() {
  const open = useStore((s) => s.dialog?.kind === 'new-project')
  const projectsDir = useStore((s) => s.settings?.projectsDir ?? '')
  const defaultVoice = useStore((s) => s.settings?.defaultVoice)
  const [name, setName] = useState('')
  const settings = useStore((s) => s.settings)
  const aspect: Aspect = settings?.defaultAspect ?? '16:9'
  const theme: Theme = settings?.defaultTheme ?? 'dark'
  const tone: Tone = settings?.defaultTone ?? DEFAULT_TONE
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
      title={uiText('New project')}
      icon={<Clapperboard className="head-icon" />}
      width={960}
      footer={
        <>
          <button className="btn ghost" onClick={closeDialog}>
            {uiText('Cancel')}
          </button>
          <button className="btn primary" disabled={!name.trim() || busy} onClick={() => void submit()}>
            {busy && <span className="spinner" />} {uiText(" Create project")}
          </button>
        </>
      }
    >
      <div className="modal-body new-project">
        <div className="np-main">
          <div className="field">
            <label htmlFor="np-name">{uiText('Video title')}</label>
            <input
              id="np-name"
              className="input"
              data-autofocus
              placeholder={uiText('e.g. Quadratic functions: the vertex of a parabola')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
            />
          </div>

          <div className="np-row">
            <div className="field grow">
              <span className="label">{uiText('Folder')}</span>
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
                  <FolderOpen /> {uiText(" Change")}
                </button>
              </div>
            </div>
          </div>
          <label className="export-check">
            <input type="checkbox" checked={scriptFirst} onChange={(e) => setScriptFirst(e.target.checked)} />
            <span>
              {uiText("Plan a script first ")}
              <span className="hint">
                {uiText("Claude writes the plan (the idea, each section's narration and visuals) for you to approve before the code.")}
              </span>
            </span>
          </label>
        </div>
      </div>
    </Modal>
  )
}
