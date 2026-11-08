// "What Studio knows about you" (ADR 0065): a short note the user reads and edits, and the
// study chat's way of proposing a line for it.

export const NOTE_LINES = 20
const LINE_CHARS = 200
const MARK = 'REMEMBER:'
const markLine = /^[ \t*_]*REMEMBER:[*_]*[ \t]*(.*)$/

/** Keeps the note short: at most 20 non-empty lines of at most 200 characters. */
export function trimNote(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim().slice(0, LINE_CHARS))
    .filter(Boolean)
    .slice(0, NOTE_LINES)
    .join('\n')
}

/** Splits a finished answer into what the student sees and the line it proposes to remember. */
export function splitRemember(answer: string): { text: string; remember?: string } {
  const lines = answer.trimEnd().split('\n')
  const match = lines.at(-1)?.match(markLine)
  if (!match) return { text: answer }
  const remember = match[1].replace(/[*_]+$/, '').trim().slice(0, LINE_CHARS)
  return { text: lines.slice(0, -1).join('\n').trimEnd(), ...(remember ? { remember } : {}) }
}

/**
 * What of a streaming answer can be shown yet: everything before a REMEMBER line, holding back
 * a last line that could still turn into one. The result only ever grows as text arrives.
 */
export function shownSoFar(streamed: string): string {
  const start = streamed.lastIndexOf('\n') + 1
  const last = streamed.slice(start).replace(/^[ \t*_]+/, '')
  return markLine.test(last) || MARK.startsWith(last.slice(0, MARK.length)) ? streamed.slice(0, start) : streamed
}
