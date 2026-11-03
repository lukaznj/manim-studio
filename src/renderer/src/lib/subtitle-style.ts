import { useLayoutEffect, useMemo, type RefObject } from 'react'
import { subtitleStyle, subtitleVariables } from '../../../shared/subtitle-style'
import { useStore } from '../store'

export function positionSubtitles(video: HTMLVideoElement | null) {
  if (!video) return
  const style = subtitleStyle(useStore.getState().settings?.subtitleStyle)
  for (const track of video.textTracks) for (const item of track.cues ?? []) {
    if (!(item instanceof VTTCue)) continue
    item.snapToLines = false
    item.line = style.position === 'top' ? 6 : 92
    item.lineAlign = style.position === 'top' ? 'start' : 'end'
    item.position = 50
    item.align = 'center'
    item.size = 90
  }
}

/** Native cues remain native: resize and position them with the picture, including fullscreen. */
export function useSubtitleStyle(video: RefObject<HTMLVideoElement | null>, source: string) {
  const saved = useStore((s) => s.settings?.subtitleStyle)
  const style = useMemo(() => subtitleStyle(saved), [saved])
  useLayoutEffect(() => {
    const element = video.current
    if (!element) return
    // On the stage too: subtitles with maths are drawn over the picture, not as native cues (ADR 0063).
    const targets = [element, element.parentElement].filter((x): x is HTMLElement => !!x)
    for (const [key, value] of Object.entries(subtitleVariables(style))) for (const target of targets) target.style.setProperty(key, value)
    const resize = () => {
      const box = element.getBoundingClientRect()
      const scale = element.videoWidth && element.videoHeight ? Math.min(box.width / element.videoWidth, box.height / element.videoHeight) : 1
      const short = element.videoWidth && element.videoHeight ? Math.min(element.videoWidth, element.videoHeight) * scale : Math.min(box.width, box.height)
      for (const target of targets) target.style.setProperty('--subtitle-font-size', `${Math.max(12, Math.min(56, short * .05)) * style.size / 100}px`)
      positionSubtitles(element)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    element.addEventListener('loadedmetadata', resize)
    resize()
    return () => { observer.disconnect(); element.removeEventListener('loadedmetadata', resize) }
  }, [video, source, style])
}
