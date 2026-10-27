import type { StudyReference } from './types'

export interface StudyEvidence {
  id: string
  text: string
  reference?: StudyReference
}
export interface StudyReadRequest { queries: string[]; reads: string[]; images: string[] }

/** Search the complete text index, including pages far beyond an episode's assigned excerpt. */
const terms = (text: string) => [...new Set(text.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])]
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
    return { queries: list(value.queries, 4), reads: list(value.reads, 12), images: list(value.images, 4) }
  } catch { return null }
}

export const studyReferenceIds = (text: string): string[] => [...new Set([...text.matchAll(/\[[^\]\n]+\]\(study:([a-zA-Z0-9._-]+)\)/g)].map((match) => match[1]))]
export function citedStudyReferences(text: string, available: Map<string, StudyReference>): StudyReference[] {
  return studyReferenceIds(text).flatMap((id) => available.has(id) ? [available.get(id)!] : [])
}

/** Bounded paragraph chunks retain every character, including long pages and scripts. */
export function studyTextChunks(text: string, size = 3500): string[] {
  const chunks: string[] = []
  for (let offset = 0; offset < text.length; offset += size) chunks.push(text.slice(offset, offset + size))
  return chunks
}

export function pdfTextPages(text: string): { page: number; text: string }[] {
  const markers = [...text.matchAll(/^=== Page (\d+) ===\s*$/gm)]
  return markers.map((marker, i) => ({ page: Number(marker[1]), text: text.slice(marker.index! + marker[0].length, markers[i + 1]?.index ?? text.length).trim() }))
}
