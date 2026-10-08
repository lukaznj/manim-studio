import {
  AudioLines,
  Cpu,
  Download,
  Laptop,
  Lock,
  Maximize2,
  Mic,
  Minus,
  Pause,
  Play,
  Plus,
  Repeat,
  SkipBack,
  SkipForward,
  VolumeX,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Clip, Timeline as TimelineData, VoiceBlock, VoiceSource } from '../../../shared/types'
import { api } from '../lib/api'
import { draggedDuration, durationEdit } from '../lib/edits'
import { editorBridge } from '../lib/editor-bridge'
import { drawPeaks, peaks } from '../lib/audio'
import { playback } from '../lib/playback'
import { timecode } from '../lib/time'
import { markEdited, openDialog, saveScene, selectClips, toast, useStore } from '../store'

const LABEL_W = 92
const MIN_PPS = 6
const MAX_PPS = 480

const LOCK_REASON: Record<string, string> = {
  voiceover: 'Ovaj dio traje dok traje naracija — mijenja se tekstom ili snimkom.',
  bookmark: 'Čeka bookmark u naraciji — pomakni bookmark u tekstu.',
  helper: 'Poziv je u pomoćnoj funkciji — trajanje promijeni u kodu ili pitaj Claudea.',
  ambiguous: 'U tom retku je više poziva — promijeni ga u kodu.',
  kwargs: 'Trajanje dolazi iz **kwargs — promijeni ga u kodu.',
  syntax: 'Kod ima sintaksnu grešku.',
  empty: 'Nema animacija u pozivu.',
}

function lockText(reason: string): string {
  if (reason.startsWith('computed:')) return `Trajanje je izraz (${reason.slice(9)}) — promijeni ga u kodu ili pitaj Claudea.`
  return LOCK_REASON[reason] ?? reason
}

export function Timeline() {
  const timeline = useStore((s) => s.timeline)
  const stale = useStore((s) => s.stale || s.dirty)
  const selection = useStore((s) => s.selection)
  const scroller = useRef<HTMLDivElement>(null)
  const playhead = useRef<HTMLDivElement>(null)
  const clipEls = useRef<(HTMLDivElement | null)[]>([])
  const [pps, setPps] = useState<number | null>(null)
  const [fit, setFit] = useState(true)
  const [zooming, setZooming] = useState(false)
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null)
  const [loop, setLoop] = useState(false)
  const ppsRef = useRef(40)

  const duration = timeline?.duration ?? 10

  // Fit-to-width until the user zooms.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || !fit) return
    const measure = () => {
      const next = Math.min(MAX_PPS, Math.max(MIN_PPS, (el.clientWidth - 28) / Math.max(duration, 1)))
      setPps(next)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit, duration])

  const scale = pps ?? 40
  ppsRef.current = scale

  // Playhead + active clip, driven by the playback clock (no React renders per frame).
  useEffect(() => {
    let active = -1
    return playback.subscribe((t) => {
      const x = t * ppsRef.current
      if (playhead.current) playhead.current.style.transform = `translateX(${x}px)`
      const clips = useStore.getState().timeline?.clips ?? []
      const idx = clips.findIndex((c) => t >= c.start && t < c.end)
      if (idx !== active) {
        clipEls.current[active]?.classList.remove('active')
        clipEls.current[idx]?.classList.add('active')
        active = idx
      }
      const el = scroller.current
      if (el && playback.playing && (x > el.scrollLeft + el.clientWidth - 48 || x < el.scrollLeft)) el.scrollLeft = Math.max(0, x - 80)
    })
  }, [])

  useEffect(() => {
    if (playhead.current) playhead.current.style.transform = `translateX(${playback.time * scale}px)`
  }, [scale])

  // Loop the selected range while the loop toggle is on.
  useEffect(() => {
    const clips = selection.map((i) => timeline?.clips[i]).filter(Boolean) as Clip[]
    playback.setLoop(loop && clips.length ? { start: Math.min(...clips.map((c) => c.start)), end: Math.max(...clips.map((c) => c.end)) } : null)
  }, [loop, selection, timeline])

  const zoomTo = useCallback(
    (next: number, anchorX?: number) => {
      const el = scroller.current
      const clamped = Math.min(MAX_PPS, Math.max(MIN_PPS, next))
      const ax = anchorX ?? (el ? el.clientWidth / 2 : 0)
      const t = el ? (el.scrollLeft + ax) / scale : 0
      setFit(false)
      setZooming(true)
      setPps(clamped)
      requestAnimationFrame(() => {
        if (el) el.scrollLeft = t * clamped - ax
        setTimeout(() => setZooming(false), 60)
      })
    },
    [scale],
  )

  const onWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return
    e.preventDefault()
    const rect = scroller.current!.getBoundingClientRect()
    zoomTo(scale * Math.exp(-e.deltaY * 0.004), e.clientX - rect.left)
  }

  const timeAt = (clientX: number) => {
    const el = scroller.current!
    return Math.max(0, Math.min(duration, (clientX - el.getBoundingClientRect().left + el.scrollLeft - 14) / scale))
  }

  const scrub = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const wasPlaying = playback.playing
    playback.pause()
    playback.seek(timeAt(e.clientX))
    const move = (ev: PointerEvent) => playback.seek(timeAt(ev.clientX))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (wasPlaying) playback.toggle()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const showTip = (e: React.MouseEvent, body: ReactNode) => setTip({ x: e.clientX, y: e.clientY, body })
  const hideTip = () => setTip(null)

  const width = duration * scale + 28

  return (
    <div className="timeline">
      <Toolbar timeline={timeline} scale={scale} loop={loop} setLoop={setLoop} zoomTo={zoomTo} onFit={() => setFit(true)} fit={fit} />
      <div className="tl-body">
        <div className="tl-labels" style={{ width: LABEL_W }}>
          <div className="tl-label ruler-label" />
          <div className="tl-label warn-label" />
          <div className="tl-label">Odjeljci</div>
          <div className="tl-label tall">Animacije</div>
          <div className="tl-label taller">Glas</div>
          <div className="tl-label">Titlovi</div>
        </div>
        <div className="tl-scroll" ref={scroller} onWheel={onWheel}>
          <div className={`tl-content ${zooming ? 'zooming' : ''} ${stale ? 'stale' : ''}`} style={{ width }} onPointerDown={scrub}>
            <Ruler duration={duration} scale={scale} />
            {timeline ? (
              <>
                <div className="lane lane-warn">
                  {timeline.warnings.map((w, i) => (
                    <div
                      key={i}
                      className={`warn-bar ${w.kind}`}
                      style={{ left: w.start * scale, width: Math.max(4, (w.end - w.start) * scale) }}
                      onMouseMove={(e) => showTip(e, <span>{w.message}{w.line ? ` · redak ${w.line}` : ''}</span>)}
                      onMouseLeave={hideTip}
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        playback.seek(w.start + 0.01)
                        if (w.line) editorBridge.revealLine(w.line)
                      }}
                    />
                  ))}
                </div>
                <div className="lane lane-sections">
                  {timeline.sections
                    .filter((s) => s.end > s.start)
                    .map((s, i) => (
                      <div
                        key={i}
                        className="section-block"
                        style={{ left: s.start * scale, width: (s.end - s.start) * scale }}
                        onPointerDown={(e) => {
                          e.stopPropagation()
                          playback.seek(s.start + 0.001)
                          selectClips(timeline.clips.map((c, j) => (c.start >= s.start - 1e-6 && c.end <= s.end + 1e-6 ? j : -1)).filter((j) => j >= 0))
                          if (s.line) editorBridge.revealLine(s.line)
                        }}
                      >
                        <span>{s.name || 'Bez naziva'}</span>
                      </div>
                    ))}
                </div>
                <div className="lane lane-clips">
                  {timeline.clips.map((c, i) => (
                    <ClipView
                      key={i}
                      clip={c}
                      index={i}
                      scale={scale}
                      selected={selection.includes(i)}
                      editable={!!c.edit && !stale}
                      refCb={(el) => (clipEls.current[i] = el)}
                      showTip={showTip}
                      hideTip={hideTip}
                    />
                  ))}
                </div>
                <div className="lane lane-voice">
                  {timeline.voice.map((v, i) => (
                    <VoiceView key={`${v.key}-${i}`} block={v} scale={scale} showTip={showTip} hideTip={hideTip} />
                  ))}
                </div>
                <div className="lane lane-subs">
                  {timeline.subtitles.map((s, i) => (
                    <div
                      key={i}
                      className="sub-chip"
                      style={{ left: s.start * scale, width: Math.max(2, (s.end - s.start) * scale) }}
                      onMouseMove={(e) => showTip(e, s.text)}
                      onMouseLeave={hideTip}
                    >
                      <span>{s.text}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="tl-empty">Vremenska crta nastaje iz rendera — spremi scenu (⌘S).</div>
            )}
            <div className="playhead" ref={playhead}>
              <div className="playhead-head" />
            </div>
          </div>
        </div>
      </div>
      {tip && (
        <div className="tl-tip" style={{ left: tip.x + 12, top: tip.y - 12 }}>
          {tip.body}
        </div>
      )}
    </div>
  )
}

function Toolbar(props: {
  timeline: TimelineData | null
  scale: number
  loop: boolean
  setLoop: (v: boolean) => void
  zoomTo: (pps: number) => void
  onFit: () => void
  fit: boolean
}) {
  const { timeline } = props
  const selection = useStore((s) => s.selection)
  const stale = useStore((s) => (s.stale || s.dirty) && !!s.timeline)
  const [playing, setPlaying] = useState(false)
  const time = useRef<HTMLSpanElement>(null)
  const fps = timeline?.fps ?? 15

  useEffect(() => playback.onPlayState(setPlaying), [])
  useEffect(
    () =>
      playback.subscribe((t) => {
        if (time.current) time.current.textContent = timecode(t)
      }),
    [],
  )

  const sel = useMemo(() => {
    const clips = selection.map((i) => timeline?.clips[i]).filter(Boolean) as Clip[]
    if (!clips.length) return null
    const lines = [...new Set(clips.map((c) => c.line).filter(Boolean))] as number[]
    const start = Math.min(...clips.map((c) => c.start))
    const end = Math.max(...clips.map((c) => c.end))
    return {
      count: clips.length,
      span: end - start,
      lines: lines.length ? (lines.length === 1 ? `r. ${lines[0]}` : `r. ${Math.min(...lines)}–${Math.max(...lines)}`) : '',
    }
  }, [selection, timeline])

  return (
    <div className="tl-toolbar">
      <div className="transport">
        <button className="icon-btn" onClick={() => playback.step(-1 / fps)} title="Kadar natrag (←)" disabled={!timeline}>
          <SkipBack />
        </button>
        <button className="play-btn" onClick={() => playback.toggle()} title="Reproduciraj (razmak)" disabled={!timeline}>
          {playing ? <Pause /> : <Play />}
        </button>
        <button className="icon-btn" onClick={() => playback.step(1 / fps)} title="Kadar naprijed (→)" disabled={!timeline}>
          <SkipForward />
        </button>
        <span className="timecode mono">
          <span ref={time}>00:00.00</span>
          <span className="faint"> / {timecode(timeline?.duration ?? 0)}</span>
        </span>
        {stale && (
          <span className="badge sun" title="Vremenska crta je od zadnjeg uspješnog rendera">
            od zadnjeg rendera
          </span>
        )}
      </div>

      <div className="tl-selection">
        {sel && (
          <>
            <span className="badge blue">{sel.count === 1 ? '1 klip' : `${sel.count} klipa`}</span>
            <span className="mono faint">
              {sel.span.toFixed(1)} s {sel.lines && `· ${sel.lines}`}
            </span>
            <button className={`icon-btn ${props.loop ? 'on' : ''}`} onClick={() => props.setLoop(!props.loop)} title="Ponavljaj odabrano">
              <Repeat />
            </button>
            <span className="hint">Pitaj Claudea o odabranome u razgovoru →</span>
          </>
        )}
      </div>

      <div className="tl-right">
        <div className="zoom">
          <button className="icon-btn" onClick={() => props.zoomTo(props.scale / 1.4)} title="Udalji (⌘ + kotačić)">
            <Minus />
          </button>
          <input
            type="range"
            min={Math.log(MIN_PPS)}
            max={Math.log(MAX_PPS)}
            step={0.01}
            value={Math.log(props.scale)}
            onChange={(e) => props.zoomTo(Math.exp(Number(e.target.value)))}
            aria-label="Zum vremenske crte"
          />
          <button className="icon-btn" onClick={() => props.zoomTo(props.scale * 1.4)} title="Približi">
            <Plus />
          </button>
          <button className={`icon-btn ${props.fit ? 'on' : ''}`} onClick={props.onFit} title="Cijeli video">
            <Maximize2 />
          </button>
        </div>
        <button className="btn small" onClick={() => openDialog({ kind: 'booth' })} disabled={!timeline?.voice.length} title="⌘⇧R">
          <Mic /> Snimanje glasa
        </button>
        <button className="btn small primary" onClick={() => openDialog({ kind: 'export' })} disabled={!timeline} title="⌘E">
          <Download /> Izvezi
        </button>
      </div>
    </div>
  )
}

function Ruler({ duration, scale }: { duration: number; scale: number }) {
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60]
  const step = steps.find((s) => s * scale >= 64) ?? 60
  const ticks: number[] = []
  for (let t = 0; t <= duration + 1e-6; t += step) ticks.push(Math.round(t * 1000) / 1000)
  return (
    <div className="ruler">
      {ticks.map((t) => (
        <div key={t} className="tick" style={{ left: t * scale }}>
          <span className="mono">{step < 1 ? t.toFixed(1) : timecode(t, false)}</span>
        </div>
      ))}
      {ticks.map((t) =>
        [1, 2, 3, 4].map((k) => {
          const m = t + (step / 5) * k
          return m < duration ? <div key={`${t}-${k}`} className="tick minor" style={{ left: m * scale }} /> : null
        }),
      )}
    </div>
  )
}

function clipLabel(c: Clip): string {
  if (c.kind === 'wait') return 'pauza'
  return c.anims.map((a) => (a.name === 'animate' ? '.animate' : a.name)).join(' · ')
}

function ClipView(props: {
  clip: Clip
  index: number
  scale: number
  selected: boolean
  editable: boolean
  refCb: (el: HTMLDivElement | null) => void
  showTip: (e: React.MouseEvent, body: ReactNode) => void
  hideTip: () => void
}) {
  const { clip: c, scale } = props
  const [dx, setDx] = useState<number | null>(null)
  const width = Math.max(2, (c.end - c.start) * scale + (dx ?? 0))
  const dragDuration = dx === null ? null : draggedDuration(c.start, c.end, dx, scale)

  const select = (e: React.PointerEvent) => {
    e.stopPropagation()
    const { selection } = useStore.getState()
    if (e.metaKey || e.ctrlKey) selectClips(selection.includes(props.index) ? selection.filter((i) => i !== props.index) : [...selection, props.index])
    else if (e.shiftKey && selection.length) {
      const a = Math.min(...selection, props.index)
      const b = Math.max(...selection, props.index)
      selectClips(Array.from({ length: b - a + 1 }, (_, k) => a + k))
    } else selectClips([props.index])
    playback.seek(c.start + 0.001)
    if (c.line) editorBridge.revealLine(c.line)
  }

  const startDrag = (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const x0 = e.clientX
    let last = 0
    const move = (ev: PointerEvent) => {
      last = ev.clientX - x0
      setDx(last)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDx(null)
      const next = draggedDuration(c.start, c.end, last, scale)
      if (!c.edit || Math.abs(next - (c.end - c.start)) < 0.05) return
      const source = editorBridge.applyEdit(durationEdit(c.edit, next))
      if (source === null) return
      markEdited(source)
      void saveScene({ render: true })
      toast(`Trajanje ${next.toFixed(1)} s · redak ${c.edit.line}${c.repeat && c.repeat > 1 ? ` (svih ${c.repeat} ponavljanja)` : ''}`, 'ok')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const tip = (
    <div className="clip-tip">
      <strong>{c.kind === 'wait' ? 'Pauza' : c.anims.map((a) => a.name).join(' + ')}</strong>
      {c.anims
        .filter((a) => a.target)
        .slice(0, 4)
        .map((a, i) => (
          <div key={i} className="faint">
            {a.target}
          </div>
        ))}
      <div className="mono">
        {(c.end - c.start).toFixed(2)} s · {c.start.toFixed(2)}–{c.end.toFixed(2)} {c.line ? `· redak ${c.line}` : ''}
      </div>
      {c.edit && c.repeat && c.repeat > 1 && <div className="tip-warn">U petlji: promjena vrijedi za svih {c.repeat} ponavljanja.</div>}
      {c.locked && (
        <div className="tip-lock">
          <Lock /> {lockText(c.locked)}
        </div>
      )}
      {c.edit && <div className="faint">Povuci desni rub za promjenu trajanja.</div>}
    </div>
  )

  return (
    <div
      ref={props.refCb}
      className={`clip ${c.kind} ${props.selected ? 'selected' : ''} ${dx !== null ? 'dragging' : ''} ${c.locked ? 'locked' : ''}`}
      style={{ left: c.start * scale, width }}
      onPointerDown={select}
      onMouseMove={(e) => dx === null && props.showTip(e, tip)}
      onMouseLeave={props.hideTip}
    >
      <span className="clip-label">{clipLabel(c)}</span>
      {dragDuration !== null && <span className="drag-badge mono">{dragDuration.toFixed(1)} s</span>}
      {props.editable && <div className="clip-edge" onPointerDown={startDrag} />}
    </div>
  )
}

const SOURCE: Record<VoiceSource, { label: string; icon: ReactNode; cls: string }> = {
  recording: { label: 'Snimka', icon: <Mic />, cls: 'rec' },
  system: { label: 'Sistemski glas', icon: <Laptop />, cls: 'tts' },
  elevenlabs: { label: 'ElevenLabs', icon: <AudioLines />, cls: 'tts' },
  omnivoice: { label: 'OmniVoice', icon: <Cpu />, cls: 'tts' },
  silence: { label: 'Tišina (TTS nije uspio)', icon: <VolumeX />, cls: 'silent' },
  unknown: { label: 'Nepoznato', icon: <AudioLines />, cls: 'tts' },
}

function VoiceView(props: { block: VoiceBlock; scale: number; showTip: (e: React.MouseEvent, body: ReactNode) => void; hideTip: () => void }) {
  const { block: v, scale } = props
  const canvas = useRef<HTMLCanvasElement>(null)
  const width = Math.max(2, (v.end - v.start) * scale)
  const src = SOURCE[v.source] ?? SOURCE.unknown

  useEffect(() => {
    let alive = true
    peaks(api.mediaUrl(v.audio))
      .then((p) => alive && canvas.current && drawPeaks(canvas.current, p, v.source === 'recording' ? '#4cc26a' : '#3aa1d8'))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [v.audio, v.source, width])

  return (
    <div
      className={`voice-block ${src.cls}`}
      style={{ left: v.start * scale, width }}
      onPointerDown={(e) => {
        e.stopPropagation()
        playback.seek(v.start + 0.001)
        if (v.line) editorBridge.revealLine(v.line)
      }}
      onDoubleClick={() => openDialog({ kind: 'booth', key: v.key })}
      onMouseMove={(e) =>
        props.showTip(
          e,
          <div className="clip-tip">
            <strong>
              {src.label} · {(v.end - v.start).toFixed(1)} s
            </strong>
            <div>“{v.text}”</div>
            <div className="faint">Dvoklik otvara snimanje za ovu rečenicu.</div>
          </div>,
        )
      }
      onMouseLeave={props.hideTip}
    >
      <canvas ref={canvas} />
      <span className="voice-icon">{src.icon}</span>
      {v.bookmarks.map((b) => (
        <span key={b.mark} className="bookmark" style={{ left: (b.t - v.start) * scale }} title={`bookmark „${b.mark}”`} />
      ))}
    </div>
  )
}
