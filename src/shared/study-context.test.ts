import test from 'node:test'
import assert from 'node:assert/strict'
import { citedStudyReferences, pdfTextPages, searchStudyEvidence, STUDY_EVIDENCE_CHARS, studyOutline, studyReadRequest, studyTextChunks, takeEvidence, type StudyEvidence } from './study-context.ts'
import type { StudyReference } from './types.ts'

test('retrieval searches later PDF pages and other episodes, ignoring case and accents', () => {
  const items = [{ id: 'p1.1.1', text: 'Contents and introduction' }, { id: 'p1.450.1', text: 'Régulation: negative feedback and equilibrium' }, { id: 'e7.t2', text: 'Stability and negative feedback in episode seven' }]
  const hits = searchStudyEvidence(items, ['regulation negative feedback'])
  assert.equal(hits[0].id, 'p1.450.1')
  assert.ok(hits.some((hit) => hit.id === 'e7.t2'))
  assert.deepEqual(searchStudyEvidence(items, ['unrelatedword']), [])
})

test('all long-page text is retained in chunks with correct page identities', () => {
  const text = 'Formula '.repeat(20000)
  const pages = pdfTextPages(`=== Page 1 ===\nIntroduction\n\n=== Page 450 ===\n${text}`)
  assert.equal(pages[1].page, 450)
  assert.equal(studyTextChunks(pages[1].text).join(''), text.trim())
  assert.ok(studyTextChunks(pages[1].text).length > 20)
})

test('a model can request only bounded ids and searches, not arbitrary tool execution', () => {
  assert.deepEqual(studyReadRequest('```json\n{"queries":["feedback",5],"reads":["p1.450"],"images":["p1.450"],"write":"scene.py"}\n```'), { queries: ['feedback'], reads: ['p1.450'], images: ['p1.450'] })
  assert.equal(studyReadRequest('not JSON'), null)
  assert.equal(studyReadRequest('null'), null)
  assert.equal(studyReadRequest(JSON.stringify({ queries: Array(20).fill('word'), reads: Array(30).fill('id') }))?.reads.length, 8)
})

test('only provided evidence ids become links; fabricated paths, times and duplicate citations do not', () => {
  const ref: StudyReference = { kind: 'video', id: 'e2.c1', title: 'Feedback', episode: 2, at: 75.25, dir: '/course/two', fingerprint: 'version' }
  const available = new Map([[ref.id, ref]])
  const text = '[wrong timestamp 99:99](study:e2.c1) [again](study:e2.c1) [invented](study:e9.c1) [outside](file:///secret)'
  assert.deepEqual(citedStudyReferences(text, available), [ref])
  assert.equal(citedStudyReferences('[lesson](study:../../secret)', available).length, 0)
})

test('an answer reads a bounded amount of evidence, in priority order, never a cut-off piece', () => {
  const chunk = (id: string, size: number): StudyEvidence => ({ id, text: 'x'.repeat(size) })
  const selected = new Map<string, StudyEvidence>()
  const added = takeEvidence(selected, [chunk('a', 9000), chunk('b', 9000), chunk('c', 6000), chunk('a', 10)])
  assert.deepEqual(added.map((item) => item.id), ['a', 'c']) // b would pass the budget; c still fits; a isn't taken twice
  assert.ok([...selected.values()].reduce((n, item) => n + item.text.length, 0) <= STUDY_EVIDENCE_CHARS)
  assert.deepEqual(takeEvidence(selected, [chunk('d', 2000)]).length, 0)
})

test('the course outline stays small: one line per lesson, chapters only for the open one', () => {
  const lessons = Array.from({ length: 20 }, (_, i) => ({
    id: `e${i + 1}`, number: i + 1, title: `Lesson title number ${i + 1}`, summary: 'What this lesson covers. '.repeat(30), playable: i < 18,
    chapters: Array.from({ length: 8 }, (_, c) => ({ id: `e${i + 1}.c${c + 1}`, title: `Chapter ${c + 1}` })),
  }))
  const outline = studyOutline({ course: 'Electronics', current: 'e3', lessons, documents: [{ id: 'p1', name: 'lab.pdf', pages: 42, imageOnly: [3, 7] }], courseNotes: 4, incomplete: false })
  assert.ok(outline.length < 6000, String(outline.length))
  assert.match(outline, /e3\.c8 "Chapter 8"/)
  assert.doesNotMatch(outline, /e4\.c1/)
  assert.match(outline, /e20: lesson 20 .*not made yet/)
  assert.match(outline, /p1: document "lab\.pdf", 42 pages .*read as images: 3, 7/)
  assert.match(outline, /course\.1–course\.4/)
})

test('short circuit labels like X1 and D1 are searchable, two-letter words are not', () => {
  const items = [{ id: 'p1.9.1', text: 'Slika A.2. Shema napajanja: konektor X1, diode D1 i D2' }, { id: 'p1.30.1', text: 'Smetnje i oklop na maketi' }, { id: 'p1.4.1', text: 'to je on' }]
  assert.equal(searchStudyEvidence(items, ['sto pise uz X1?'])[0].id, 'p1.9.1')
  assert.deepEqual(searchStudyEvidence(items, ['to je']), [])
})
