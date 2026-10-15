import assert from 'node:assert/strict'
import { test } from 'node:test'
import { limitFrom, limitFromText, limitText } from './usage-limit.ts'

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
