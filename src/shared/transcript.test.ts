import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lineAt, transcriptHits } from './transcript.ts'

const lines = [
  { start: 0, end: 3, text: 'Dobro došli u epizodu 1.' },
  { start: 3, end: 7, text: 'Struja kroz otpornik R dva tri\novisi o naponu.' },
  { start: 8, end: 11, text: 'Kad napon raste, raste i struja.' },
]

test('matches ignore case and accents, and keep their place in the original', () => {
  assert.deepEqual(transcriptHits(lines, 'DOSLI'), [{ line: 0, from: 6, to: 11 }])
  const [hit] = transcriptHits(lines, 'ovisi')
  assert.equal(lines[hit.line].text.slice(hit.from, hit.to), 'ovisi')
})

test('every match, in order; spacing and line breaks are one space', () => {
  assert.deepEqual(
    transcriptHits(lines, 'struja').map((h) => h.line),
    [1, 2],
  )
  assert.deepEqual(
    transcriptHits(lines, 'raste').map((h) => [h.line, h.from]),
    [
      [2, 10],
      [2, 17],
    ],
  )
  const [across] = transcriptHits(lines, 'tri   ovisi')
  assert.equal(lines[across.line].text.slice(across.from, across.to), 'tri\novisi')
})

test('an empty query or no match finds nothing', () => {
  assert.deepEqual(transcriptHits(lines, '  '), [])
  assert.deepEqual(transcriptHits(lines, 'kirchhoff'), [])
})

test('the line at a moment: the one being said, or the last one before a gap', () => {
  assert.equal(lineAt(lines, 0), 0)
  assert.equal(lineAt(lines, 5), 1)
  assert.equal(lineAt(lines, 7.5), 1)
  assert.equal(lineAt(lines, 30), 2)
  assert.equal(lineAt([{ start: 2, end: 3 }], 1), -1)
})
