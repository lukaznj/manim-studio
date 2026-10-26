import assert from 'node:assert/strict'
import { test } from 'node:test'
import { criticalWork, protectWork, QuitCoordinator, setShutdownRequested, shutdownRequested, settleCriticalWork } from './work-lifecycle.ts'

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function fixture(overrides: Partial<ConstructorParameters<typeof QuitCoordinator>[0]> = {}) {
  const calls: string[] = []
  const quit = new QuitCoordinator({
    settle: async () => { calls.push('settle') },
    busy: () => true,
    confirm: async () => { calls.push('confirm'); return true },
    prepare: async () => { calls.push('prepare') },
    exit: () => { calls.push('exit') },
    failed: () => { calls.push('failed') },
    ...overrides,
  })
  return { quit, calls }
}

test('quit waits for episode creation before asking and never starts overlapping shutdowns', async () => {
  setShutdownRequested(false)
  const creation = deferred()
  const creating = protectWork(() => creation.promise)
  const { quit, calls } = fixture({ settle: settleCriticalWork })
  assert.equal(criticalWork(), true)
  const first = quit.request()
  const second = quit.request()
  assert.equal(first, second)
  await Promise.resolve()
  assert.deepEqual(calls, [])
  await assert.rejects(protectWork(async () => {}), /closing/)
  creation.resolve()
  await creating
  await first
  assert.deepEqual(calls, ['confirm', 'prepare', 'exit'])
  assert.equal(criticalWork(), false)
  setShutdownRequested(false)
})

test('cancelled quit leaves agents running and allows new work', async () => {
  setShutdownRequested(false)
  const { quit, calls } = fixture({ confirm: async () => false })
  await quit.request()
  assert.deepEqual(calls, ['settle'])
  assert.equal(quit.ready, false)
  assert.equal(shutdownRequested(), false)
  await protectWork(async () => {})
})

test('cleanup must complete before exit; failure cancels quit instead of losing the checkpoint', async () => {
  setShutdownRequested(false)
  const cleanup = deferred()
  const { quit, calls } = fixture({ prepare: () => cleanup.promise })
  const pending = quit.request()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(quit.ready, false)
  assert.ok(!calls.includes('exit'))
  cleanup.resolve()
  await pending
  assert.equal(quit.ready, true)
  setShutdownRequested(false)
  const failed = fixture({ prepare: async () => { throw new Error('Disk full') } })
  await failed.quit.request()
  assert.equal(failed.quit.ready, false)
  assert.ok(failed.calls.includes('failed'))
  assert.ok(!failed.calls.includes('exit'))
  assert.equal(shutdownRequested(), false)
})

test('OS shutdown checkpoints promptly, even while the user quit confirmation is unanswered', async () => {
  setShutdownRequested(false)
  const dialog = deferred<boolean>()
  const { quit, calls } = fixture({ confirm: () => dialog.promise })
  const pending = quit.request()
  await new Promise((resolve) => setImmediate(resolve))
  await quit.request(true)
  await pending
  assert.deepEqual(calls, ['settle', 'prepare', 'exit'])
  dialog.resolve(false)
  setShutdownRequested(false)
})

test('idle quit does not ask for confirmation', async () => {
  setShutdownRequested(false)
  const { quit, calls } = fixture({ busy: () => false })
  await quit.request()
  assert.deepEqual(calls, ['settle', 'prepare', 'exit'])
  setShutdownRequested(false)
})
