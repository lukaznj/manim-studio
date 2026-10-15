// Where a viewer is in a video, in words: for the chat's note when they ask while watching, and
// for a follow-up video's brief (src/main/watch.ts, ADR 0028).
import type { Timeline } from './types'

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** "at 3:12, in the section "Kirchhoff", where the narration says: "…"" (the block there and the one before). */
export function momentNote(t: Pick<Timeline, 'sections' | 'voice'> | null, at: number): string {
  if (!t) return `at ${clock(at)}`
  const section = t.sections.find((s) => at >= s.start && at < s.end)?.name
  const i = t.voice.findIndex((v) => at < v.end)
  const said = (i < 0 ? t.voice.slice(-2) : t.voice.slice(Math.max(0, i - 1), i + 1)).map((v) => v.text).join(' ')
  return `at ${clock(at)}${section ? `, in the section "${section}"` : ''}${said ? `, where the narration says: "${said}"` : ''}`
}
