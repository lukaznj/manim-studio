import { RefreshCw } from 'lucide-react'
import type { VoiceSettings } from '../../../shared/types'
import { renderNow, useStore } from '../store'

/** What makes one voice sound unlike another. Not the language: that needs new narration text. */
const sound = (v: VoiceSettings) =>
  v.provider === 'elevenlabs'
    ? `elevenlabs:${v.elevenlabs?.voiceId ?? ''}:${v.elevenlabs?.modelId ?? 'eleven_v3'}`
    : v.provider === 'system'
      ? `system:${v.systemVoice ?? ''}`
      : `${v.provider}:${v.omnivoice?.refText ?? ''}`

/** "Luka" for "Luka - Calm, Narrative"; the provider when there's no name. */
export const voiceLabel = (v: VoiceSettings) =>
  v.provider === 'elevenlabs' ? (v.elevenlabs?.voiceName?.split(' - ')[0] ?? 'ElevenLabs') : v.provider === 'system' ? (v.systemVoice ?? 'the system voice') : 'OmniVoice'

/**
 * The narration on screen was spoken by another voice than the project's now: the render that made
 * the timeline used `timeline.voiceSettings`. Null when it's current, or all of it is recordings.
 */
export function useOutdatedVoice(): { from: VoiceSettings; to: VoiceSettings; characters: number } | null {
  const timeline = useStore((s) => s.timeline)
  const voice = useStore((s) => s.project?.meta.voice)
  const hasKey = useStore((s) => !!s.settings?.hasElevenLabsKey)
  const spoken = timeline?.voice.filter((b) => b.source !== 'recording') ?? []
  if (!timeline?.voiceSettings || !voice || !spoken.length || sound(timeline.voiceSettings) === sound(voice)) return null
  if (voice.provider === 'elevenlabs' && (!voice.elevenlabs?.voiceId || !hasKey)) return null // it would only make silence
  return { from: timeline.voiceSettings, to: voice, characters: spoken.reduce((n, b) => n + b.text.length, 0) }
}

/** Renders again, which speaks every block in the project's voice (recordings stay; unchanged audio is reused). */
export function RevoiceButton({ className = 'btn small' }: { className?: string }) {
  const outdated = useOutdatedVoice()
  const rendering = useStore((s) => s.render.status === 'rendering')
  if (!outdated) return null
  return (
    <button className={className} disabled={rendering} onClick={() => void renderNow()} title={`The narration is still in ${voiceLabel(outdated.from)}'s voice`}>
      {rendering ? <span className="spinner" /> : <RefreshCw />} {rendering ? 'Re-voicing…' : `Re-voice with ${voiceLabel(outdated.to)}`}
    </button>
  )
}
