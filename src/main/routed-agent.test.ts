import test from 'node:test'
import assert from 'node:assert/strict'
import { routedAgent } from './routed-agent.ts'
import { ModelLimitPools, modelRouteKey } from '../shared/model-fallback.ts'
import type { ModelRoute } from '../shared/types'
import type { TurnResult } from './claude'

const first: ModelRoute = { agent: 'claude', auth: 'account', model: 'claude-sonnet-5-5', effort: 'high' }
const second: ModelRoute = { agent: 'codex', auth: 'account', model: 'gpt-6.1-sol', effort: 'high' }
const third: ModelRoute = { agent: 'antigravity', auth: 'account', model: 'gemini-4-argon', effort: 'high' }

function fixture(initial = first, followPriority = true) {
  let now = 1000, enabled = true
  const pools = new ModelLimitPools()
  const calls: { route: ModelRoute; prompt: string; step: string }[] = []
  const closed: ModelRoute[] = [], selections: ModelRoute[] = []
  let run: (route: ModelRoute) => Promise<TurnResult> = async () => ({ ok: true })
  const agent = routedAgent(initial, {
    enabled: () => enabled,
    preferred: async (tried = new Set()) => [first, second, third].find((route) => !tried.has(modelRouteKey(route)) && !pools.until(route, now)) ?? null,
    blocked: (route) => pools.until(route, now),
    exhaustedUntil: () => Math.min(...pools.entries(now).map((entry) => entry.until)),
    reject: (route, until, kind) => pools.reject(route, until, kind, now),
    outcome: () => {}, selected: (route) => selections.push(route),
    resume: (text) => `Saved conversation and current files: ${text}`, notice: () => {},
    followPriority, withHistory: false,
    open: async (route) => ({
      turn: async (prompt, step) => { calls.push({ route, prompt, step }); return run(route) },
      close: () => { closed.push(route) },
    }),
  })
  return { agent, pools, calls, closed, selections, time: (at: number) => { now = at }, enabled: (value: boolean) => { enabled = value }, run: (fn: typeof run) => { run = fn } }
}

test('a live production session falls back, then returns to priority one on its next turn after reset', async () => {
  const f = fixture()
  f.run(async (route) => route.agent === 'claude' && f.calls.length === 1 ? { ok: false, limitedUntil: 2000 } : { ok: true })
  assert.equal((await f.agent.turn('Write the script', 'Script')).ok, true)
  assert.deepEqual(f.calls.map((call) => call.route), [first, second])
  await f.agent.turn('Make the video', 'Video')
  assert.equal(f.calls.at(-1)!.route, second)
  f.time(2000)
  await f.agent.turn('Fix the render', 'Fix')
  assert.equal(f.calls.at(-1)!.route, first)
  assert.match(f.calls.at(-1)!.prompt, /Saved conversation and current files/)
  assert.deepEqual(f.closed, [first, second])
  assert.deepEqual(f.selections, [first, second, first])
})

test('a saved fallback assignment uses the highest available route, including partial recovery of the order', async () => {
  const f = fixture(third)
  f.pools.reject(first, 4000, undefined, 1000)
  f.pools.reject(second, 2000, undefined, 1000)
  await f.agent.turn('Continue', 'Video')
  assert.equal(f.calls.at(-1)!.route, third)
  f.time(2000)
  await f.agent.turn('Continue', 'Video')
  assert.equal(f.calls.at(-1)!.route, second)
  f.time(4000)
  await f.agent.turn('Continue', 'Video')
  assert.equal(f.calls.at(-1)!.route, first)
})

test('priority recovery never closes a provider mid-turn and disabling the policy retains the current selection', async () => {
  const f = fixture(second)
  f.pools.reject(first, 2000, undefined, 1000)
  let finish!: (value: TurnResult) => void
  f.run(() => new Promise((resolve) => { finish = resolve }))
  const active = f.agent.turn('Make video', 'Video')
  while (!finish) await new Promise((resolve) => setImmediate(resolve))
  f.time(3000)
  assert.deepEqual(f.closed, [])
  finish({ ok: true })
  await active
  f.enabled(false)
  f.run(async () => ({ ok: true }))
  await f.agent.turn('Fix', 'Fix')
  assert.equal(f.calls.at(-1)!.route, second)
  f.enabled(true)
  await f.agent.turn('Fix', 'Fix')
  assert.equal(f.calls.at(-1)!.route, first)
})

test('manual chat choices remain selected; ordinary errors do not cause a fallback', async () => {
  const f = fixture(second, false)
  f.run(async () => ({ ok: false, error: 'Network disconnected' }))
  const result = await f.agent.turn('Question', 'Chat')
  assert.equal(result.error, 'Network disconnected')
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].route, second)
  assert.deepEqual(f.pools.entries(1000), [])
})

test('all exhausted routes wait until the earliest recovery and cancellation cannot reopen a session', async () => {
  const f = fixture(third)
  for (const [route, until] of [[first, 4000], [second, 2000], [third, 3000]] as const) f.pools.reject(route, until, undefined, 1000)
  assert.equal((await f.agent.turn('Continue', 'Video')).limitedUntil, 2000)
  assert.equal(f.calls.length, 0)
  f.time(2000)
  await f.agent.turn('Continue', 'Video')
  assert.equal(f.calls[0].route, second)
  f.agent.close()
  f.time(5000)
  assert.equal((await f.agent.turn('Continue', 'Video')).error, 'Stopped')
  assert.equal(f.calls.length, 1)
})
