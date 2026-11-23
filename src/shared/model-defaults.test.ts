import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeCodexSettings, studioCodexModels } from './codex-selection.ts'
import { seriesSelection } from './agent-selection.ts'
import type { Settings } from './types.ts'

test('Codex offers GPT-6 Astra and the GPT-6.1 models, with the account’s efforts', () => {
  const catalog = ['', 'gpt-6-sol', 'gpt-6-luna', 'gpt-6-astra', 'gpt-6.1-sol', 'gpt-6.1-terra'].map((value) => ({
    value, label: value, description: 'From account', efforts: ['high' as const],
  }))
  const offered = studioCodexModels(catalog)
  assert.deepEqual(offered.map((m) => [m.value, m.label]), [['gpt-6-astra', 'GPT-6 Astra'], ['gpt-6.1-sol', 'GPT-6.1 Sol'], ['gpt-6.1-terra', 'GPT-6.1 Terra']])
  assert.deepEqual(offered[0].efforts, ['high'])
  assert.deepEqual(studioCodexModels(catalog.slice(0, 3)), [])
})

test('old and retired Codex settings migrate to Astra planning and Sol creation without changing other providers', () => {
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
  const explicit = { codexModel: 'gpt-6.1-terra', codexFallbackModel: 'gpt-6.1-sol', seriesModels: { codex: { plan: { model: 'gpt-6.1-terra', effort: 'high' as const } } } }
  assert.deepEqual(normalizeCodexSettings(explicit), explicit)
  const defaults = normalizeCodexSettings({ codexModel: '', agent: 'codex', codexEffort: 'high' } as Settings)
  assert.equal(seriesSelection(defaults, 'plan').model, 'gpt-6-astra')
  assert.equal(seriesSelection(defaults, 'make').model, 'gpt-6.1-sol')
})
