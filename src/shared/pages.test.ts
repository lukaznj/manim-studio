import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pageRanges } from './pages.ts'

test('runs of pages collapse into ranges, in order, without repeats', () => {
  assert.equal(pageRanges([8, 3, 4, 5, 4]), '3–5, 8')
  assert.equal(pageRanges([1]), '1')
  assert.equal(pageRanges([2, 4, 6]), '2, 4, 6')
  assert.equal(pageRanges([9, 10]), '9–10')
  assert.equal(pageRanges([]), '')
})
