// The playhead lives outside React: the <video> element is the clock, and subscribers
// (playhead, timecode, code-follow) are called from one rAF loop while it plays.
type Listener = (t: number) => void

let video: HTMLVideoElement | null = null
let time = 0
let raf = 0
let loop: { start: number; end: number } | null = null
const listeners = new Set<Listener>()
const playListeners = new Set<(playing: boolean) => void>()

function emit() {
  for (const l of listeners) l(time)
}

function tick() {
  if (!video) return
  time = video.currentTime
  if (loop && time >= loop.end) {
    video.currentTime = loop.start
    time = loop.start
  }
  emit()
  if (!video.paused) raf = requestAnimationFrame(tick)
}

export const playback = {
  attach(el: HTMLVideoElement | null) {
    video = el
    if (!el) return
    el.onplay = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(tick)
      playListeners.forEach((l) => l(true))
    }
    el.onpause = () => {
      cancelAnimationFrame(raf)
      tick()
      playListeners.forEach((l) => l(false))
    }
    el.onseeked = () => tick()
  },
  get time() {
    return time
  },
  get playing() {
    return !!video && !video.paused
  },
  get duration() {
    return video?.duration || 0
  },
  seek(t: number) {
    time = Math.max(0, t)
    if (video) video.currentTime = Math.min(time, (video.duration || time) - 0.001)
    emit()
  },
  step(dt: number) {
    playback.seek(time + dt)
  },
  toggle() {
    if (!video) return
    if (video.paused) {
      if (video.ended || time >= (video.duration || 0) - 0.05) video.currentTime = loop?.start ?? 0
      void video.play()
    } else video.pause()
  },
  pause() {
    video?.pause()
  },
  setLoop(range: { start: number; end: number } | null) {
    loop = range
  },
  /** Keep the playhead where it was when a new render swaps the video file. */
  restore(t: number) {
    time = t
    if (video) video.currentTime = t
    emit()
  },
  subscribe(l: Listener): () => void {
    listeners.add(l)
    l(time)
    return () => listeners.delete(l)
  },
  onPlayState(l: (playing: boolean) => void): () => void {
    playListeners.add(l)
    return () => playListeners.delete(l)
  },
}
