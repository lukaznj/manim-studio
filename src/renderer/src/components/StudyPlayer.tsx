import { t as uiText } from '../lib/i18n'
import { Captions, Check, FolderOpen, ListVideo, Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { Section } from '../../../shared/types'
import { api } from '../lib/api'
import { errorText, toast, useStore } from '../store'
import { Modal } from './ui'

const RATES = [0.75, 1, 1.25, 1.5, 2]
const clock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`
function saved(key: string): number {
  try {
    return Number(localStorage.getItem(`watch:${key}`)) || 0
  } catch {
    return 0
  }
}
function save(key: string, t: number): void {
  try {
    localStorage.setItem(`watch:${key}`, String(Math.round(t)))
  } catch {
    /* resume is optional */
  }
}
let playing: HTMLVideoElement | null = null

/** Transcript lines and search results share the active study player. */
export function seekStudy(t: number, play = false): void {
  if (!playing) return
  playing.currentTime = Math.max(0, Math.min(t + 0.01, Number.isFinite(playing.duration) ? playing.duration : t + 0.01))
  useStore.setState({ watchTime: playing.currentTime })
  if (play) void playing.play().catch(() => undefined)
}

export function StudyPlayer(props: {
  src: string
  vtt?: string
  chapters: Section[]
  video: RefObject<HTMLVideoElement | null>
  resume?: boolean
  onWatched?: () => void
}) {
  const { src, vtt, video } = props
  const aspect = useStore((s) => s.project?.meta.aspect ?? '16:9')
  const root = useRef<HTMLElement>(null)
  const [rate, setRate] = useState(1)
  const [now, setNow] = useState(0)
  const [duration, setDuration] = useState(0)
  const [paused, setPaused] = useState(true)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [captions, setCaptions] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [chaptersOpen, setChaptersOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const toolbar = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<number | undefined>(undefined)
  const marked = useRef(false)
  const chapters = useMemo(() => props.chapters.filter((c) => c.end > c.start), [props.chapters])
  const chapterIndex = Math.max(
    0,
    chapters.findLastIndex((c) => now >= c.start),
  )

  useEffect(() => {
    const el = video.current
    playing = el
    marked.current = false
    setNow(0)
    setDuration(0)
    setPaused(true)
    setFailed(false)
    setCaptions(true)
    return () => {
      if (props.resume && el) save(src, el.currentTime)
      if (playing === el) {
        playing = null
        useStore.setState({ watchTime: null })
      }
    }
  }, [src])
  useEffect(() => {
    let wasFullscreen = false
    const changed = () => {
      const active = document.fullscreenElement === root.current
      setFullscreen(active)
      // Leave button activation behind: Space and arrows should control playback immediately.
      if (active || wasFullscreen) root.current?.focus({ preventScroll: true })
      wasFullscreen = active
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.fullscreenElement !== root.current || root.current?.querySelector('dialog[open]')) return
      event.preventDefault()
      void document.exitFullscreen().catch(() => undefined)
    }
    document.addEventListener('fullscreenchange', changed)
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('fullscreenchange', changed)
      document.removeEventListener('keydown', escape, true)
    }
  }, [])
  useEffect(() => {
    if (video.current) video.current.playbackRate = rate
  }, [rate, src])
  useEffect(() => {
    const tracks = video.current?.textTracks
    if (tracks) for (const track of tracks) track.mode = captions ? 'showing' : 'hidden'
  }, [captions, vtt])
  useEffect(() => {
    revealControls()
    // Capture mouse input as well as React's pointer events so the fullscreen toolbar can wake.
    if (fullscreen) document.addEventListener('mousemove', revealControls, true)
    return () => {
      window.clearTimeout(hideTimer.current)
      document.removeEventListener('mousemove', revealControls, true)
    }
  }, [fullscreen, paused, chaptersOpen, failed])

  function revealControls(): void {
    setControlsVisible(true)
    window.clearTimeout(hideTimer.current)
    if (!fullscreen || paused || chaptersOpen || failed) return
    hideTimer.current = window.setTimeout(() => {
      const focusedControl = toolbar.current?.contains(document.activeElement)
      if (toolbar.current?.matches(':hover') || (focusedControl && document.activeElement?.matches(':focus-visible'))) return
      if (focusedControl) {
        root.current?.focus({ preventScroll: true })
        window.clearTimeout(hideTimer.current)
      }
      setControlsVisible(false)
    }, 2200)
  }

  const seek = (t: number, start = false) => {
    const el = video.current
    if (!el) return
    el.currentTime = Math.max(0, Math.min(t, duration || chapters.at(-1)?.end || t))
    setNow(el.currentTime)
    useStore.setState({ watchTime: el.currentTime })
    if (start) void el.play().catch((e) => toast(errorText(e), 'error'))
  }
  const toggle = () => {
    const el = video.current
    if (!el) return
    if (el.paused) void el.play().catch((e) => toast(errorText(e), 'error'))
    else el.pause()
  }
  const expand = () => {
    const request = document.fullscreenElement ? document.exitFullscreen() : root.current?.requestFullscreen()
    void request?.catch((e) => toast(errorText(e), 'error'))
  }
  const mute = () => {
    if (video.current) video.current.muted = !video.current.muted
  }
  const changeVolume = (value: number) => {
    if (!video.current) return
    video.current.volume = value
    video.current.muted = value === 0
  }

  return (
    <section
      ref={root}
      className={`ex-player study-player ${fullscreen && !controlsVisible ? 'controls-hidden' : ''}`}
      tabIndex={0}
      aria-label={uiText('Video player')}
      onPointerMove={revealControls}
      onPointerDown={revealControls}
      onFocusCapture={revealControls}
      onKeyDown={(e) => {
        revealControls()
        if ((e.target as HTMLElement).closest('button,input,select,textarea,summary') || e.altKey || e.ctrlKey || e.metaKey) return
        if ([' ', 'k', 'ArrowLeft', 'ArrowRight', 'm', 'f', 'c'].includes(e.key)) e.preventDefault()
        if (e.key === ' ' || e.key === 'k') toggle()
        else if (e.key === 'ArrowLeft') seek(now - 10)
        else if (e.key === 'ArrowRight') seek(now + 10)
        else if (e.key === 'm') mute()
        else if (e.key === 'f') expand()
        else if (e.key === 'c' && vtt) setCaptions((v) => !v)
      }}
    >
      <div className="study-video-stage">
        <video
          ref={video}
          key={src}
          className="ex-video"
          style={{ aspectRatio: aspect.replace(':', ' / ') }}
          src={api.mediaUrl(src)}
          preload="metadata"
          playsInline
          onClick={toggle}
          onDoubleClick={expand}
          onError={() => setFailed(true)}
          onPlay={() => setPaused(false)}
          onPause={(e) => {
            setPaused(true)
            if (props.resume) save(src, e.currentTarget.currentTime)
          }}
          onVolumeChange={(e) => {
            setVolume(e.currentTarget.volume)
            setMuted(e.currentTarget.muted)
          }}
          onTimeUpdate={(e) => {
            const el = e.currentTarget,
              t = el.currentTime
            setNow(t)
            useStore.setState({ watchTime: t })
            if (props.resume && Math.round(t) % 5 === 0) save(src, t)
            if (!marked.current && el.duration && t >= el.duration * 0.9) {
              marked.current = true
              props.onWatched?.()
            }
          }}
          onLoadedMetadata={(e) => {
            const el = e.currentTarget
            setDuration(Number.isFinite(el.duration) ? el.duration : 0)
            el.playbackRate = rate
            el.volume = volume
            el.muted = muted
            const at = props.resume ? saved(src) : 0
            if (at > 3 && at < el.duration - 5) el.currentTime = at
            setNow(el.currentTime)
            useStore.setState({ watchTime: el.currentTime })
          }}
        >
          {vtt && (
            <track
              kind="subtitles"
              src={api.mediaUrl(vtt)}
              default
              label={uiText('Subtitles')}
              onLoad={() => {
                const track = video.current?.textTracks[0]
                if (track) track.mode = captions ? 'showing' : 'hidden'
              }}
            />
          )}
        </video>
        {paused && now < 0.1 && !failed && (
          <button className="study-play-overlay" aria-label={uiText('Play video')} onClick={toggle}>
            <Play />
          </button>
        )}
        {failed && (
          <div className="study-video-error">
            {uiText('The video could not be loaded. Open its file to check it.')}
            <button className="btn small" onClick={() => void api.reveal(src)}>
              <FolderOpen />
              {uiText('Show video file')}
            </button>
          </div>
        )}
      </div>
      <div className="study-player-toolbar" ref={toolbar} onPointerEnter={revealControls} onPointerLeave={revealControls}>
        <div className="study-controls">
          <div className="study-seek">
            <div className="study-seek-track" aria-hidden="true">
              <span style={{ width: `${duration ? Math.min(100, (now / duration) * 100) : 0}%` }} />
              {chapters.slice(1).map((c) => (
                <i key={c.start} style={{ left: `${duration ? (c.start / duration) * 100 : 0}%` }} />
              ))}
            </div>
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.01}
              value={Math.min(now, duration || 1)}
              disabled={!duration}
              aria-label={uiText('Video position')}
              aria-valuetext={`${clock(now)} / ${clock(duration)}`}
              onChange={(e) => seek(Number(e.target.value))}
            />
          </div>
          <div className="study-control-row">
            <button
              className="icon-btn study-play"
              aria-label={paused ? uiText('Play video') : uiText('Pause video')}
              title={uiText('Play / pause (Space)')}
              onClick={toggle}
            >
              {paused ? <Play /> : <Pause />}
            </button>
            <button className="icon-btn study-skip" aria-label={uiText('Back 10 seconds')} title={uiText('Back 10 seconds')} onClick={() => seek(now - 10)}>
              <RotateCcw />
            </button>
            <button
              className="icon-btn study-skip"
              aria-label={uiText('Forward 10 seconds')}
              title={uiText('Forward 10 seconds')}
              onClick={() => seek(now + 10)}
            >
              <RotateCw />
            </button>
            <span className="study-time mono">
              {clock(now)} <span>/ {clock(duration)}</span>
            </span>
            <div className="study-control-spacer" />
            <div className="study-volume">
              <button className="icon-btn" onClick={mute} aria-label={muted ? uiText('Unmute') : uiText('Mute')} title={uiText('Mute (M)')}>
                {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                aria-label={uiText('Volume')}
                onChange={(e) => changeVolume(Number(e.target.value))}
              />
            </div>
            <button
              className={`icon-btn ${vtt && captions ? 'active' : ''}`}
              disabled={!vtt}
              onClick={() => setCaptions((v) => !v)}
              aria-label={uiText('Subtitles')}
              aria-pressed={!!vtt && captions}
              title={uiText('Subtitles (C)')}
            >
              <Captions />
            </button>
            {!!chapters.length && (
              <button className="icon-btn" onClick={() => setChaptersOpen(true)} aria-label={uiText('Browse chapters')} title={uiText('Chapters')}>
                <ListVideo />
              </button>
            )}
            <select className="study-rate" value={rate} aria-label={uiText('Playback speed')} onChange={(e) => setRate(Number(e.target.value))}>
              {RATES.map((r) => (
                <option key={r} value={r}>
                  {r}×
                </option>
              ))}
            </select>
            <button
              className="icon-btn"
              onClick={expand}
              aria-label={fullscreen ? uiText('Exit full screen') : uiText('Full screen')}
              title={uiText('Full screen (F)')}
            >
              {fullscreen ? <Minimize /> : <Maximize />}
            </button>
          </div>
        </div>
      </div>
      <Modal open={chaptersOpen} onClose={() => setChaptersOpen(false)} title={uiText('Chapters')} icon={<ListVideo className="head-icon" />} width={520}>
        <div className="modal-body study-chapter-list">
          {chapters.map((c, i) => (
            <button
              key={`${c.name}-${c.start}`}
              className={`study-chapter-item ${i === chapterIndex ? 'active' : ''}`}
              aria-current={i === chapterIndex ? 'true' : undefined}
              onClick={() => {
                seek(c.start, true)
                setChaptersOpen(false)
              }}
            >
              <span className="mono">{String(i + 1).padStart(2, '0')}</span>
              <span>{c.name}</span>
              <time className="mono">{clock(c.start)}</time>
              {i === chapterIndex && <Check />}
            </button>
          ))}
        </div>
      </Modal>
    </section>
  )
}
