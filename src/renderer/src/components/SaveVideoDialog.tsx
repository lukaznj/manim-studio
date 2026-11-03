import { t as uiText, format } from '../lib/i18n'
import { Download, FolderOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { SubtitleCopy, VideoCopyInfo } from '../../../shared/types'
import { api } from '../lib/api'
import { revealLabel } from '../lib/platform'
import { closeDialog, errorText, toast, useStore } from '../store'
import { Modal, ProgressLine, Tabs } from './ui'

const HINTS: Record<SubtitleCopy, string> = {
  file: 'An .srt file with the same name beside the video. Most players show it by themselves, and YouTube takes it as captions.',
  burn: 'Drawn into the picture, so they always show, in your subtitle style (Settings → Video). The video is encoded again, which takes a while.',
  none: 'Only the video.',
}

/**
 * Save video (ADR 0062): a copy of a project's newest export in a folder of your choice
 * (Downloads at first), with its subtitles as a file, burned in, or left out.
 */
export function SaveVideoDialog() {
  const project = useStore((s) => (s.dialog?.kind === 'save-video' ? s.dialog.project : null))
  const [info, setInfo] = useState<VideoCopyInfo | null>(null)
  const [folder, setFolder] = useState('')
  const [mode, setMode] = useState<SubtitleCopy>('file')
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [percent, setPercent] = useState<number | undefined>()
  const [saved, setSaved] = useState<string[]>([])

  useEffect(() => {
    if (!project) return
    setInfo(null)
    setState('idle')
    setSaved([])
    void api.videoCopyInfo(project).then(
      (next) => {
        setInfo(next)
        setFolder(next.folder)
        setMode(next.subtitles ? next.mode : 'none')
      },
      (e) => {
        toast(errorText(e), 'error')
        closeDialog()
      },
    )
  }, [project])
  useEffect(() => api.on('save-copy', (e) => e.project === project && setPercent(e.percent)), [project])

  const save = async () => {
    if (!project) return
    setState('saving')
    setPercent(undefined)
    try {
      setSaved(await api.saveVideoCopy(project, { folder, subtitles: mode }))
      setState('saved')
    } catch (e) {
      toast(errorText(e), 'error')
      setState('idle')
    }
  }
  const choose = async () => {
    const picked = await api.pickFolder(uiText('Choose where to save the video'), folder)
    if (picked) setFolder(picked)
  }

  return (
    <Modal
      open={!!project}
      onClose={() => state !== 'saving' && closeDialog()}
      title={uiText('Save video')}
      icon={<Download className="head-icon" />}
      width={520}
      footer={
        state === 'saved' ? (
          <>
            <button className="btn ghost" onClick={() => void api.reveal(saved[0])}>
              <FolderOpen /> {revealLabel()}
            </button>
            <button className="btn primary" data-autofocus onClick={closeDialog}>
              {uiText('Done')}
            </button>
          </>
        ) : info?.video ? (
          <>
            <button className="btn ghost" disabled={state === 'saving'} onClick={closeDialog}>
              {uiText('Cancel')}
            </button>
            <button className="btn primary" data-autofocus disabled={state === 'saving' || !folder} onClick={() => void save()}>
              {state === 'saving' ? <span className="spinner" /> : <Download />} {uiText('Save video')}
            </button>
          </>
        ) : (
          <button className="btn primary" onClick={closeDialog}>
            {uiText('Close')}
          </button>
        )
      }
    >
      <div className="modal-body set-group save-video">
        {!info ? (
          <span className="hint">
            <span className="spinner" />
          </span>
        ) : !info.video ? (
          <p>{uiText('This video hasn’t been exported yet. Export it first, then save a copy.')}</p>
        ) : state === 'saved' ? (
          <div className="save-video-done">
            <p className="save-video-name">{saved[0]?.split(/[\\/]/).pop()}</p>
            <span>{format('Saved to {0}', [folder.split(/[\\/]/).filter(Boolean).pop() ?? folder])}</span>
            {saved.length > 1 && <span className="hint">{uiText('With its subtitles as an .srt file beside it.')}</span>}
          </div>
        ) : (
          <>
            <p className="save-video-name">{info.name}</p>
            <div className="field">
              <span className="label">{uiText('Folder')}</span>
              <div className="save-video-folder">
                <span className="mono" title={folder}>
                  {folder}
                </span>
                <button className="btn small" disabled={state === 'saving'} onClick={() => void choose()}>
                  {uiText('Change')}
                </button>
              </div>
            </div>
            <div className="field">
              <span className="label">{uiText('Subtitles')}</span>
              {info.subtitles ? (
                <Tabs
                  radio="Subtitles"
                  value={mode}
                  onChange={(next) => state !== 'saving' && setMode(next)}
                  items={[
                    { value: 'file', label: 'As a file' },
                    { value: 'burn', label: 'Burned in' },
                    { value: 'none', label: 'None' },
                  ]}
                />
              ) : null}
              <span className="hint">{info.subtitles ? uiText(HINTS[mode]) : uiText('This export has no subtitles.')}</span>
            </div>
            {state === 'saving' && (
              <div className="save-video-progress" role="status">
                <ProgressLine value={mode === 'burn' ? percent : undefined} />
                <span className="hint">
                  {mode === 'burn' ? format('Burning in the subtitles… {0}%', [Math.round((percent ?? 0) * 100)]) : uiText('Copying the video…')}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
