import { t as uiText } from '../lib/i18n'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { Section } from '../../../shared/types'
import { api } from '../lib/api'
import { useStore } from '../store'

const RATES = [0.75, 1, 1.25, 1.5, 2]

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
    // a viewer convenience only
  }
}

let playing: HTMLVideoElement | null = null // the study screen's video, for the transcript to move

/** Moves the study screen's video to `t` (a transcript line or search hit); `play` starts it there. */
export function seekStudy(t: number, play = false): void {
  if (!playing) return
  playing.currentTime = t + 0.01
  useStore.setState({ watchTime: t + 0.01 })
  if (play) void playing.play()
}

/**
 * A finished video to study (the exercises and Watch screens): chapters, speed, subtitles, and the
 * spot where it was left, per video, on this computer. Its position goes to the store, so a chat
 * question says where in the video it was asked.
 */
export function StudyPlayer(props: {
  src: string
  vtt?: string
  chapters: Section[]
  video: RefObject<HTMLVideoElement | null>
  resume?: boolean
  onWatched?: () => void // once, when playback passes 90%
}) {
  const { src, vtt, video } = props
  const [rate, setRate] = useState(1)
  const [now, setNow] = useState(0)
  const marked = useRef(false)
  const chapters = useMemo(() => props.chapters.filter((c) => c.end > c.start), [props.chapters])
  useEffect(() => {
    if (video.current) video.current.playbackRate = rate
  }, [rate, src])
  useEffect(() => () => useStore.setState({ watchTime: null }), [])
  useEffect(() => {
    const el = video.current // the element itself: by cleanup time the ref already points elsewhere
    playing = el
    return () => {
      if (playing === el) playing = null
    }
  }, [src])

  const seek = (t: number) => {
    if (!video.current) return
    video.current.currentTime = t + 0.01
    void video.current.play()
  }

  return (
    <section className="ex-player">
      <video
        ref={video}
        key={src}
        className="ex-video"
        src={api.mediaUrl(src)}
        controls
        preload="metadata"
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime
          setNow(t)
          useStore.setState({ watchTime: t })
          if (props.resume && Math.round(t) % 5 === 0) save(src, t)
          const d = e.currentTarget.duration
          if (!marked.current && d && t >= d * 0.9) {
            marked.current = true
            props.onWatched?.()
          }
        }}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget
          v.playbackRate = rate
          const at = props.resume ? saved(src) : 0
          if (at > 3 && at < v.duration - 5) v.currentTime = at // where it was left, unless near either end
          useStore.setState({ watchTime: v.currentTime })
        }}
      >
        {vtt && <track kind="subtitles" src={api.mediaUrl(vtt)} default label={uiText('Subtitles')} />}
      </video>
      <div className="ex-player-bar">
        <div className="ex-chapters" role="list" aria-label={uiText('Chapters')}>
          {chapters.map((c) => (
            <button
              key={`${c.name}-${c.start}`}
              role="listitem"
              className={`ex-chapter ${now >= c.start && now < c.end ? 'on' : ''}`}
              onClick={() => seek(c.start)}
            >
              {c.name || '—'}
            </button>
          ))}
        </div>
        <label className="ex-rate">
          <span className="faint">{uiText('Speed')}</span>
          <select className="select small" value={rate} onChange={(e) => setRate(Number(e.target.value))}>
            {RATES.map((r) => (
              <option key={r} value={r}>
                {r}×
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  )
}
