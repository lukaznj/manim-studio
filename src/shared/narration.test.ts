import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Timeline } from './types'
import { narrationStatus } from './narration.ts'

const timeline = (sources: string[], warnings: string[] = []): Timeline => ({ voice: sources.map((source) => ({ source })), voiceSettings: { provider: 'elevenlabs', language: 'en' }, voiceWarnings: warnings } as Timeline)
test('silent and partially silent narration stay watchable with a credit-specific recovery reason', () => {
  const status = narrationStatus(timeline(['elevenlabs', 'silence'], ['elevenlabs: HTTP 401: You have 0 credits remaining.']))!
  assert.equal(status.silentBlocks, 1)
  assert.equal(status.totalBlocks, 2)
  assert.equal(status.issues[0].kind, 'credits')
  assert.equal(narrationStatus(timeline(['elevenlabs'], ['ElevenLabs credits exhausted'])), undefined)
  assert.equal(narrationStatus(timeline([])), undefined)
  assert.equal(narrationStatus({ ...timeline(['silence']), voiceSettings: { provider: 'none', language: 'en' } } as unknown as Timeline), undefined)
})
test('authentication failures are not quota failures and successful retry clears recovery state', () => {
  const status = narrationStatus(timeline(['silence'], ['elevenlabs: HTTP 401: Invalid API key']))!
  assert.equal(status.issues.length, 0)
  const recovered = { ...timeline(['omnivoice']), voiceSettings: { provider: 'omnivoice' as const, language: 'en' } }
  assert.equal(narrationStatus(recovered, [], 'elevenlabs')?.fallback, 'omnivoice')
  assert.equal(narrationStatus(timeline(['elevenlabs']), [], 'elevenlabs'), undefined)
})
