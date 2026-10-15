// Exercise sets (ADR 0025): what the main process and the screen both read out of an exercise's
// files. solution.md is the written solution, its ## sections the steps; the intake answer lists the
// exercises found in what the user gave. Plain text, not JSON: LaTeX backslashes break JSON strings.
import type { ExerciseSolution } from './types'

export const PROBLEM_FILE = 'problem.md'
export const SOLUTION_FILE = 'solution.md'

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/** solution.md: front matter (topic, tags, answer), then the steps as ## sections. */
export function parseSolution(text: string): ExerciseSolution {
  const front = text.match(FRONT)?.[1] ?? ''
  const field = (name: string) => front.match(new RegExp(`^${name}:[ \\t]*(.*)$`, 'm'))?.[1]?.trim() || undefined
  const tags = (field('tags') ?? '')
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((t) => t.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
  const body = text.replace(FRONT, '').replace(/^# .*\r?\n/m, '')
  const parts = body.split(/^## /m)
  const steps = parts.slice(1).map((part) => {
    const [title, ...rest] = part.split('\n')
    return { title: title.trim(), body: rest.join('\n').trim() }
  })
  return { topic: field('topic'), tags, answer: field('answer'), intro: parts[0].trim(), steps }
}

/** Where an exercise came from: a file the user gave, and for a PDF its pages. */
export interface IntakeExercise {
  title: string
  statement: string
  file?: string
  pages?: string
}

/** How the agent answers the intake: one block per exercise. */
export const INTAKE_FORMAT = `Answer with one block per exercise, in the order they appear, and nothing else:

=== EXERCISE ===
title: a short title naming what is asked (e.g. "Area between two parabolas")
file: the file name it comes from, exactly as given (leave the line out for typed exercises)
pages: the PDF pages it is on, e.g. 3 or 3-4 (PDFs only)
---
The full statement in Markdown, word for word, every given value and sub-question included. Maths in LaTeX between $…$ (inline) or $$…$$ (display). Describe a figure in a sentence when the exercise needs it.`

/** The intake answer, read: blocks without a statement are dropped; files must be ones that were given. */
export function parseIntake(answer: string, files: string[]): IntakeExercise[] {
  return answer
    .split(/^=== EXERCISE ===\s*$/m)
    .slice(1)
    .map((block) => {
      const [head, ...rest] = block.split(/^---\s*$/m)
      const field = (name: string) => head.match(new RegExp(`^${name}:[ \\t]*(.*)$`, 'm'))?.[1]?.trim() || undefined
      const file = field('file')
      return {
        title: field('title') ?? '',
        statement: rest.join('---').trim(),
        file: file && files.includes(file) ? file : undefined,
        pages: field('pages'),
      }
    })
    .filter((e) => e.statement)
    .map((e, i) => ({ ...e, title: e.title || `Exercise ${i + 1}` }))
}

/** The set's title the intake proposes: a "set: …" line before the first exercise. */
export function intakeSetTitle(answer: string): string | undefined {
  return answer.split(/^=== EXERCISE ===\s*$/m)[0].match(/^set:[ \t]*(.+)$/m)?.[1]?.trim() || undefined
}

/** Typed exercises split without an agent: blank-line separated, or numbered "1." / "2)" items. */
export function splitTyped(text: string): string[] {
  const t = text.trim()
  if (!t) return []
  const numbered = t.split(/^\s*\d+[.)]\s+/m).map((s) => s.trim()).filter(Boolean)
  if (numbered.length > 1) return numbered
  return t.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)
}

// --- search -----------------------------------------------------------------------------------

/** Lower case, without accents: "Đurđa" finds "durda", "Größe" finds "grosse". */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export interface Searchable {
  title: string
  topic?: string
  tags: string[]
  problem: string
  solution: string
}

/** 0 when a word of the query is missing; otherwise higher for matches in the title, topic and tags. */
export function searchScore(query: string, doc: Searchable): number {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return 0
  const fields: [string, number][] = [
    [fold(doc.title), 8],
    [fold([doc.topic ?? '', ...doc.tags].join(' ')), 5],
    [fold(doc.problem), 3],
    [fold(doc.solution), 1],
  ]
  let score = 0
  for (const w of words) {
    const hit = fields.reduce((sum, [text, weight]) => sum + (text.includes(w) ? weight : 0), 0)
    if (!hit) return 0
    score += hit
  }
  return score
}

/** About `size` characters of `text` around the first word of the query it has. */
export function snippet(query: string, text: string, size = 140): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const folded = fold(flat)
  const at = Math.min(...fold(query).split(/\s+/).filter(Boolean).map((w) => folded.indexOf(w)).filter((i) => i >= 0), Infinity)
  if (!Number.isFinite(at) || flat.length <= size) return flat.slice(0, size)
  const start = Math.max(0, at - Math.floor(size / 3))
  return `${start ? '…' : ''}${flat.slice(start, start + size).trim()}${start + size < flat.length ? '…' : ''}`
}

// --- the lecture: subtitles of several videos, one after another -------------------------------

const CUE = /(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/g

const stamp = (s: number, sep: string) => {
  const ms = Math.round(s * 1000)
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const sec = Math.floor((ms % 60_000) / 1000)
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(h)}:${pad(m)}:${pad(sec)}${sep}${pad(ms % 1000, 3)}`
}

/** WebVTT files joined, each one's cues moved by its video's start. */
export function joinVtt(parts: { text: string; offset: number }[]): string {
  const cues = parts.flatMap(({ text, offset }) =>
    text
      .replace(/^WEBVTT[^\n]*\n+/, '')
      .split(/\n\s*\n/)
      .map((cue) => cue.trim())
      .filter((cue) => cue.includes('-->'))
      .map((cue) => cue.replace(CUE, (_, h, m, s, ms) => stamp(+h * 3600 + +m * 60 + +s + +ms / 1000 + offset, '.'))),
  )
  return `WEBVTT\n\n${cues.join('\n\n')}\n`
}

/** The same cues as SubRip, numbered from 1. */
export function vttToSrt(vtt: string): string {
  return vtt
    .replace(/^WEBVTT[^\n]*\n+/, '')
    .split(/\n\s*\n/)
    .map((cue) => cue.trim())
    .filter((cue) => cue.includes('-->'))
    .map((cue) => cue.slice(cue.lastIndexOf('\n', cue.indexOf('-->')) + 1)) // without the cue's identifier
    .map((cue, i) => `${i + 1}\n${cue.replace(CUE, (_, h, m, s, ms) => `${h}:${m}:${s},${ms}`)}`)
    .join('\n\n')
    .concat('\n')
}
