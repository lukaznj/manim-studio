import assert from 'node:assert/strict'
import { test } from 'node:test'
import { artifactProgress, phasePercent } from './production-progress.ts'

test('authoring percentages never invent an unknown denominator or claim completion from an estimate', () => {
  assert.equal(phasePercent(), undefined)
  assert.equal(phasePercent({ completed: 2, total: 0 }), undefined)
  assert.equal(phasePercent({ completed: NaN, total: 4 }), undefined)
  assert.equal(phasePercent({ completed: 1, total: 3 }), 33)
  assert.equal(phasePercent({ completed: 3, total: 3 }), 99)
  assert.equal(phasePercent({ completed: 3, total: 3, done: true }), 100)
  assert.equal(phasePercent({ completed: -1, total: 3 }), 0)
})

test('a script outline is not written work; localized matching section names provide a fallback', () => {
  const script = '# Prijenos topline\n\n## Početak\n[pending]\n\n## Razlika temperatura\n' + '**Narration:**\n> Toplina prelazi s toplijeg tijela na hladnije. Promotrimo razliku temperatura.\n**On screen:** Two blocks.\n'
  const progress = artifactProgress(script, 'self.next_section("Razlika temperatura")\nself.play(Write(label))\nself.next_section("Razlika temperatura")\nself.wait(1)')
  assert.deepEqual(progress.script, { completed: 1, total: 2 })
  assert.deepEqual(progress.scene, { completed: 1, total: 2 })
  assert.deepEqual(artifactProgress('', 'self.next_section("Opening")'), {})
})

test('CRLF scripts and quotes in chapter names do not inflate completed work', () => {
  const body = 'A complete visual explanation with narration and detailed on screen directions for the learner.'
  const script = `## First\r\n${body}\r\n## Second\r\n[pending]\r\n`
  const progress = artifactProgress(script, "self.next_section('First')\nself.play(Write(label))\nself.next_section('Unplanned')\nself.wait(1)")
  assert.equal(progress.script?.completed, 1)
  assert.equal(progress.scene?.completed, 1)
  assert.equal(progress.scene?.total, 2)
})

test('an empty scene outline and commented animation calls do not count as implemented sections', () => {
  const progress = artifactProgress('## Opening\n[pending]\n## Recap\n[pending]\n', 'self.next_section("Opening")\n# self.play(Write(label))\nself.next_section("Recap")\npass\n')
  assert.equal(progress.scene?.completed, 0)
  assert.equal(progress.scene?.total, 2)
})
