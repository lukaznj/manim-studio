import { t as uiText, format } from '../lib/i18n'
import { Download, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Aspect, ExportFps, ExportOptions, ExportSize, Theme } from '../../../shared/types'
import { api } from '../lib/api'
import { LANGUAGES, languageName } from '../lib/languages'
import { closeDialog, errorText, studying, toast, updateMeta, useStore } from '../store'
import { Modal, Tabs } from './ui'

/**
 * One video, then an audio track and subtitles per language: what YouTube asks for. Light and dark
 * versions come from the same scene. Everything lands in exports/<name>/ (see src/main/export.ts).
 * Export queues it and closes: it runs in the background, listed under the title bar's Exports.
 */
/** Where an export renders: this computer, or a paired render server (ADR 0021). Developer mode only, once one is paired. */
export function ExportOn({ value, onChange }: { value?: string; onChange: (server: string | undefined) => void }) {
  const servers = useStore((s) => s.settings?.renderServers ?? [])
  const developer = useStore((s) => !!s.settings?.developerMode)
  if (!servers.length || !developer) return null
  const current = servers.some((s) => s.id === value) ? value : undefined
  return (
    <div className="field">
      <label htmlFor="export-on">{uiText('Render on')}</label>
      <select id="export-on" className="select" value={current ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">{uiText('This computer')}</option>
        {servers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.cores ? format(' ({0} cores)', [s.cores]) : ''}
            {uiText(': this computer stays free')}
          </option>
        ))}
      </select>
    </div>
  )
}

export function ExportDialog() {
  const open = useStore((s) => s.dialog?.kind === 'export')
  const project = useStore((s) => s.project)
  const timeline = useStore((s) => s.timeline)
  const settings = useStore((s) => s.settings)
  const editing = useStore((s) => !studying(s))
  const [options, setOptions] = useState<ExportOptions>({
    themes: ['dark'],
    languages: [],
    languageVideos: false,
  })
  const [running, setRunning] = useState(false) // only while it's being queued

  const meta = project?.meta
  const original = meta?.voice.language ?? 'en'

  useEffect(() => {
    if (!open) return
    if (meta)
      setOptions({
        themes: [meta.theme],
        languages: [],
        languageVideos: false,
        ...meta.export,
        size: meta.export?.size ?? settings?.studySize ?? 1080,
        fps: meta.export?.fps ?? (meta.fps === 60 ? 60 : 30),
        // Render servers are developer-only (ADR 0021): a server remembered from before stays unused.
        server: settings?.developerMode ? meta.export?.server : undefined,
      })
  }, [open])

  const toggleTheme = (theme: Theme) =>
    setOptions((o) => {
      const themes = o.themes.includes(theme) ? o.themes.filter((t) => t !== theme) : [...o.themes, theme]
      return {
        ...o,
        themes: themes.length ? (['dark', 'light'] as Theme[]).filter((t) => themes.includes(t)) : o.themes,
      } // never none
    })
  const setLanguages = (languages: string[]) => setOptions((o) => ({ ...o, languages }))

  const start = async () => {
    setRunning(true)
    try {
      const selected = editing ? options : { ...options, aspect: undefined }
      await updateMeta({ export: selected })
      const job = await api.queueExport(selected)
      closeDialog()
      const ahead = useStore.getState().exports.filter((j) => j.id !== job.id && (j.state === 'running' || j.state === 'waiting')).length
      toast(
        ahead
          ? `Export queued after ${ahead === 1 ? 'one other' : `${ahead} others`}. Keep working; Exports in the title bar shows it.`
          : 'Exporting in the background. Keep working; Exports in the title bar shows it.',
        'ok',
      )
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setRunning(false)
    }
  }

  const aspect = editing ? options.aspect ?? meta?.aspect ?? '16:9' : meta?.aspect ?? '16:9'
  const portrait = aspect === '9:16'
  const size = options.size ?? 1080
  const fps = options.fps ?? 30
  const long = Math.round((size * 16) / 9 / 2) * 2 // as the runner computes it
  const res = portrait ? `${size} × ${long}` : `${long} × ${size}`
  const both = options.themes.length > 1
  const extra = options.languages.filter((l) => l !== original)
  const offered = LANGUAGES.filter((l) => l !== original && !options.languages.includes(l))
  const sep = project?.path.includes('\\') ? '\\' : '/'
  const projectExports = project ? `${project.path}${sep}exports` : ''
  const destination = options.folder ?? projectExports
  const chooseFolder = async () => {
    const dir = await api.pickFolder('Export to', destination)
    // The project's own exports/ folder is the default, not a choice to remember.
    if (dir)
      setOptions((o) => ({
        ...o,
        folder: dir === projectExports ? undefined : dir,
      }))
  }

  return (
    <Modal
      open={open}
      onClose={closeDialog}
      title={uiText('Export video')}
      icon={<Download className="head-icon" />}
      width={600}
      footer={
        <>
          <button className="btn ghost" onClick={closeDialog}>
            {uiText('Cancel')}
          </button>
          <button className="btn primary" disabled={running || !timeline} onClick={() => void start()}>
            <Download /> {uiText(" Export")}
          </button>
        </>
      }
    >
      <div className="modal-body export">
        {editing && <div className="export-option">
          <strong>{uiText('Aspect ratio')}</strong>
          <Tabs radio="Aspect ratio" value={aspect} onChange={(value) => setOptions((o) => ({ ...o, aspect: value as Aspect }))}
            items={[{ value: '16:9', label: '16:9 landscape' }, { value: '9:16', label: '9:16 portrait' }]} />
        </div>}
        <div className="export-option">
          <strong>{uiText('Versions')}</strong>
          <div className="theme-swatches">
            {(['dark', 'light'] as Theme[]).map((t) => (
              <button
                key={t}
                role="checkbox"
                aria-checked={options.themes.includes(t)}
                className={`swatch theme-${t} ${options.themes.includes(t) ? 'on' : ''}`}
                onClick={() => toggleTheme(t)}
              >
                <span className="swatch-chip" /> {t === 'dark' ? uiText('Dark') : uiText('Light')}
              </button>
            ))}
          </div>
        </div>
        <div className="export-option">
          <strong>{uiText('Quality')}</strong>
          <select
            className="select"
            aria-label={uiText('Quality')}
            value={`${size}-${fps}`}
            onChange={(e) => {
              const [nextSize, nextFps] = e.target.value.split('-').map(Number)
              setOptions((o) => ({ ...o, size: nextSize as ExportSize, fps: nextFps as ExportFps }))
            }}
          >
            {[720, 1080, 1440].flatMap((s) => [30, 60].map((f) => (
              <option key={`${s}-${f}`} value={`${s}-${f}`}>{s}p · {f} fps</option>
            )))}
          </select>
        </div>
        <div className="export-option">
          <strong>{uiText('Narration languages')}</strong>
          <div className="language-picker">
            <span className="lang-chip fixed">{languageName.of(original)}</span>
            {extra.map((l) => (
              <span key={l} className="lang-chip">
                {languageName.of(l)}
                <button aria-label={format('Remove {0}', [languageName.of(l)])} onClick={() => setLanguages(options.languages.filter((x) => x !== l))}>
                  <X />
                </button>
              </span>
            ))}
            <select
              className="select lang-add"
              value=""
              onChange={(e) => e.target.value && setLanguages([...options.languages, e.target.value])}
              aria-label={uiText('Add a language')}
            >
              <option value="">{uiText('Add a language…')}</option>
              {offered.map((l) => (
                <option key={l} value={l}>
                  {languageName.of(l)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {extra.length > 0 && (
          <label className="export-check">
            <input type="checkbox" checked={options.languageVideos} onChange={(e) => setOptions((o) => ({ ...o, languageVideos: e.target.checked }))} />
            {uiText('Also a full video per language, for sites without audio tracks')}
          </label>
        )}

        <ExportOn value={options.server} onChange={(server) => setOptions((o) => ({ ...o, server }))} />

        <div className="export-option">
          <strong>{uiText('Save to')}</strong>
          <div className="save-video-folder">
            <span className="mono" title={destination}>{options.folder ? destination.split(/[\\/]/).filter(Boolean).pop() : 'exports'}</span>
            {options.folder && (
              <button className="btn small ghost" onClick={() => setOptions((o) => ({ ...o, folder: undefined }))}>
                {uiText('Use project folder')}
              </button>
            )}
            <button className="btn small" onClick={() => void chooseFolder()}>{uiText('Change')}</button>
          </div>
        </div>
        <p className="hint export-summary mono">
          {[`${both ? uiText('Two videos') : 'MP4'} ${res} · ${fps} fps`, uiText('Subtitles'), uiText('Thumbnail'), extra.length ? `${uiText('Audio tracks')}: ${extra.map((l) => languageName.of(l)).join(', ')}` : ''].filter(Boolean).join(' · ')}
        </p>
      </div>
    </Modal>
  )
}
