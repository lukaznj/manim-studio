import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nearbyFollowUps, studyModel, validFrameRegion, videoAdvice } from './study-assistant.ts'

test('study defaults stay separate from the creation model and only use supported Codex models', () => {
  assert.deepEqual(studyModel({ agent: 'claude' }), { model: 'claude-sonnet-5-5', effort: 'high' })
  assert.equal(studyModel({ agent: 'codex', studyModels: { codex: { model: 'retired', effort: 'high' } } }).model, 'gpt-6.1-sol')
})
test('a text recommendation preserves a concise title and explanation; malformed advice cannot create videos', () => {
  assert.deepEqual(videoAdvice('```json\n{"medium":"text","title":"Current splitting","answer":"Use $I=V/R$."}\n```'), {
    medium: 'text', title: 'Current splitting', answer: 'Use $I=V/R$.',
  })
  for (const raw of ['video', '{}', '{"medium":"yes","title":"X","answer":"Y"}', '{"medium":"video","title":"","answer":"Y"}'])
    assert.throws(() => videoAdvice(raw))
})
test('frame regions reject out-of-bounds, empty and nonfinite selections', () => {
  assert.ok(validFrameRegion({ x: .1, y: .2, width: .6, height: .5 }))
  for (const r of [{ x: -1, y: 0, width: .5, height: .5 }, { x: .8, y: 0, width: .5, height: .5 }, { x: 0, y: 0, width: 0, height: 1 }, { x: NaN, y: 0, width: 1, height: 1 }])
    assert.equal(validFrameRegion(r), false)
})
test('timestamp cues only offer finished additional videos near their original moment', () => {
  const items = [{ at: 20, state: 'done' }, { at: 20, state: 'making' }, { at: 40, state: 'done' }]
  assert.deepEqual(nearbyFollowUps(items, 19), [items[0]])
  assert.deepEqual(nearbyFollowUps(items, 29), [])
})
