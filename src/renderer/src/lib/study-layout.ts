import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { Settings } from '../../../shared/types'
import { updateSettings } from '../store'

/** Keep the preferred width across smaller windows without squeezing the video. */
export function useStudyLayout(settings: Settings | null, fullscreen = false, libraryNeeded = true) {
  const ref = useRef<HTMLDivElement>(null)
  const [bounds, setBounds] = useState({ min: 350, max: 640 })
  const [draft, setDraft] = useState<number | null>(null)
  const drag = useRef<{ x: number; width: number; value: number } | null>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const measure = () => {
      const css = getComputedStyle(root)
      const min = parseFloat(css.getPropertyValue('--study-assistant-min'))
      const library = fullscreen || !libraryNeeded ? 0 : settings?.studyLibraryCollapsed ? 40 : parseFloat(css.getPropertyValue('--study-library-width'))
      setBounds({ min, max: Math.max(min, Math.min(640, root.clientWidth - library - 362)) })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    measure()
    return () => observer.disconnect()
  }, [settings?.studyLibraryCollapsed, fullscreen, libraryNeeded])
  useEffect(() => () => document.body.classList.remove('resizing-x'), [])
  const clamp = (value: number) => Math.round(Math.max(bounds.min, Math.min(bounds.max, value)))
  const width = clamp(draft ?? settings?.studyAssistantWidth ?? bounds.min)
  const finish = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    const value = clamp(drag.current.value)
    drag.current = null
    document.body.classList.remove('resizing-x')
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    void updateSettings({ studyAssistantWidth: value }).finally(() => setDraft(null))
  }
  return {
    ref, width, ...bounds,
    splitter: {
      onPointerDown(e: PointerEvent<HTMLDivElement>) {
        if (e.button !== 0) return
        e.preventDefault()
        e.currentTarget.focus()
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { x: e.clientX, width, value: width }
        document.body.classList.add('resizing-x')
      },
      onPointerMove(e: PointerEvent<HTMLDivElement>) {
        if (!drag.current) return
        const value = clamp(drag.current.width + drag.current.x - e.clientX)
        drag.current.value = value
        setDraft(value)
      },
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture: finish,
      onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
        const next = e.key === 'Home' ? bounds.min : e.key === 'End' ? bounds.max : e.key === 'ArrowLeft' ? width + (e.shiftKey ? 50 : 10) : e.key === 'ArrowRight' ? width - (e.shiftKey ? 50 : 10) : null
        if (next === null) return
        e.preventDefault()
        void updateSettings({ studyAssistantWidth: clamp(next) })
      },
    },
  }
}
