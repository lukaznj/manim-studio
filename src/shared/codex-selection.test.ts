import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeCodexSettings, studioCodexModels } from './codex-selection.ts'
import { seriesSelection } from './agent-selection.ts'
import type { Settings } from './types.ts'

test('Codex choices exclude account defaults and retired models while preserving discovered efforts', () => {
  const catalog = ['', 'gpt-6-sol', 'gpt-6-luna', 'gpt-6-astra', 'gpt-6.1-sol'].map((value) => ({
    value, label: value, description: 'From account', efforts: ['high' as const],
  }))
  const offered = studioCodexModels(catalog)
  assert.deepEqual(offered.map((m) => m.value), ['gpt-6-astra', 'gpt-6.1-sol'])
  assert.deepEqual(offered[0].efforts, ['high'])
  assert.deepEqual(studioCodexModels(catalog.slice(0, 3)), [])
})

test('old Codex settings migrate to Astra planning and Sol execution without changing other providers', () => {
  const old = {
    codexModel: '', codexFallbackModel: 'gpt-6-luna',
    seriesModels: {
      codex: { plan: { model: 'gpt-6-sol', effort: 'high' as const }, make: { model: '', effort: 'medium' as const } },
      claude: { plan: { model: 'opus', effort: 'high' as const } },
    },
  }
  const migrated = normalizeCodexSettings(old)
  assert.equal(migrated.codexModel, 'gpt-6.1-sol')
  assert.equal(migrated.codexFallbackModel, undefined)
  assert.equal(migrated.seriesModels.codex.plan.model, 'gpt-6-astra')
  assert.equal(migrated.seriesModels.codex.make.model, 'gpt-6.1-sol')
  assert.equal(migrated.seriesModels.codex.make.effort, 'medium')
  assert.deepEqual(migrated.seriesModels.claude, old.seriesModels.claude)
  assert.equal(old.codexModel, '')
})

test('supported explicit selections survive migration; new installs use role defaults', () => {
  const explicit = { codexModel: 'gpt-6-astra', codexFallbackModel: 'gpt-6.1-sol', seriesModels: { codex: { plan: { model: 'gpt-6.1-sol', effort: 'high' as const } } } }
  assert.deepEqual(normalizeCodexSettings(explicit), explicit)
  const defaults = normalizeCodexSettings({ codexModel: '', agent: 'codex', codexEffort: 'high' } as Settings)
  assert.equal(seriesSelection(defaults, 'plan').model, 'gpt-6-astra')
  assert.equal(seriesSelection(defaults, 'make').model, 'gpt-6.1-sol')
})
