import type { StudyReference } from './types'

export interface StudyEvidence {
  id: string
  text: string
  reference?: StudyReference
}
export interface StudyReadRequest { queries: string[]; reads: string[]; images: string[] }

/**
 * What one answer reads from the course besides the open lesson's own script: about 5,000 tokens.
 * Before 0.22 it was 105,000 characters, sent three times per question (ADR 0067).
 */
export const STUDY_EVIDENCE_CHARS = 16_000
export const STUDY_PAGE_IMAGES = 2

/** Adds evidence in the order given while it fits the budget; an item that doesn't fit is skipped whole. */
export function takeEvidence(selected: Map<string, StudyEvidence>, items: StudyEvidence[], budget = STUDY_EVIDENCE_CHARS): StudyEvidence[] {
  let used = [...selected.values()].reduce((n, item) => n + item.text.length, 0)
  const added: StudyEvidence[] = []
  for (const item of items) {
    if (selected.has(item.id) || used + item.text.length > budget) continue
    selected.set(item.id, item)
    used += item.text.length
    added.push(item)
  }
  return added
}

export interface StudyOutline {
  course: string
  current?: string // the open lesson's id: only its chapters are listed
  lessons: { id: string; number: number; title: string; summary: string; playable: boolean; chapters: { id: string; title: string }[] }[]
  documents: { id: string; name: string; pages: number; imageOnly: number[] }[]
  courseNotes: number // chunks of the course's own notes, read as course.1 …
  incomplete: boolean
}

/** The course on a page: what exists and how to name it, for the reference picker and the tutor. */
export function studyOutline(o: StudyOutline): string {
  const short = (text: string) => { const line = text.replace(/\s+/g, ' ').trim(); return line.length > 160 ? `${line.slice(0, 159)}…` : line }
  const lines = [`Course: ${o.course}`]
  for (const lesson of o.lessons) {
    lines.push(`${lesson.id}: lesson ${lesson.number} "${lesson.title}" [${lesson.playable ? 'video' : 'not made yet: never say it can be watched'}]${lesson.summary ? ` ${short(lesson.summary)}` : ''}`)
    if (lesson.id === o.current && lesson.chapters.length) lines.push(`  chapters of the open lesson: ${lesson.chapters.map((c) => `${c.id} "${c.title}"`).join('; ')}`)
  }
  for (const doc of o.documents) lines.push(`${doc.id}: document "${doc.name}", ${doc.pages} pages (page 30 is ${doc.id}.30)${doc.imageOnly.length ? `; pages without text, read as images: ${doc.imageOnly.slice(0, 40).join(', ')}` : ''}`)
  if (o.courseNotes) lines.push(`course.1–course.${o.courseNotes}: the course's own notes`)
  if (o.incomplete) lines.push('Some course material could not be read.')
  return lines.join('\n')
}

/** Search the complete text index, including pages far beyond an episode's assigned excerpt. */
// Words of three letters or more, and short labels with a digit (X1, D1, C8, 5V, 12): circuits are named that way.
const terms = (text: string) => [...new Set((text.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter((word) => word.length > 2 || /\p{N}/u.test(word)))]
export function searchStudyEvidence(items: StudyEvidence[], queries: string[], limit = 14): StudyEvidence[] {
  const wanted = terms(queries.join(' '))
  if (!wanted.length) return []
  const documents = items.map((item) => ({ item, words: new Set(terms(item.text)) }))
  const frequency = new Map(wanted.map((word) => [word, documents.filter((d) => d.words.has(word)).length]))
  return documents.map(({ item, words }) => ({ item, score: wanted.reduce((score, word) => score + (words.has(word) ? 1 + Math.log(1 + documents.length / (1 + (frequency.get(word) ?? 0))) : 0), 0) }))
    .filter((result) => result.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map(({ item }) => item)
}

/** Explicit chunk ids, rather than paths or model-supplied timestamps, are the read boundary. */
export function studyReadRequest(text: string): StudyReadRequest | null {
  try {
    const value = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
    if (!value || typeof value !== 'object') return null
    const list = (v: unknown, max: number) => Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.length <= 200).slice(0, max) : []
    return { queries: list(value.queries, 4), reads: list(value.reads, 8), images: list(value.images, STUDY_PAGE_IMAGES) }
  } catch { return null }
}

export const studyReferenceIds = (text: string): string[] => [...new Set([...text.matchAll(/\[[^\]\n]+\]\(study:([a-zA-Z0-9._-]+)\)/g)].map((match) => match[1]))]
export function citedStudyReferences(text: string, available: Map<string, StudyReference>): StudyReference[] {
  return studyReferenceIds(text).flatMap((id) => available.has(id) ? [available.get(id)!] : [])
}

/** Bounded chunks retain every character, including long pages and scripts; small enough that a few precise ones fit an answer. */
export function studyTextChunks(text: string, size = 1500): string[] {
  const chunks: string[] = []
  for (let offset = 0; offset < text.length; offset += size) chunks.push(text.slice(offset, offset + size))
  return chunks
}

export function pdfTextPages(text: string): { page: number; text: string }[] {
  const markers = [...text.matchAll(/^=== Page (\d+) ===\s*$/gm)]
  return markers.map((marker, i) => ({ page: Number(marker[1]), text: text.slice(marker.index! + marker[0].length, markers[i + 1]?.index ?? text.length).trim() }))
}
