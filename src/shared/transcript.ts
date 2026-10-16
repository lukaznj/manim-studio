// Searching what a video says (the study screen's transcript, ADR 0032). Matching ignores case,
// accents and spacing, in any language (č finds c, "R  dva" finds "R dva"), and the hits keep
// their place in the original text so they can be marked there.
import { fold } from './exercise.ts'

/** One match: the subtitle line it's in and where in that line's text (from inclusive, to exclusive). */
export interface TranscriptHit {
  line: number
  from: number
  to: number
}

/** The text folded for matching, with each folded character's index in the original. */
function folded(text: string): { text: string; at: number[] } {
  let out = ''
  const at: number[] = []
  for (let i = 0; i < text.length; i++) {
    const f = /\s/.test(text[i]) ? ' ' : fold(text[i])
    if (f === ' ' && out.endsWith(' ')) continue // a run of spaces or line breaks is one space
    for (const c of f) {
      out += c
      at.push(i)
    }
  }
  return { text: out, at }
}

export const searchable = (query: string): string => fold(query).replace(/\s+/g, ' ').trim()

/** Every match of the query in the lines, in order. An empty query matches nothing. */
export function transcriptHits(lines: { text: string }[], query: string): TranscriptHit[] {
  const q = searchable(query)
  if (!q) return []
  const hits: TranscriptHit[] = []
  lines.forEach((l, line) => {
    const f = folded(l.text)
    for (let i = f.text.indexOf(q); i !== -1; i = f.text.indexOf(q, i + q.length)) {
      hits.push({ line, from: f.at[i], to: f.at[i + q.length - 1] + 1 })
    }
  })
  return hits
}

/** The line being said at `time`, or the last one started before it (between lines); -1 before the first. */
export function lineAt(lines: { start: number; end: number }[], time: number): number {
  let found = -1
  for (let i = 0; i < lines.length && lines[i].start <= time; i++) found = i
  return found
}
