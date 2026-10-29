import assert from 'node:assert/strict'
import { test } from 'node:test'
import { agentConcurrency, WorkSlots } from './work-slots.ts'

test('optional agent capacity prioritizes finishing work and never interrupts an active turn', async () => {
  const slots = new WorkSlots(1)
  const first = await slots.acquire()
  const order: string[] = []
  const script = slots.acquire(undefined, 2).then((release) => { order.push('script'); return release })
  const video = slots.acquire(undefined, 1).then((release) => { order.push('video'); return release })
  const fix = slots.acquire(undefined, 0).then((release) => { order.push('fix'); return release })
  first(); (await fix)(); (await video)(); (await script)()
  assert.deepEqual(order, ['fix', 'video', 'script'])
})

test('cancelled waiting jobs do not run, and changing capacity wakes pending work', async () => {
  const slots = new WorkSlots(1)
  const release = await slots.acquire()
  const controller = new AbortController()
  const cancelled = slots.acquire(controller.signal)
  controller.abort()
  await assert.rejects(cancelled, /Stopped/)
  const ready = slots.acquire()
  slots.setCapacity(0)
  ;(await ready)(); release(); release()
  const a = await slots.acquire(); const b = await slots.acquire(); a(); b()
  assert.equal(agentConcurrency(-1), 0)
  assert.equal(agentConcurrency(NaN), 0)
  assert.equal(agentConcurrency(2.8), 3)
  assert.equal(agentConcurrency(100), 100)
})
