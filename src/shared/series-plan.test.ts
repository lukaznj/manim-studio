import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePlan } from './series-plan.ts'

test('a plan keeps only real episodes and the files that were given', () => {
  const answer = `Here it is:
{"title": "Circuits", "bible": "# Bible", "episodes": [
  {"title": "Ohm's law", "summary": "U = RI", "sources": [{"file": "1.pdf", "pages": "1-9"}, {"file": "made-up.pdf"}], "buildsOn": []},
  {"title": " ", "summary": "no title"},
  {"title": "Kirchhoff", "summary": "KCL and KVL", "sources": [{"file": "2.pdf"}], "buildsOn": [1, "x"]}
]}`
  const plan = parsePlan(answer, ['1.pdf', '2.pdf'])
  assert.equal(plan.title, 'Circuits')
  assert.deepEqual(plan.episodes.map((e) => e.title), ["Ohm's law", 'Kirchhoff'])
  assert.deepEqual(plan.episodes[0].sources, [{ file: '1.pdf', pages: '1-9' }])
  assert.deepEqual(plan.episodes[1].buildsOn, [1])
})

test('the user title wins, and a plan without episodes is refused', () => {
  assert.equal(parsePlan('{"title": "X", "episodes": [{"title": "A"}]}', [], 'Mine').title, 'Mine')
  assert.throws(() => parsePlan('{"episodes": []}', []), /didn’t propose any episodes/)
  assert.throws(() => parsePlan('not json', []), /wasn’t readable/)
})
