import test from 'node:test'
import assert from 'node:assert/strict'
import { citedStudyReferences, pdfTextPages, searchStudyEvidence, studyReadRequest, studyTextChunks } from './study-context.ts'
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
  assert.equal(studyReadRequest(JSON.stringify({ queries: Array(20).fill('word'), reads: Array(30).fill('id') }))?.reads.length, 12)
})

test('only provided evidence ids become links; fabricated paths, times and duplicate citations do not', () => {
  const ref: StudyReference = { kind: 'video', id: 'e2.c1', title: 'Feedback', episode: 2, at: 75.25, dir: '/course/two', fingerprint: 'version' }
  const available = new Map([[ref.id, ref]])
  const text = '[wrong timestamp 99:99](study:e2.c1) [again](study:e2.c1) [invented](study:e9.c1) [outside](file:///secret)'
  assert.deepEqual(citedStudyReferences(text, available), [ref])
  assert.equal(citedStudyReferences('[lesson](study:../../secret)', available).length, 0)
})
