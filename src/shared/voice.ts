// Voice choices shared by the main process and the renderer (docs/04-decisions/0005-voice-providers.md).
import type { VoiceSettings } from './types'

/** ElevenLabs models on offer. The first is the default; python/studio/voice.py falls back to it too. */
export const EL_MODELS = [
  { id: 'eleven_v4', label: 'v4 (newest, recommended)' },
  { id: 'eleven_v3', label: 'v3 (expressive)' },
]
export const DEFAULT_EL_MODEL = EL_MODELS[0].id

/**
 * A voice saved before the system voice was removed (0.4.0) becomes ElevenLabs with no voice chosen
 * yet, so its renders are silent with a warning until one is picked, never billed by surprise. A
 * project on a model no longer offered (Multilingual v2, Flash v2.5) keeps it: switching would
 * re-voice and bill the whole narration on the next render.
 */
export function migrateVoice(voice: VoiceSettings): VoiceSettings {
  const { systemVoice: _dropped, ...rest } = voice as Omit<VoiceSettings, 'provider'> & { provider: string; systemVoice?: string }
  return { ...rest, provider: rest.provider === 'omnivoice' ? 'omnivoice' : 'elevenlabs' }
}
