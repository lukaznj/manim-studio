import test from 'node:test'
import assert from 'node:assert/strict'
import { isModelCapacityError, recoverModelCapacity, type CapacityResult } from './codex-recovery.ts'

test('capacity recovery retries once, then uses only the configured model', async () => {
  const calls: string[] = []
  const notices: string[] = []
  let waits = 0
  const result = await recoverModelCapacity({
    model: 'primary',
    fallback: 'backup',
    attempt: async (model) => {
      calls.push(model)
      return model === 'backup' ? { ok: true } : { ok: false, error: 'server_is_overloaded' }
    },
    wait: async () => {
      waits++
    },
    notice: (message) => notices.push(message),
  })
  assert.equal(result.ok, true)
  assert.deepEqual(calls, ['primary', 'primary', 'backup'])
  assert.equal(waits, 1)
  assert.match(notices[1], /backup/)
})

test('auth, account limits, unsupported models and tool failures never trigger recovery', async () => {
  for (const error of [
    '401 unauthorized',
    'rate_limit_exceeded',
    'quota exceeded',
    'model not supported',
    'permission denied',
    'tool failed',
    'model at capacity but usage limit exceeded',
  ]) {
    let calls = 0
    await recoverModelCapacity({
      model: 'primary',
      fallback: 'backup',
      attempt: async () => {
        calls++
        return { ok: false, error }
      },
      wait: async () => assert.fail('must not retry'),
      notice: () => {},
    })
    assert.equal(calls, 1, error)
    assert.equal(isModelCapacityError(error), false)
  }
})

test('never replays a turn that produced output or tool work', async () => {
  for (const attemptStarted of [1, 2]) {
    let calls = 0
    const result = await recoverModelCapacity({
      model: 'primary',
      fallback: 'backup',
      attempt: async () => ({ ok: false, error: 'The model is at capacity', started: ++calls === attemptStarted }),
      wait: async () => {},
      notice: () => {},
    })
    assert.equal(result.started, true)
    assert.equal(calls, attemptStarted)
  }
})

test('model comparisons retry the assigned model without substituting one', async () => {
  const calls: string[] = []
  const failed: CapacityResult = { ok: false, error: 'model_capacity_exceeded' }
  await recoverModelCapacity({
    model: 'assigned',
    attempt: async (model) => {
      calls.push(model)
      return failed
    },
    wait: async () => {},
    notice: () => {},
  })
  assert.deepEqual(calls, ['assigned', 'assigned'])
})

test('cancellation during backoff never starts another request', async () => {
  let calls = 0
  await assert.rejects(
    recoverModelCapacity({
      model: 'primary',
      fallback: 'backup',
      attempt: async () => {
        calls++
        return { ok: false, error: 'server_overloaded' }
      },
      wait: async () => {
        throw new Error('Stopped')
      },
      notice: () => {},
    }),
    /Stopped/,
  )
  assert.equal(calls, 1)
})
