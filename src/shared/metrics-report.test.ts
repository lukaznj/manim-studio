import test from 'node:test'
import assert from 'node:assert/strict'
import { renderMetricsReport, phaseDurations, usageTokenCount } from './metrics-report.ts'
import type { ReportEpisode } from './metrics-report.ts'

const sample = (): ReportEpisode => ({
  metrics: {
    version: 1,
    title: '<script>alert(1)</script>',
    selection: { agent: 'codex', model: 'sol' },
    options: { usage: true, timing: true, resources: true },
    startedAt: 1000,
    finishedAt: 11000,
    outcome: 'done',
    phases: [
      { at: 1000, name: 'Script' },
      { at: 4000, name: 'Implementation' },
      { at: 7000, name: 'Paused' },
      { at: 9000, name: 'Export' },
    ],
    resources: [{ at: 2000, systemRamMb: 1024, systemCpuPercent: 20 }],
    accounts: [],
    notes: [],
  },
  usage: [
    {
      at: 4000,
      step: 'Script',
      ms: 3000,
      tools: {},
      models: { sol: { input: 90, output: 20, cacheRead: 10, cacheWrite: 0, costUSD: 0 } },
      providerUsage: { input_tokens: 100, cached_input_tokens: 10, output_tokens: 20 },
      costKnown: false,
    },
  ],
  voice: [{ at: 5000, model: 'v4', characters: 100, billedCharacters: null, success: true }],
})

test('provider totals do not double-count cached input or invent missing prices', () => {
  const episode = sample()
  assert.equal(usageTokenCount(episode.usage[0]), 120)
  const html = renderMetricsReport([episode], 'Test')
  assert.match(html, /Not reported/)
  assert.match(html, /Incomplete/)
  assert.match(html, /Missing data is not zero/)
})

test('phase timing preserves pauses and includes the final export interval', () => {
  assert.deepEqual(phaseDurations(sample().metrics), [
    { name: 'Script', ms: 3000 },
    { name: 'Implementation', ms: 3000 },
    { name: 'Paused', ms: 2000 },
    { name: 'Export', ms: 2000 },
  ])
})

test('reports escape project text, stay offline and localize headings', () => {
  const html = renderMetricsReport([sample()], 'Unsafe <img onerror=alert(1)>', 'hr')
  assert(!html.includes('<script>'))
  assert(!html.includes('<img onerror='))
  assert.match(html, /&lt;script&gt;/)
  assert.match(html, /default-src 'none'/)
  assert.match(html, /Korištenje kroz vrijeme/)
  assert(!html.includes('NaN'))
})

test('comparison time excludes measurement setup and finalization overhead', () => {
  const episode = sample()
  episode.metrics.phases = [
    { at: 1000, name: 'Metrics setup' },
    { at: 3000, name: 'Script' },
    { at: 7000, name: 'Metrics finalization' },
  ]
  const html = renderMetricsReport([episode, episode], 'Comparison')
  assert.match(html, /Episode comparison/)
  assert.match(html, /<td>0m 4s<\/td>/)
  assert.match(html, /Peak Studio RAM/)
})
