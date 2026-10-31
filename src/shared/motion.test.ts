import assert from 'node:assert/strict'
import { test } from 'node:test'
import { motionFrames, motionRequest, motionSize, motionTimes } from './motion.ts'

test('motion inserts bound render work and refuse unsafe media names before file access', () => {
  for (const name of ['../escape', '/absolute', 'C:\\escape', 'name.html', 'two words', '', 'a'.repeat(49)])
    assert.equal(motionRequest.safeParse({ name }).success, false, name)
  for (const seconds of [0, -1, 12.1, Infinity, NaN])
    assert.equal(motionRequest.safeParse({ name: 'gears', html: '<html>', seconds }).success, false)
  assert.equal(motionRequest.safeParse({ name: 'gears', html: 'a'.repeat(100001), seconds: 2 }).success, false)
  assert.deepEqual(motionRequest.parse({ name: 'gears', mode: 'status' }), { name: 'gears', mode: 'status' })
  assert.equal(motionFrames(12), 360)
  assert.equal(motionFrames(0.5), 15)
})

test('motion sampling stays within the clip and keeps landscape and portrait geometry', () => {
  for (const seconds of [0.5, 2.25, 12]) {
    const times = motionTimes(seconds)
    assert(times.every((t) => t >= 0 && t < seconds))
    assert.equal(times[0], 0)
    assert.equal(times[1], seconds / 2)
  }
  assert.deepEqual(motionSize(false), { width: 1920, height: 1080 })
  assert.deepEqual(motionSize(true), { width: 1080, height: 1920 })
})
