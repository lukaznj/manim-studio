import test from 'node:test'
import assert from 'node:assert/strict'
import { NOTE_LINES, shownSoFar, splitRemember, trimNote } from './about-you.ts'

test('the note keeps 20 short, non-empty lines', () => {
  const long = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n\n')
  assert.equal(trimNote(long).split('\n').length, NOTE_LINES)
  assert.equal(trimNote('  a  \n\n' + 'x'.repeat(300)).split('\n')[1].length, 200)
})

test('a last REMEMBER line becomes a proposal and leaves the answer', () => {
  assert.deepEqual(splitRemember('The answer.\n\nREMEMBER: Studies electrical engineering, first year.'), {
    text: 'The answer.',
    remember: 'Studies electrical engineering, first year.',
  })
  assert.deepEqual(splitRemember('Answer\n**REMEMBER:** Prefers short answers.\n'), { text: 'Answer', remember: 'Prefers short answers.' })
  assert.deepEqual(splitRemember('No proposal here.'), { text: 'No proposal here.' })
  assert.deepEqual(splitRemember('Remember: the chain rule applies.'), { text: 'Remember: the chain rule applies.' })
})

test('streaming never shows a REMEMBER line, and shown text only grows', () => {
  const answer = 'First line.\nSecond line.\nREMEMBER: Likes worked examples.'
  let shown = ''
  for (let i = 1; i <= answer.length; i++) {
    const next = shownSoFar(answer.slice(0, i))
    assert.ok(next.startsWith(shown), `shrank at ${i}`)
    shown = next
  }
  assert.equal(shown, 'First line.\nSecond line.\n')
  assert.equal(shownSoFar('Really good.'), 'Really good.')
})
