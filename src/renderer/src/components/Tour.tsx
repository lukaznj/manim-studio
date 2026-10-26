import { t as uiText } from '../lib/i18n'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { endTour, studying, useStore, type TourId } from '../store'

/** `center`: shown in the middle with no spotlight when its target isn't on screen (Settings on a Mac is in the menu bar). */
type Step = { target: string; title: string; text: string; learn?: { title?: string; text: string }; center?: boolean }

/** What each tour shows, in order. `target` is a data-tour attribute; steps whose target isn't on screen are skipped. */
const TOURS: Record<TourId, Step[]> = {
  home: [
    {
      target: 'home-add',
      title: 'Start a video',
      text: 'A quick video from one sentence, a series from your material or a learning goal, a set of exercises, or an empty project to write yourself.',
      learn: {
        title: 'Add something to learn',
        text: 'A quick video on any topic, a course from your lecture PDFs or just from what you want to learn, or exercises with worked solutions and a video each.',
      },
    },
    {
      target: 'home-tabs',
      title: 'Learn and Create',
      text: 'Your library has two sides: Learn, to watch and ask about videos, and Create, to make and edit them. Switch here.',
    },
    {
      target: 'home-library',
      title: 'Your projects',
      text: 'Every project is a card. A series opens as a folder of episodes; rename it with the pencil next to its title.',
      learn: {
        title: 'Your library',
        text: 'Every course, exercise set and video lands here. A course opens as a folder of lessons; rename it with the pencil next to its title.',
      },
    },
    {
      target: 'settings',
      center: true,
      title: 'Settings',
      text: 'Your agent and its models, the narration voice, sounds and these tours: ⌘, on a Mac, or the gear up here on Windows and Linux.',
    },
  ],
  study: [
    {
      target: 'study-production',
      title: 'What’s being made',
      text: 'While a series is made, each episode’s progress shows here. Pause it, stop it, or carry on later, even after quitting the app.',
    },
    {
      target: 'study-library',
      title: 'Your course',
      text: 'The lessons in order, with what you’ve watched. Exercises holds the practice set. Add lessons or exercises at the bottom.',
    },
    {
      target: 'study-video',
      title: 'Watch',
      text: 'Play, pause, subtitles and speed are on the video. It remembers where you stopped, and can play the next lesson on its own.',
    },
    {
      target: 'study-clarity',
      title: 'Stuck on a moment?',
      text: 'Pause there and ask a question, or have a short follow-up video made that explains just that part more slowly. It appears under the lesson.',
    },
    {
      target: 'study-steps',
      title: 'Worked solutions',
      text: 'Each step plays its part of the video, and Ask sends that step to the chat. Explain something better redoes the video where it was unclear.',
    },
    {
      target: 'study-assistant',
      title: 'Transcript and chat',
      text: 'The transcript is every spoken sentence: click one to jump there, and search it with Ctrl+F (⌘F on a Mac). The chat answers questions about the lesson and knows where you paused.',
    },
  ],
  editor: [
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
  ],
}

const LAST: Record<TourId, string> = { home: 'Got it', study: 'Start studying', editor: 'Start making videos' }

const CARD_W = 320
const CARD_H = 190 // about; enough to keep the card on screen
const GAP = 14

/** A guided tour: a spotlight over each part of the screen, with a card that explains it (ADR 0047). */
export function Tour() {
  const active = useStore((s) => s.tour)
  const learning = useStore((s) => studying(s))
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const next = useRef<HTMLButtonElement>(null)
  const steps = useMemo(() => (active ? TOURS[active].filter((s) => s.center || document.querySelector(`[data-tour="${s.target}"]`)) : []), [active])
  const step = steps[i]
  const title = learning && step?.learn?.title ? step.learn.title : step?.title
  const text = learning && step?.learn ? step.learn.text : step?.text

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

  if (!active || !step || (!rect && !step.center)) return null
  const last = i === steps.length - 1
  const vw = window.innerWidth
  const vh = window.innerHeight
  const spot = rect
    ? { top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }
    : { top: vh / 2, left: vw / 2, width: 0, height: 0 }

  // The card goes beside the spotlight if there's room, else below it, above it, or inside its top.
  const clamp = (v: number, max: number) => Math.min(Math.max(16, v), max)
  let left: number
  let top: number
  if (!rect) [left, top] = [vw / 2 - CARD_W / 2, vh / 2 - CARD_H / 2]
  else if (spot.left + spot.width + GAP + CARD_W <= vw - 16) [left, top] = [spot.left + spot.width + GAP, clamp(spot.top, vh - CARD_H - 16)]
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
      <div className={`tour-spot ${rect ? '' : 'none'}`} style={spot} />
      <div className="tour-card" style={card}>
        <div className="eyebrow">
          {i + 1} {uiText(' of ')}
          {steps.length}
        </div>
        <h3 id="tour-title">{uiText(title!)}</h3>
        <p>{uiText(text!)}</p>
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
              {last ? uiText(LAST[active]) : uiText('Next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
