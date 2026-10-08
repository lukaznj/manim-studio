// Turning a timeline drag into a source edit. Pure, so it is tested without Monaco.
import type { EditSpan } from '../../../shared/types'

export interface TextEdit {
  startLine: number // 1-based
  startCol: number // 1-based (Monaco)
  endLine: number
  endCol: number
  text: string
}

export function formatSeconds(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded)
}

/** The edit that sets a clip's duration literal to `seconds`. */
export function durationEdit(span: EditSpan, seconds: number): TextEdit {
  return {
    startLine: span.line,
    startCol: span.col + 1,
    endLine: span.endLine,
    endCol: span.endCol + 1,
    text: (span.value === null ? span.prefix : '') + formatSeconds(seconds),
  }
}

/** Applies a TextEdit to a source string (what Monaco does, for tests and fallbacks). */
export function applyEdit(source: string, edit: TextEdit): string {
  const lines = source.split('\n')
  const offset = (line: number, col: number) => lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0) + col - 1
  const a = offset(edit.startLine, edit.startCol)
  const b = offset(edit.endLine, edit.endCol)
  return source.slice(0, a) + edit.text + source.slice(b)
}

/** New duration for a clip whose right edge was dragged by `dx` pixels. */
export function draggedDuration(start: number, end: number, dx: number, pxPerSecond: number): number {
  return Math.max(0.1, Math.round(((end - start) + dx / pxPerSecond) * 10) / 10)
}
