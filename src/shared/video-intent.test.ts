import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { videoIntent } from './video-intent.ts'

test('external video requests respect mode and Both requires explicit production intent', () => {
  assert.equal(videoIntent('learn', 'create'), 'learn')
  assert.equal(videoIntent('create', 'learn'), 'create')
  assert.equal(videoIntent('both'), 'learn')
  assert.equal(videoIntent('both', 'create'), 'create')
  assert.equal(videoIntent(undefined), 'learn')
})
