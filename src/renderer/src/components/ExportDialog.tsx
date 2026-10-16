import { AudioLines, Captions, Download, FileVideo, FolderOpen, Image, Languages, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ExportFps, ExportOptions, ExportSize, Theme } from '../../../shared/types'
import { api } from '../lib/api'
import { LANGUAGES, languageName } from '../lib/languages'
import { closeDialog, errorText, toast, updateMeta, useStore } from '../store'
import { Modal, Tabs } from './ui'

const PROVIDER_NAMES = {
  elevenlabs: 'ElevenLabs',
  omnivoice: 'OmniVoice',
} as const

/**
 * One video, then an audio track and subtitles per language: what YouTube asks for. Light and dark
 * versions come from the same scene. Everything lands in exports/<name>/ (see src/main/export.ts).
 * Export queues it and closes: it runs in the background, listed under the title bar's Exports.
 */
/** Where an export renders: this computer, or a paired render server (ADR 0021). Hidden until one is paired. */
export function ExportOn({ value, onChange }: { value?: string; onChange: (server: string | undefined) => void }) {
  const servers = useStore((s) => s.settings?.renderServers ?? [])
  if (!servers.length) return null
  const current = servers.some((s) => s.id === value) ? value : undefined
  return (
    <div className="field">
      <label htmlFor="export-on">Render on</label>
      <select id="export-on" className="select" value={current ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">This computer</option>
        {servers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.cores ? ` (${s.cores} cores)` : ''}: this computer stays free
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
        size: meta.export?.size ?? 1080,
        fps: meta.export?.fps ?? (meta.fps === 60 ? 60 : 30),
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
      await updateMeta({ export: options })
      const job = await api.queueExport(options)
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

  const portrait = meta?.aspect === '9:16'
  const size = options.size ?? 1080
  const fps = options.fps ?? 30
  const long = Math.round((size * 16) / 9 / 2) * 2 // as the runner computes it
  const res = portrait ? `${size} × ${long}` : `${long} × ${size}`
  // Measured on a 46 s scene: 1440p or 60 fps about 1.5×, both about 2× (docs/02-architecture/render-performance.md).
  // 720p: about 2.3× faster than 1080p (a 24 s scene, 4 cores, ADR 0035).
  const slower =
    size === 720
      ? fps === 60
        ? null
        : 'about half as long'
      : size === 1440 && fps === 60
        ? 'about twice as long'
        : size === 1440 || fps === 60
          ? 'about 1.5× as long'
          : null
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
      title="Export video"
      icon={<Download className="head-icon" />}
      width={600}
      footer={
        <>
          <button className="btn ghost" onClick={closeDialog}>
            Cancel
          </button>
          <button className="btn primary" disabled={running || !timeline} onClick={() => void start()}>
            <Download /> Export
          </button>
        </>
      }
    >
      <div className="modal-body export">
        <div className="export-option">
          <div>
            <strong>Versions</strong>
            <div className="hint">The same video in the light and the dark theme, from one scene.</div>
          </div>
          <div className="theme-swatches">
            {(['dark', 'light'] as Theme[]).map((t) => (
              <button
                key={t}
                role="checkbox"
                aria-checked={options.themes.includes(t)}
                className={`swatch theme-${t} ${options.themes.includes(t) ? 'on' : ''}`}

                onClick={() => toggleTheme(t)}
              >
                <span className="swatch-chip" /> {t === 'dark' ? 'Dark' : 'Light'}
              </button>
            ))}
          </div>
        </div>

        <div className="export-option">
          <div>
            <strong>Quality</strong>
            <div className="hint">
              720p is the fastest, plenty to watch on a laptop. 1440p keeps thin lines and small text sharp, also after YouTube compresses the video. 60 fps makes motion smoother.
              {slower && ` Exporting takes ${slower}.`}
            </div>
          </div>
          <div className="export-quality">
            <Tabs
              radio="Resolution"
              value={String(size)}

              onChange={(v) => setOptions((o) => ({ ...o, size: Number(v) as ExportSize }))}
              items={[
                { value: '720', label: '720p' },
                { value: '1080', label: '1080p' },
                { value: '1440', label: '1440p' },
              ]}
            />
            <Tabs
              radio="Frame rate"
              value={String(fps)}

              onChange={(v) => setOptions((o) => ({ ...o, fps: Number(v) as ExportFps }))}
              items={[
                { value: '30', label: '30 fps' },
                { value: '60', label: '60 fps' },
              ]}
            />
          </div>
        </div>

        <div className="export-option">
          <div>
            <strong>Narration languages</strong>
            <div className="hint">
              {languageName.of(original)} plus any you add: Claude translates the narration (kept in voice/translations/, so you can correct it), and{' '}
              {meta ? PROVIDER_NAMES[meta.voice.provider] : 'the project’s voice'} speaks it over the same video.
            </div>
          </div>
          <div className="language-picker">
            <span className="lang-chip fixed">{languageName.of(original)}</span>
            {extra.map((l) => (
              <span key={l} className="lang-chip">
                {languageName.of(l)}
                <button aria-label={`Remove ${languageName.of(l)}`} onClick={() => setLanguages(options.languages.filter((x) => x !== l))}>
                  <X />
                </button>
              </span>
            ))}
            <select
              className="select lang-add"
              value=""

              onChange={(e) => e.target.value && setLanguages([...options.languages, e.target.value])}
              aria-label="Add a language"
            >
              <option value="">Add a language…</option>
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
            <input
              type="checkbox"
              checked={options.languageVideos}

              onChange={(e) => setOptions((o) => ({ ...o, languageVideos: e.target.checked }))}
            />
            Also a full video per language, for sites without audio tracks
          </label>
        )}

        <ul className="export-files">
          <li>
            <FileVideo /> <strong>{both ? 'Two videos' : 'Video'}</strong>{' '}
            <span className="mono faint">
              .mp4 · {res} · {fps} fps{both ? ' · dark and light' : ''}
            </span>
          </li>
          {extra.length > 0 && (
            <li>
              <AudioLines /> <strong>Audio tracks</strong> <span className="mono faint">.m4a · {extra.map((l) => languageName.of(l)).join(', ')}</span>
            </li>
          )}
          <li>
            <Captions /> <strong>Subtitles</strong>{' '}
            <span className="mono faint">.srt + .vtt · {[original, ...extra].map((l) => languageName.of(l)).join(', ')}</span>
          </li>
          {extra.length > 0 && options.languageVideos && (
            <li>
              <Languages /> <strong>A video per language</strong> <span className="mono faint">.mp4 with that language’s narration</span>
            </li>
          )}
          <li>
            <Image /> <strong>Thumbnail</strong> <span className="mono faint">.jpg, the key picture with its hook</span>
          </li>
        </ul>

        <ExportOn value={options.server} onChange={(server) => setOptions((o) => ({ ...o, server }))} />

        <div className="field">
          <span className="label">Save to</span>
          <div className="path-pick">
            <span className="mono path-text" title={destination}>
              {destination}
            </span>
            {options.folder && (
              <button className="btn small ghost" onClick={() => setOptions((o) => ({ ...o, folder: undefined }))}>
                Use project folder
              </button>
            )}
            <button className="btn small" onClick={() => void chooseFolder()}>
              <FolderOpen /> Change
            </button>
          </div>
          <span className="hint">The files go in a folder named after the video.</span>
        </div>
      </div>
    </Modal>
  )
}
