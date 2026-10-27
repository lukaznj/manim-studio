import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apiEstimateOf, modelName, usageDelta, usageTotals, type UsageEntry } from './usage.ts'

const t = (input: number, output: number, costUSD: number) => ({ input, output, cacheRead: 0, cacheWrite: 0, costUSD })

test('subscription, legacy, mixed and unpriced usage never becomes an API bill', () => {
  const key: UsageEntry = { at: 0, step: 'Chat', auth: 'api-key', models: { s: t(10, 2, 0.5) }, tools: {}, ms: 0 }
  assert.equal(apiEstimateOf([key, key]), 1)
  assert.equal(apiEstimateOf([{ ...key, auth: 'account' }]), null)
  assert.equal(apiEstimateOf([{ ...key, auth: undefined }]), null)
  assert.equal(apiEstimateOf([key, { ...key, auth: 'account' }]), null)
  assert.equal(apiEstimateOf([{ ...key, costKnown: false }]), null)
  assert.equal(apiEstimateOf([]), null)
})

test('a turn is the running total minus the session’s previous one', () => {
  assert.deepEqual(usageDelta({ s: t(100, 10, 1) }, { s: t(250, 30, 2.5), h: t(5, 1, 0.01) }), { s: t(150, 20, 1.5), h: t(5, 1, 0.01) })
  assert.deepEqual(usageDelta({ s: t(100, 10, 1) }, { s: t(100, 10, 1) }), {}) // nothing new
  assert.deepEqual(usageDelta({ s: t(500, 50, 5) }, { s: t(40, 4, 0.4) }), { s: t(40, 4, 0.4) }) // totals started over
})

test('totals add up by model, and model ids read as names', () => {
  const e = (models: Record<string, ReturnType<typeof t>>) => ({ at: 0, step: 'x', models, tools: {}, ms: 0 })
  assert.deepEqual(usageTotals([e({ s: t(1, 1, 1) }), e({ s: t(2, 2, 2), o: t(1, 0, 3) })]), { s: t(3, 3, 3), o: t(1, 0, 3) })
  assert.equal(modelName('claude-sonnet-5-5'), 'Sonnet 5.5')
  assert.equal(modelName('claude-opus-5-5-20261001'), 'Opus 5.5')
  assert.equal(modelName('claude-haiku-5-5'), 'Haiku 5.5')
  assert.equal(modelName('gpt-5'), 'gpt-5')
})

test('CLI read-only turns retain their provider and auth without pretending unknown API prices are zero', async () => {
  const { cliUsageEntry } = await import('./usage.ts')
  const account = cliUsageEntry('codex', 'account', 'gpt-6.1-sol', { input_tokens: 100, cached_input_tokens: 40, output_tokens: 15 }, 'Tutor', 300)
  assert.equal(account.auth, 'account')
  assert.equal(account.provider, 'codex')
  assert.equal(account.models['gpt-6.1-sol'].input, 60)
  assert.equal(account.models['gpt-6.1-sol'].cacheRead, 40)
  assert.equal(apiEstimateOf([account]), null)
  assert.equal(apiEstimateOf([{ ...account, auth: 'api-key' }]), null)
  assert.equal(modelName('gpt-6-astra'), 'GPT-6 Astra')
  assert.equal(modelName('gpt-6.1-sol'), 'GPT-6.1 Sol')
})
