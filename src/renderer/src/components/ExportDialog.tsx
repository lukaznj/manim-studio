import { AudioLines, Captions, Check, CircleAlert, Download, FileVideo, FolderOpen, Image, Languages, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ExportFps, ExportOptions, ExportResult, ExportSize, Theme } from '../../../shared/types'
import { api } from '../lib/api'
import { LANGUAGES, languageName } from '../lib/languages'
import { revealLabel } from '../lib/platform'
import { closeDialog, errorText, updateMeta, useStore } from '../store'
import { Modal, ProgressLine, Tabs } from './ui'

const PROVIDER_NAMES = { elevenlabs: 'ElevenLabs', omnivoice: 'OmniVoice' } as const

/**
 * One video, then an audio track and subtitles per language: what YouTube asks for. Light and dark
 * versions come from the same scene. Everything lands in exports/<name>/ (see src/main/export.ts).
 */
export function ExportDialog() {
  const open = useStore((s) => s.dialog?.kind === 'export')
  const project = useStore((s) => s.project)
  const timeline = useStore((s) => s.timeline)
  const final = useStore((s) => s.finalRender)
  const exportState = useStore((s) => s.exportState)
  const [options, setOptions] = useState<ExportOptions>({ themes: ['dark'], languages: [], languageVideos: false })
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ExportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const meta = project?.meta
  const original = meta?.voice.language ?? 'en'

  useEffect(() => {
    if (!open || running) return
    setResult(null)
    setError(null)
    useStore.setState({ exportState: null })
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
      return { ...o, themes: themes.length ? (['dark', 'light'] as Theme[]).filter((t) => themes.includes(t)) : o.themes } // never none
    })
  const setLanguages = (languages: string[]) => setOptions((o) => ({ ...o, languages }))

  const start = async () => {
    setRunning(true)
    setError(null)
    try {
      await updateMeta({ export: options })
      setResult(await api.exportVideo(options))
    } catch (e) {
      setError(errorText(e))
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
  const slower = size === 1440 && fps === 60 ? 'about twice as long' : size === 1440 || fps === 60 ? 'about 1.5× as long' : null
  const both = options.themes.length > 1
  const extra = options.languages.filter((l) => l !== original)
  const rendering = final.status === 'rendering' && timeline?.duration ? (final.t ?? 0) / timeline.duration : undefined
  const offered = LANGUAGES.filter((l) => l !== original && !options.languages.includes(l))
  const sep = project?.path.includes('\\') ? '\\' : '/'
  const projectExports = project ? `${project.path}${sep}exports` : ''
  const destination = options.folder ?? projectExports
  const chooseFolder = async () => {
    const dir = await api.pickFolder('Export to', destination)
    // The project's own exports/ folder is the default, not a choice to remember.
    if (dir) setOptions((o) => ({ ...o, folder: dir === projectExports ? undefined : dir }))
  }
  /** Inside the project, the path from there (exports/<name>); anywhere else, the whole path. */
  const shown = (folder: string) =>
    project && folder.startsWith(project.path + sep) ? folder.slice(project.path.length + 1).replaceAll('\\', '/') : folder

  return (
    <Modal
      open={open}
      onClose={() => !running && closeDialog()}
      title="Export video"
      icon={<Download className="head-icon" />}
      width={600}
      footer={
        result ? (
          <>
            <button className="btn ghost" onClick={closeDialog}>
              Close
            </button>
            <button className="btn primary" onClick={() => void api.reveal(result.files[0] ?? result.folder)}>
              <FolderOpen /> {revealLabel}
            </button>
          </>
        ) : (
          <>
            <button className="btn ghost" disabled={running} onClick={closeDialog}>
              Cancel
            </button>
            <button className="btn primary" disabled={running || !timeline} onClick={() => void start()}>
              {running ? <span className="spinner" /> : <Download />} {running ? 'Exporting…' : 'Export'}
            </button>
          </>
        )
      }
    >
      <div className="modal-body export">
        {!result && (
          <>
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
                    disabled={running}
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
                  1440p keeps thin lines and small text sharp, also after YouTube compresses the video. 60 fps makes motion smoother.
                  {slower && ` Exporting takes ${slower}.`}
                </div>
              </div>
              <div className="export-quality">
                <Tabs
                  radio="Resolution"
                  value={String(size)}
                  disabled={running}
                  onChange={(v) => setOptions((o) => ({ ...o, size: Number(v) as ExportSize }))}
                  items={[
                    { value: '1080', label: '1080p' },
                    { value: '1440', label: '1440p' },
                  ]}
                />
                <Tabs
                  radio="Frame rate"
                  value={String(fps)}
                  disabled={running}
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
                    <button aria-label={`Remove ${languageName.of(l)}`} disabled={running} onClick={() => setLanguages(options.languages.filter((x) => x !== l))}>
                      <X />
                    </button>
                  </span>
                ))}
                <select
                  className="select lang-add"
                  value=""
                  disabled={running}
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
                  disabled={running}
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
                <Image /> <strong>Thumbnail</strong> <span className="mono faint">.jpg, the busiest frame</span>
              </li>
            </ul>

            <div className="field">
              <span className="label">Save to</span>
              <div className="path-pick">
                <span className="mono path-text" title={destination}>
                  {destination}
                </span>
                {options.folder && (
                  <button className="btn small ghost" disabled={running} onClick={() => setOptions((o) => ({ ...o, folder: undefined }))}>
                    Use project folder
                  </button>
                )}
                <button className="btn small" disabled={running} onClick={() => void chooseFolder()}>
                  <FolderOpen /> Change
                </button>
              </div>
              <span className="hint">The files go in a folder named after the video.</span>
            </div>
          </>
        )}

        {running && (
          <div className="export-progress">
            <div className="hint">
              {exportState?.stage ?? 'Starting…'}
              {exportState?.stage?.startsWith('Rendering') && rendering !== undefined ? ` · ${Math.round(rendering * 100)}%` : ''}
            </div>
            <ProgressLine value={exportState?.percent ?? (exportState?.stage?.startsWith('Rendering') ? rendering : undefined)} />
            <p className="hint">A full-quality render takes longer than the preview; unchanged parts are reused from the cache.</p>
          </div>
        )}
        {result && (
          <div className="export-result">
            <div className="export-done">
              <Check /> Saved {result.files.length} files in <span className="mono">{shown(result.folder)}</span>
            </div>
            <ul className="export-list mono">
              {result.files.map((f) => (
                <li key={f}>{f.split(/[\\/]/).pop()}</li>
              ))}
            </ul>
            {result.warnings.length > 0 && (
              <div className="export-warnings">
                {result.warnings.map((w) => (
                  <div key={w}>
                    <CircleAlert /> {w}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {error && (
          <div className="export-error">
            <CircleAlert /> {error}
          </div>
        )}
      </div>
    </Modal>
  )
}
