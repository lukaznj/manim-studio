import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sliceProgress } from './export-progress.ts'

test('parallel rendering reports animations as they finish, rather than whole worker completions', () => {
  const readings: number[] = []
  const update = sliceProgress(100, 5, (p) => readings.push(p))
  update(0, 1)
  update(3, 61)
  update(0, 2)
  assert.deepEqual(readings, [0.01, 0.02, 0.03])
  update(3, 60) // a duplicate or earlier event must not rewind progress
  update(2, 15) // animations skipped before the worker's range aren't its work
  assert.equal(readings.length, 3)
  for (let i = 0; i < 5; i++) update(i, 100) // events after a slice's range are clamped
  assert.equal(readings.at(-1), 1)
})

test('uneven slices weight actual animation counts, with no completion invented for failed workers', () => {
  const readings: number[] = []
  const update = sliceProgress(43, 5, (p) => readings.push(p))
  update(4, 43) // seven animations in the last slice, nine in the others
  assert.equal(readings.at(-1), 7 / 43)
  for (let i = 0; i < 3; i++) update(i, 43)
  assert.equal(readings.at(-1), 34 / 43) // fourth worker hasn't reported completion
  update(3, 43)
  assert.equal(readings.at(-1), 1)
})
