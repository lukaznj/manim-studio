import assert from 'node:assert/strict'
import { test } from 'node:test'
import { limitFrom, limitFromText, limitText, UsageLimitAlerts, usageLimitFromError, CODEX_PLAN_MESSAGE, readableAgentError } from './usage-limit.ts'

test('a rejected rate limit event becomes a limit in milliseconds; allowed clears it', () => {
  assert.deepEqual(limitFrom({ status: 'rejected', resetsAt: 1_760_000_000, rateLimitType: 'five_hour' }), { until: 1_760_000_000_000, kind: 'five_hour' })
  assert.equal(limitFrom({ status: 'allowed_warning', resetsAt: 1_760_000_000 }), null)
  assert.deepEqual(limitFromText('Claude AI usage limit reached|1760000000'), { until: 1_760_000_000_000 })
  assert.equal(limitFromText('Something else broke'), null)
})

test('the message names the limit and when it resets', () => {
  const now = new Date(2026, 9, 15, 12, 0)
  const today = new Date(2026, 9, 15, 14, 30)
  const later = new Date(2026, 9, 19, 9, 0)
  const time = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  assert.equal(limitText({ until: today.getTime(), kind: 'five_hour' }, now), `You’ve reached your Claude 5-hour usage limit. It resets at ${time(today)}.`)
  assert.equal(
    limitText({ until: later.getTime(), kind: 'seven_day' }, now),
    `You’ve reached your Claude weekly usage limit. It resets ${later.toLocaleDateString([], { weekday: 'long' })} at ${time(later)}.`,
  )
  assert.match(limitText({ until: 0 }, now), /Try again later/)
})

test('quota failures from all providers are recognized; ordinary errors do not alert', () => {
  for (const error of ['You have hit your usage limit', 'RESOURCE_EXHAUSTED: quota exceeded', 'Too many requests', 'Rate limit reached'])
    assert.deepEqual(usageLimitFromError(error), { until: 0 })
  assert.deepEqual(usageLimitFromError('Claude AI usage limit reached|1760000000'), { until: 1_760_000_000_000 })
  for (const error of ['Sign in first', 'Stopped', 'Could not render scene.py', undefined]) assert.equal(usageLimitFromError(error), null)
})

test('parallel episodes and retries share one alert per account window; another provider or key can alert separately', () => {
  const alerts = new UsageLimitAlerts()
  assert.equal(alerts.enter('claude:account', 600_000, 0), true)
  assert.equal(alerts.enter('claude:account', 600_000, 2_000), false)
  alerts.recovered('claude:account', 3_000)
  assert.equal(alerts.enter('claude:account', 600_000, 100_000), false)
  assert.equal(alerts.enter('codex:account', 0, 4_000), true)
  assert.equal(alerts.enter('claude:api-key', 0, 4_000), true)
  assert.equal(alerts.enter('claude:account', 1_200_000, 650_000), true)
})

test('unknown reset times stay quiet until recovery, including delayed automatic retries', () => {
  const alerts = new UsageLimitAlerts()
  assert.equal(alerts.enter('antigravity:account', 0, 0), true)
  assert.equal(alerts.enter('antigravity:account', 0, 1_800_000), false)
  alerts.recovered('antigravity:account', 1_900_000)
  assert.equal(alerts.enter('antigravity:account', 0, 2_000_000), true)
  alerts.recovered('antigravity:account', 2_001_000)
  assert.equal(alerts.enter('antigravity:account', 0, 2_002_000), false)
})

test('a ChatGPT plan that cannot run the model gets a readable message and counts as a limit', () => {
  const raw = '{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The \'gpt-6.1-sol\' model is not supported when using Codex with a ChatGPT account.","code":"model_not_found"}}'
  assert.equal(readableAgentError(raw), CODEX_PLAN_MESSAGE)
  assert.ok(usageLimitFromError(raw))
  assert.ok(usageLimitFromError(CODEX_PLAN_MESSAGE)) // after it's reworded too, so automatic switching still moves on
  assert.equal(readableAgentError('stream error: {"error":{"message":"The server had a problem."}}'), 'The server had a problem.')
  assert.equal(readableAgentError('scene.py line 4: NameError'), 'scene.py line 4: NameError')
})
