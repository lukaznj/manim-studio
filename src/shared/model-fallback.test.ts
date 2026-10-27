import test from 'node:test'
import assert from 'node:assert/strict'
import { ModelLimitPools, normalizeModelOrder, modelRouteKey } from './model-fallback.ts'
import type { ModelRoute } from './types.ts'
const opus: ModelRoute = { agent: 'claude', auth: 'account', model: 'claude-opus-5-5', effort: 'high' }
const sonnet: ModelRoute = { ...opus, model: 'claude-sonnet-5-5' }
const astra: ModelRoute = { ...opus, agent: 'codex', model: 'gpt-6-astra' }
const sol: ModelRoute = { ...astra, model: 'gpt-6.1-sol' }

test('fallback order preserves priority, canonicalizes defaults and rejects invalid or duplicate routes', () => {
  const order = normalizeModelOrder([null, {}, { ...opus, model: 'opus' }, opus, { ...astra, model: 'gpt-old' }, sol, { ...sonnet, auth: 'secret' }, { ...sonnet, model: 'bad\nmodel' }, { ...sonnet, effort: 'ultra' }])
  assert.deepEqual(order, [opus, sol, sonnet])
  assert.equal(normalizeModelOrder(null).length, 0)
  assert.equal(modelRouteKey(sonnet), modelRouteKey({ ...sonnet, effort: 'low' }))
  assert.notEqual(modelRouteKey(opus), modelRouteKey({ ...opus, auth: 'api-key' }))
})

test('a generic account limit skips other models sharing that allowance but not another provider or explicit key', () => {
  const pools = new ModelLimitPools()
  pools.reject(opus, 2000, 'five_hour', 1000)
  assert.equal(pools.until(opus, 1000), 2000)
  assert.equal(pools.until(sonnet, 1000), 2000)
  assert.equal(pools.until({ ...opus, auth: 'api-key' }, 1000), 0)
  assert.equal(pools.until(astra, 1000), 0)
  pools.reject(astra, 3000, undefined, 1000)
  assert.equal(pools.until(sol, 1000), 3000)
  assert.equal(pools.until(sonnet, 2000), 0)
})

test('model-specific Claude limits leave the other model families available', () => {
  const pools = new ModelLimitPools()
  pools.reject(opus, 4000, 'seven_day_opus', 1000)
  assert.equal(pools.until(opus, 1000), 4000)
  assert.equal(pools.until(sonnet, 1000), 0)
  pools.reject(sonnet, 5000, 'seven_day', 1000)
  assert.equal(pools.until(opus, 1000), 5000)
})

test('unknown resets are bounded and persisted; malformed entries cannot break startup', () => {
  const pools = new ModelLimitPools([null, {}, { key: 'bad', until: 'no' }] as never)
  pools.reject(opus, 0, undefined, 1000)
  assert.equal(pools.until(opus, 1000), 1000 + 30 * 60_000)
  const restored = new ModelLimitPools(pools.entries(1000))
  assert.equal(restored.until(sonnet, 2000), pools.until(sonnet, 2000))
  assert.deepEqual(restored.entries(1000 + 30 * 60_000), [])
  assert.equal(restored.until(opus, 1000 + 30 * 60_000), 0)
})

test('a later concurrent quota result cannot shorten a known blocked allowance', () => {
  const pools = new ModelLimitPools()
  pools.reject(opus, 5000, undefined, 1000)
  pools.reject(sonnet, 3000, undefined, 1000)
  assert.equal(pools.until(opus, 1000), 5000)
})

test('the usage ring and model chooser use applicable allowances and never invent missing or API usage', async () => {
  const { modelUsagePercent } = await import('./model-fallback.ts')
  const usage = { agent: 'claude' as const, checkedAt: 1, windows: [{ label: '5-hour limit', percent: 46, resetsAt: null }, { label: 'Weekly limit', percent: 20, resetsAt: null }, { label: 'Weekly Opus', percent: 100, resetsAt: null }] }
  assert.equal(modelUsagePercent(opus, usage), 100)
  assert.equal(modelUsagePercent(sonnet, usage), 46)
  assert.equal(modelUsagePercent({ ...opus, auth: 'api-key' }, usage), null)
  assert.equal(modelUsagePercent(sol, usage), null)
  assert.equal(modelUsagePercent(opus, null), null)
  assert.equal(modelUsagePercent(opus, { ...usage, windows: [] }), null)
})
