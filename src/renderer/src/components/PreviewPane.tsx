import { t as uiText, format } from '../lib/i18n'
import { Captions, ChevronDown, CircleAlert, Code2, Pause, Sparkles, TriangleAlert, Video, Wrench } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { captionBand } from '../../../shared/caption'
import type { Aspect } from '../../../shared/types'
import { api } from '../lib/api'
import { editorBridge } from '../lib/editor-bridge'
import { playback } from '../lib/playback'
import { shortcut } from '../lib/platform'
import { openDialog, renderNow, renderProgress, saveScene, sendChat, useStore } from '../store'

export function PreviewPane() {
  const timeline = useStore((s) => s.timeline)
  const render = useStore((s) => s.render)
  const env = useStore((s) => s.setup?.env)
  const dirty = useStore((s) => s.dirty)
  const stale = useStore((s) => s.stale)
  const agent = useStore((s) => s.chatRoute?.agent ?? s.settings?.agent ?? 'claude')
  const agentName = agent === 'codex' ? 'Codex' : agent === 'antigravity' ? 'Antigravity' : 'Claude'
  const aspect = useStore((s) => s.project?.meta.aspect ?? '16:9')
  const captionBand = useStore((s) => !!s.project?.meta.captionBand)
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
      <div className="pane-head editor-preview-head"><span className="editor-pane-title"><Video />{uiText('Preview')}</span><span className="badge">{aspect}</span></div>
      <div className="stage" ref={stage}>
        <div className={`frame ${render.status === 'rendering' ? 'rendering' : ''}`} style={{ width: box.w, height: box.h }}>
          {src ? (
            <video ref={video} src={src} preload="auto" playsInline onClick={() => playback.toggle()} />
          ) : (
            <div className="frame-empty">
              {env !== 'ready' ? (
                <>
                  <Wrench />
                  <p>{uiText('The preview needs the manim environment installed.')}</p>
                  <button className="btn" onClick={() => openDialog({ kind: 'settings', tab: 'env' })}>
                    {uiText('Open environment settings')}
                  </button>
                </>
              ) : render.status === 'rendering' ? (
                <>
                  <span className="spinner big" />
                  <p>{uiText('First render… manim draws every frame now; later renders reuse its cache.')}</p>
                </>
              ) : (
                <>
                  <Code2 />
                  <p>
                    {uiText('Save the scene (')}
                    <span className="kbd">{shortcut('S')}</span>
                    {uiText(') to render the first preview.')}
                  </p>
                  <button className="btn" onClick={() => void saveScene({ render: true })}>
                    {uiText('Render')}
                  </button>
                </>
              )}
            </div>
          )}
          {captionBand && <CaptionBand aspect={aspect} />}
          {captions && timeline && <CaptionOverlay />}
          {render.status === 'rendering' && src && (
            <div className="frame-status" title={renderProgress(render).title}>
              {render.paused ? <Pause /> : <span className="spinner" />} {renderProgress(render).label} {renderProgress(render).detail}
            </div>
          )}
        </div>
        {render.status === 'error' && render.error && <ErrorCard />}
      </div>

      <div className="preview-foot">
        <div className="preview-flags">
          {(dirty || stale) && render.status !== 'rendering' && (
            <button className="flag sun" onClick={() => void saveScene({ render: true })} title={uiText('Save and render')}>
              {uiText("Preview is out of date · ")}
              <span className="kbd">{shortcut('S')}</span>
            </button>
          )}
          {warnings.length > 0 && (
            <div className="popover-anchor">
              <button className="flag coral" onClick={() => setWarningsOpen((o) => !o)}>
                <TriangleAlert /> {warnings.length === 1 ? uiText('1 warning') : format('{0} warnings', [warnings.length])} <ChevronDown />
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
                      {w.line && <span className="mono faint">L{w.line}</span>}
                    </button>
                  ))}
                  <button
                    className="btn small"
                    onClick={() => {
                      setWarningsOpen(false)
                      void sendChat(
                        'The render reports layout problems (text off screen or overlapping). Look at the frames, fix the layout, then check again.',
                        false,
                      )
                    }}
                  >
                    <Sparkles /> {uiText('Ask Claude to fix the layout').replace('Claude', agentName)}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="preview-tools">
          {timeline && (
            <span className="faint mono">
              {timeline.width}×{timeline.height} · {timeline.fps} {uiText(" fps · rendered in ")}
              {timeline.renderSeconds.toFixed(1)} s
            </span>
          )}
          <button className={`icon-btn ${captions ? 'on' : ''}`} onClick={() => setCaptions((c) => !c)} title={uiText('Show subtitles in the preview')}>
            <Captions />
          </button>
        </div>
      </div>
    </div>
  )
}

/** The band kept clear for viewers' subtitles (and, in portrait, phone apps' buttons): a faint outline. */
function CaptionBand({ aspect }: { aspect: Aspect }) {
  const band = captionBand(aspect)
  return (
    <>
      <div className="caption-band bottom" style={{ height: `${band.bottom * 100}%` }} title={uiText('Kept clear for subtitles')} />
      {band.right > 0 && (
        <div
          className="caption-band right"
          style={{ width: `${band.right * 100}%`, bottom: `${band.bottom * 100}%` }}
          title={uiText("Kept clear for the app's buttons")}
        />
      )}
    </>
  )
}

function CaptionOverlay() {
  const subtitles = useStore((s) => s.timeline?.subtitles ?? [])
  const [text, setText] = useState('')
  useEffect(() => playback.subscribe((t) => setText(subtitles.find((s) => t >= s.start && t <= s.end)?.text ?? '')), [subtitles])
  return <div className={`captions ${text ? 'on' : ''}`}>{text && <span>{text}</span>}</div>
}

function ErrorCard() {
  const error = useStore((s) => s.render.error)!
  const chatBusy = useStore((s) => s.chatBusy)
  const agent = useStore((s) => s.chatRoute?.agent ?? s.settings?.agent ?? 'claude')
  const [details, setDetails] = useState(false)
  return (
    <div className="error-card">
      <div className="error-title">
        <CircleAlert />
        <strong>{error.line ? format('Error on line {0}', [error.line]) : uiText('The render failed')}</strong>
      </div>
      <p className="mono error-msg">{error.message}</p>
      {details && <pre className="mono error-trace">{error.traceback || error.log}</pre>}
      <div className="error-actions">
        <button className="btn ghost small" onClick={() => setDetails((d) => !d)}>
          {details ? uiText('Hide details') : uiText('Show details')}
        </button>
        {error.line && (
          <button className="btn small" onClick={() => editorBridge.revealLine(error.line!, true)}>
            {uiText('Go to line')}
          </button>
        )}
        <button
          className="btn small primary"
          disabled={chatBusy}
          onClick={() =>
            void sendChat(`The render failed${error.line ? ` on line ${error.line}` : ''}:\n${error.message}\n\nFix it and check the render.`, false)
          }
        >
          <Sparkles /> {uiText('Fix with Claude').replace('Claude', agent === 'codex' ? 'Codex' : agent === 'antigravity' ? 'Antigravity' : 'Claude')}
        </button>
        <button className="btn ghost small" onClick={() => void renderNow()}>
          {uiText('Retry')}
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
