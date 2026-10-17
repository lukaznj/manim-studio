import { t as uiText } from '../lib/i18n'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { endTour, useStore } from '../store'

/** What the tour shows, in order. `target` is a data-tour attribute in the editor. */
const STEPS = [
  { target: 'code', title: 'This is the video', text: 'scene.py is manim code: Claude writes it, or you do. Every save renders a new preview.' },
  {
    target: 'chat',
    title: 'Ask Claude',
    text: 'Describe what the video should show. Claude edits the scene, renders it, and looks at the frames before it answers.',
  },
  { target: 'preview', title: 'Watch it', text: 'The latest render plays here. Space plays and pauses, R renders again.' },
  {
    target: 'timeline',
    title: 'The timeline comes from the code',
    text: 'Every clip is a line of scene.py: click one to jump to it, drag its edge to retime it. Select clips, and Claude knows which part you mean.',
  },
  { target: 'media', title: 'Your pictures and videos', text: 'Add them under Media, then insert them into the scene or ask Claude to use them.' },
  { target: 'voice', title: 'Narration', text: 'Choose a voice in Settings → Voice, or record your own here. The animations stretch to fit the speech.' },
  { target: 'export', title: 'Export', text: 'A 1080p video with subtitles, light and dark versions, and other languages as audio tracks for YouTube.' },
]

const CARD_W = 320
const CARD_H = 190 // about; enough to keep the card on screen
const GAP = 14

/** First-run tutorial: a spotlight over each part of the editor, with a card that explains it. */
export function Tour() {
  const active = useStore((s) => s.tour)
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const next = useRef<HTMLButtonElement>(null)
  const steps = useMemo(() => (active ? STEPS.filter((s) => document.querySelector(`[data-tour="${s.target}"]`)) : []), [active])
  const step = steps[i]

  useEffect(() => {
    if (active) setI(0)
  }, [active])

  useLayoutEffect(() => {
    if (!step) return
    const measure = () => setRect(document.querySelector(`[data-tour="${step.target}"]`)?.getBoundingClientRect() ?? null)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [step])

  useEffect(() => {
    if (!active) return
    next.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') endTour()
      else if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, steps.length - 1))
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0))
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active, steps.length])

  if (!active || !step || !rect) return null
  const last = i === steps.length - 1
  const spot = { top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }

  // The card goes beside the spotlight if there's room, else below it, above it, or inside its top.
  const vw = window.innerWidth
  const vh = window.innerHeight
  const clamp = (v: number, max: number) => Math.min(Math.max(16, v), max)
  let left: number
  let top: number
  if (spot.left + spot.width + GAP + CARD_W <= vw - 16) [left, top] = [spot.left + spot.width + GAP, clamp(spot.top, vh - CARD_H - 16)]
  else if (spot.left - GAP - CARD_W >= 16) [left, top] = [spot.left - GAP - CARD_W, clamp(spot.top, vh - CARD_H - 16)]
  else {
    left = clamp(spot.left + spot.width / 2 - CARD_W / 2, vw - CARD_W - 16)
    const below = spot.top + spot.height + GAP
    const above = spot.top - GAP - CARD_H
    top = below + CARD_H <= vh - 16 ? below : above >= 16 ? above : spot.top + 24
  }
  const card: CSSProperties = { width: CARD_W, left, top }

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="tour-spot" style={spot} />
      <div className="tour-card" style={card}>
        <div className="eyebrow">
          {i + 1} {uiText(" of ")}
          {steps.length}
        </div>
        <h3 id="tour-title">{step.title}</h3>
        <p>{step.text}</p>
        <div className="tour-actions">
          <button className="link-btn" onClick={endTour}>
            {uiText('Skip tutorial')}
          </button>
          <div>
            {i > 0 && (
              <button className="btn small ghost" onClick={() => setI(i - 1)}>
                {uiText('Back')}
              </button>
            )}
            <button ref={next} className="btn small primary" onClick={() => (last ? endTour() : setI(i + 1))}>
              {last ? uiText('Start making videos') : uiText('Next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
