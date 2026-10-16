import { Clapperboard, GraduationCap, Layers } from 'lucide-react'
import type { AppMode } from '../../../shared/types'
import { switchMode, useStore } from '../store'
import { Modal } from './ui'

const MODES: { value: AppMode; icon: React.ReactNode; title: string; text: string }[] = [
  {
    value: 'learn',
    icon: <GraduationCap />,
    title: 'Learn',
    text: 'Turn your course material and exercises into explained videos to study. Ask about any moment, mark what you’ve watched, get a slower video for what you didn’t follow.',
  },
  {
    value: 'create',
    icon: <Clapperboard />,
    title: 'Create',
    text: 'Make videos to publish: the full studio, with the code, the timeline, your own narration, and exports with thumbnails for YouTube.',
  },
  {
    value: 'both',
    icon: <Layers />,
    title: 'Both',
    text: 'Study and make videos: Home has a Create tab with your projects and the editor, and a Learn tab with your courses to study.',
  },
]

/** The first launch asks who the app is for (ADR 0029); Settings → General changes it later. Closing it keeps the full studio. */
export function ModeChoice() {
  const open = useStore((s) => !!s.settings && !s.settings.mode)
  return (
    <Modal open={open} onClose={() => void switchMode('create')} title="How will you use Manim Studio?" width={760}>
      <div className="modal-body">
        <div className="provider-cards mode-cards" role="radiogroup" aria-label="How you use Manim Studio">
          {MODES.map((m) => (
            <button key={m.value} role="radio" aria-checked={false} className="provider-card mode-card" onClick={() => void switchMode(m.value)}>
              {m.icon}
              <strong>{m.title}</strong>
              <span className="hint">{m.text}</span>
            </button>
          ))}
        </div>
        <p className="hint">You can change this any time in Settings → General.</p>
      </div>
    </Modal>
  )
}
