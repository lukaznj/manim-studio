// node --test --experimental-strip-types src/**/*.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyEdit, draggedDuration, durationEdit, formatSeconds } from './edits.ts'

const src = ['x = 1', '        self.play(Write(t), run_time=2)', '        self.wait()', '        self.play(FadeIn(č), run_time=1)'].join('\n')

test('replaces an existing literal', () => {
  // `2` sits at characters 37..38 on line 2 (0-based), as studio_runner/source.py reports.
  const out = applyEdit(src, durationEdit({ line: 2, col: 37, endLine: 2, endCol: 38, value: 2, prefix: '' }, 2.5))
  assert.match(out, /run_time=2\.5\)/)
})

test('inserts into an empty wait()', () => {
  const out = applyEdit(src, durationEdit({ line: 3, col: 18, endLine: 3, endCol: 18, value: null, prefix: '' }, 1))
  assert.match(out, /self\.wait\(1\.0\)/)
})

test('inserts run_time after the last argument', () => {
  const s = 'self.play(Write(t))'
  const out = applyEdit(s, durationEdit({ line: 1, col: 18, endLine: 1, endCol: 18, value: null, prefix: ', run_time=' }, 0.8))
  assert.equal(out, 'self.play(Write(t), run_time=0.8)')
})

test('columns are characters, so Croatian letters before the literal do not shift it', () => {
  const line = src.split('\n')[3]
  const col = line.indexOf('run_time=1') + 'run_time='.length
  const out = applyEdit(src, durationEdit({ line: 4, col, endLine: 4, endCol: col + 1, value: 1, prefix: '' }, 3))
  assert.match(out, /FadeIn\(č\), run_time=3\.0\)/)
})

test('drag math rounds to tenths and never goes below 0.1 s', () => {
  assert.equal(draggedDuration(2, 4, 50, 100), 2.5)
  assert.equal(draggedDuration(2, 4, -1000, 100), 0.1)
  assert.equal(formatSeconds(2), '2.0')
  assert.equal(formatSeconds(1.25), '1.3')
})
