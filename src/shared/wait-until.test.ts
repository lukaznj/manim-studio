import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { waitUntil } from './wait-until.ts'

// A fake video job that finishes after 2 s, as wait_for_video sees it.
function fakeJob() {
  const events = new EventEmitter()
  const job = { state: 'working' }
  setTimeout(() => { job.state = 'working'; events.emit('change') }, 500)
  setTimeout(() => { job.state = 'done'; events.emit('change') }, 2000)
  const subscribe = (fn: () => void) => { events.on('change', fn); return () => void events.off('change', fn) }
  return { read: () => ({ ...job }), subscribe, events }
}
const settled = (job: { state: string }) => job.state !== 'working'

test('waits for the job to finish', async () => {
  const { read, subscribe, events } = fakeJob()
  assert.equal((await waitUntil(read, settled, subscribe, 5000)).state, 'done')
  assert.equal(events.listenerCount('change'), 0)
})

test('returns the job still working when the time runs out', async () => {
  const { read, subscribe, events } = fakeJob()
  assert.equal((await waitUntil(read, settled, subscribe, 1000)).state, 'working')
  assert.equal(events.listenerCount('change'), 0)
})
