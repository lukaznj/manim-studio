// How a video talks (ADR 0005 covers who speaks; this is what is said). One scale, three stops: the
// project picks a default, and anything asked in the chat overrides it for that request.
import type { ProjectMeta, Tone } from './types'

export const TONES: { value: Tone; label: string; hint: string; brief: string }[] = [
  {
    value: 'professional',
    label: 'Professional',
    hint: 'Precise and neutral, like a good lecture. No jokes.',
    brief: 'Tone: strictly professional and educational, like a good lecture. Precise, neutral wording; no jokes, asides or chatty filler.',
  },
  {
    value: 'warm',
    label: 'Warm',
    hint: 'A clear, friendly teacher. An everyday analogy when it helps.',
    brief: 'Tone: clear and warm, like a good teacher talking to one student. Plain, encouraging words; an everyday analogy only where it genuinely helps understanding; no jokes.',
  },
  {
    value: 'playful',
    label: 'Playful',
    hint: 'Light humour and real-life analogies where they fit. The maths stays exact.',
    brief:
      'Tone: friendly and lively. Light humour and real-life analogies where they fit naturally and help the idea land, at most one or two per section, never at the cost of precision: definitions, formulas and results stay exact.',
  },
]
export const DEFAULT_TONE: Tone = 'warm'

/** Tone and pacing for Claude: the in-app chat's system prompt and Claude Desktop's guide. */
export function styleBrief(meta: ProjectMeta): string {
  const tone = TONES.find((t) => t.value === (meta.tone ?? DEFAULT_TONE)) ?? TONES[1]
  return [
    `${tone.brief} The user chose this tone for the project; follow it unless they ask for something else in the chat.`,
    'Pace the video so every idea is explained clearly. There is no target length: take the time the material needs, and no more. (This replaces any target length in an older CLAUDE.md.)',
  ].join('\n')
}
