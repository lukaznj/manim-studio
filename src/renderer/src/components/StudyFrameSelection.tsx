import { Check, ScanLine, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { FrameRegion } from '../../../shared/types'
import { t } from '../lib/i18n'
import { errorText, toast, useStore } from '../store'

/** A rectangle is drawn over the paused frame; coordinates exclude the controls and letterboxing. */
export function StudyFrameSelection({ video }: { video: RefObject<HTMLVideoElement | null> }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => { video.current?.pause(); root.current?.focus({ preventScroll: true }) }, [])
  const [bounds, setBounds] = useState<{ left: number; top: number; width: number; height: number }>()
  useLayoutEffect(() => {
    const el = video.current
    if (!el?.parentElement) return
    const update = () => {
      if (!el.videoWidth || !el.videoHeight) return
      const rect = el.getBoundingClientRect(), parent = el.parentElement!.getBoundingClientRect()
      const scale = Math.min(rect.width / el.videoWidth, rect.height / el.videoHeight)
      const width = el.videoWidth * scale, height = el.videoHeight * scale
      setBounds({ left: rect.left - parent.left + (rect.width - width) / 2, top: rect.top - parent.top + (rect.height - height) / 2, width, height })
    }
    const observer = new ResizeObserver(update)
    observer.observe(el); observer.observe(el.parentElement)
    el.addEventListener('loadedmetadata', update)
    update()
    return () => { observer.disconnect(); el.removeEventListener('loadedmetadata', update) }
  }, [video])
  const [region, setRegion] = useState<FrameRegion | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const point = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }
  }
  const attach = () => {
    const el = video.current
    if (!el || !region || region.width < .01 || region.height < .01) return
    try {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(el.videoWidth * region.width)); canvas.height = Math.max(1, Math.round(el.videoHeight * region.height))
      canvas.getContext('2d')!.drawImage(el, region.x * el.videoWidth, region.y * el.videoHeight, el.videoWidth * region.width, el.videoHeight * region.height, 0, 0, canvas.width, canvas.height)
      useStore.setState({ studyAttachment: { at: el.currentTime, region, preview: canvas.toDataURL('image/png') }, studyMoment: el.currentTime, studySelecting: false, studyTab: 'chat', chatDraft: '' })
    } catch (e) { toast(errorText(e), 'error') }
  }
  return <div ref={root} style={bounds} className="study-frame-selector" role="region" aria-label={t('Select part of the frame')} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); useStore.setState({ studySelecting: false }) } }}>
    <div className="study-frame-draw" onPointerDown={(e) => {
      if (e.button !== 0) return
      e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); start.current = point(e); setRegion(null); setDragging(true)
    }} onPointerMove={(e) => {
      if (!start.current) return
      const p = point(e), a = start.current
      setRegion({ x: Math.min(p.x, a.x), y: Math.min(p.y, a.y), width: Math.abs(p.x - a.x), height: Math.abs(p.y - a.y) })
    }} onPointerUp={() => { start.current = null; setDragging(false) }} onPointerCancel={() => { start.current = null; setDragging(false) }}>
      {region && <div className="study-frame-rect" style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }} />}
    </div>
    <div className="study-frame-selector-tools"><span><ScanLine />{t('Draw a box around the part you mean')}</span><button className="icon-btn" aria-label={t('Cancel selection')} onClick={() => useStore.setState({ studySelecting: false })}><X /></button><button className="btn small primary" disabled={dragging || !region || region.width < .01 || region.height < .01} onClick={attach}><Check />{t('Attach selection')}</button></div>
  </div>
}
