import type { NarrationStatus, Timeline, VoiceIssue, VoiceProvider } from './types'

/** Read older silent renders as well as the structured provider errors in new timelines. */
export function narrationStatus(timeline: Timeline | null, previous: VoiceIssue[] = [], requested?: VoiceProvider): NarrationStatus | undefined {
  if (!timeline?.voice.length || (timeline.voiceSettings?.provider as string | undefined) === 'none') return undefined
  const silentBlocks = timeline.voice.filter((block) => block.source === 'silence').length
  const fallback = requested && timeline.voiceSettings?.provider !== requested ? timeline.voiceSettings?.provider : undefined
  if (!silentBlocks && !fallback) return undefined
  const issues = [...(timeline.voiceIssues ?? []), ...(timeline.voiceSettings?.provider === requested || !requested ? previous : [])]
  for (const message of timeline.voiceWarnings ?? []) {
    if (/elevenlabs/i.test(message) && /quota[_ ]exceeded|insufficient[_ ]credits|credits?.*(?:exhausted|remaining)|quota.*(?:characters?|credits?)|not enough credits/i.test(message))
      issues.push({ provider: 'elevenlabs', kind: 'credits', message })
  }
  return { silentBlocks, totalBlocks: timeline.voice.length, fallback, issues: issues.filter((issue, i) => issues.findIndex((other) => other.provider === issue.provider && other.kind === issue.kind) === i) }
}
