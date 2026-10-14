import assert from 'node:assert/strict'
import { test } from 'node:test'
import { titleFrom } from './title.ts'

test('a title is the first clause of the request, short enough for a folder', () => {
  assert.equal(titleFrom('Explain the vertex of a parabola, with two examples. Keep it short.'), 'Explain the vertex of a parabola')
  assert.equal(titleFrom('  Ohm’s law\nfor first-years'), 'Ohm’s law')
  const long = titleFrom('Walk through every step of solving a quadratic equation by completing the square and then by the formula')
  assert.ok(long.length <= 60 && !long.endsWith(' '), long)
  assert.equal(titleFrom('   '), 'Quick video')
})
