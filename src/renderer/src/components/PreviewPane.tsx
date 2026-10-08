import { Captions, ChevronDown, CircleAlert, Code2, Sparkles, TriangleAlert, Wrench } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { editorBridge } from '../lib/editor-bridge'
import { playback } from '../lib/playback'
import { openDialog, renderNow, saveScene, sendChat, useStore } from '../store'

export function PreviewPane() {
  const timeline = useStore((s) => s.timeline)
  const render = useStore((s) => s.render)
  const env = useStore((s) => s.setup?.env)
  const dirty = useStore((s) => s.dirty)
  const stale = useStore((s) => s.stale)
  const aspect = useStore((s) => s.project?.meta.aspect ?? '16:9')
  const stage = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [captions, setCaptions] = useState(true)
  const [warningsOpen, setWarningsOpen] = useState(false)

  const ratio = timeline ? timeline.width / timeline.height : aspect === '9:16' ? 9 / 16 : 16 / 9
  const box = useFit(stage, ratio)

  useEffect(() => {
    playback.attach(video.current)
    return () => playback.attach(null)
  }, [timeline?.video])

  const src = timeline ? `${api.mediaUrl(timeline.video)}?v=${timeline.renderedAt}` : undefined
  const warnings = timeline?.warnings ?? []

  return (
    <div className="preview-pane">
      <div className="stage" ref={stage}>
        <div className={`frame ${render.status === 'rendering' ? 'rendering' : ''}`} style={{ width: box.w, height: box.h }}>
          {src ? (
            <video ref={video} src={src} preload="auto" playsInline onClick={() => playback.toggle()} />
          ) : (
            <div className="frame-empty">
              {env !== 'ready' ? (
                <>
                  <Wrench />
                  <p>Za pregled treba instalirati manim okruženje.</p>
                  <button className="btn" onClick={() => openDialog({ kind: 'settings', tab: 'env' })}>
                    Otvori okruženje
                  </button>
                </>
              ) : render.status === 'rendering' ? (
                <>
                  <span className="spinner big" />
                  <p>Prvi render… manim crta sve kadrove, sljedeći idu brže.</p>
                </>
              ) : (
                <>
                  <Code2 />
                  <p>
                    Spremi scenu (<span className="kbd">⌘S</span>) za prvi pregled.
                  </p>
                  <button className="btn" onClick={() => void saveScene({ render: true })}>
                    Renderiraj
                  </button>
                </>
              )}
            </div>
          )}
          {captions && timeline && <CaptionOverlay />}
          {render.status === 'rendering' && src && (
            <div className="frame-status">
              <span className="spinner" /> Renderiram{render.expected ? ` ${render.clips ?? 0}/${render.expected}` : '…'}
            </div>
          )}
        </div>
        {render.status === 'error' && render.error && <ErrorCard />}
      </div>

      <div className="preview-foot">
        <div className="preview-flags">
          {(dirty || stale) && render.status !== 'rendering' && (
            <button className="flag sun" onClick={() => void saveScene({ render: true })} title="Spremi i renderiraj">
              Pregled ne odgovara kodu · <span className="kbd">⌘S</span>
            </button>
          )}
          {warnings.length > 0 && (
            <div className="popover-anchor">
              <button className="flag coral" onClick={() => setWarningsOpen((o) => !o)}>
                <TriangleAlert /> {warnings.length === 1 ? '1 upozorenje' : `${warnings.length} upozorenja`} <ChevronDown />
              </button>
              {warningsOpen && (
                <div className="popover warnings-pop" onMouseLeave={() => setWarningsOpen(false)}>
                  {warnings.map((w, i) => (
                    <button
                      key={i}
                      className="warning-row"
                      onClick={() => {
                        playback.seek(w.start + 0.01)
                        if (w.line) editorBridge.revealLine(w.line, true)
                      }}
                    >
                      <span className="mono faint">{w.start.toFixed(1)}s</span>
                      <span>{w.message}</span>
                      {w.line && <span className="mono faint">r. {w.line}</span>}
                    </button>
                  ))}
                  <button
                    className="btn small"
                    onClick={() => {
                      setWarningsOpen(false)
                      void sendChat(
                        'Render prijavljuje probleme s rasporedom (tekst izvan kadra ili preklapanja). Pogledaj kadrove i popravi raspored, pa provjeri ponovno.',
                        false,
                      )
                    }}
                  >
                    <Sparkles /> Neka Claude popravi raspored
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="preview-tools">
          {timeline && (
            <span className="faint mono">
              {timeline.width}×{timeline.height} · {timeline.fps} fps · render {timeline.renderSeconds.toFixed(1)} s
            </span>
          )}
          <button className={`icon-btn ${captions ? 'on' : ''}`} onClick={() => setCaptions((c) => !c)} title="Prikaži titlove u pregledu">
            <Captions />
          </button>
        </div>
      </div>
    </div>
  )
}

function CaptionOverlay() {
  const subtitles = useStore((s) => s.timeline?.subtitles ?? [])
  const [text, setText] = useState('')
  useEffect(
    () => playback.subscribe((t) => setText(subtitles.find((s) => t >= s.start && t <= s.end)?.text ?? '')),
    [subtitles],
  )
  return <div className={`captions ${text ? 'on' : ''}`}>{text && <span>{text}</span>}</div>
}

function ErrorCard() {
  const error = useStore((s) => s.render.error)!
  const chatBusy = useStore((s) => s.chatBusy)
  const [details, setDetails] = useState(false)
  return (
    <div className="error-card">
      <div className="error-title">
        <CircleAlert />
        <strong>{error.line ? `Greška u retku ${error.line}` : 'Render nije uspio'}</strong>
      </div>
      <p className="mono error-msg">{error.message}</p>
      {details && <pre className="mono error-trace">{error.traceback || error.log}</pre>}
      <div className="error-actions">
        <button className="btn ghost small" onClick={() => setDetails((d) => !d)}>
          {details ? 'Sakrij detalje' : 'Prikaži detalje'}
        </button>
        {error.line && (
          <button className="btn small" onClick={() => editorBridge.revealLine(error.line!, true)}>
            Idi na redak
          </button>
        )}
        <button
          className="btn small primary"
          disabled={chatBusy}
          onClick={() => void sendChat(`Render je pao${error.line ? ` u retku ${error.line}` : ''}:\n${error.message}\n\nPopravi grešku i provjeri render.`, false)}
        >
          <Sparkles /> Popravi s Claudeom
        </button>
        <button className="btn ghost small" onClick={() => void renderNow()}>
          Ponovi
        </button>
      </div>
    </div>
  )
}

/** Largest box with `ratio` that fits the element. */
function useFit(ref: React.RefObject<HTMLDivElement | null>, ratio: number) {
  const [box, setBox] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const pad = 28
      const w = el.clientWidth - pad * 2
      const h = el.clientHeight - pad * 2
      const fitW = Math.min(w, h * ratio)
      setBox({ w: Math.max(0, Math.floor(fitW)), h: Math.max(0, Math.floor(fitW / ratio)) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, ratio])
  return box
}
