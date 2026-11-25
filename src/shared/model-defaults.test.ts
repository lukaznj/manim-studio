import test from 'node:test'
import assert from 'node:assert/strict'
import { MAKER_DEFAULTS, migrateModelDefaults, sortModels } from './model-defaults.ts'
import { defaultAgentSelection, seriesSelection } from './agent-selection.ts'
import { studyModel } from './study-assistant.ts'
import type { Settings } from './types.ts'

test('lists are sorted newest first, keeping the provider’s order within a version', () => {
  const labels = ['GPT-6 Luna', 'GPT-6.1 Sol', 'GPT-5.6 Terra', 'GPT-6.2 Sol', 'GPT-6.1 Terra', 'Opus 5.5', 'Gemini 3.8 Flash', 'GPT-6.10 Sol']
  assert.deepEqual(sortModels(labels.map((label) => ({ label }))).map((m) => m.label),
    ['GPT-6.10 Sol', 'GPT-6.2 Sol', 'GPT-6.1 Sol', 'GPT-6.1 Terra', 'GPT-6 Luna', 'GPT-5.6 Terra', 'Opus 5.5', 'Gemini 3.8 Flash'])
})

test('defaults saved by older versions become unset once; explicit choices stay', () => {
  const old = {
    claudeModel: 'claude-sonnet-5-5', codexModel: 'gpt-6.1-sol',
    seriesModels: {
      codex: { plan: { model: 'gpt-6-astra', effort: 'high' as const }, make: { model: 'gpt-6.1-sol', effort: 'medium' as const } },
      claude: { plan: { model: 'claude-fable-5-2', effort: 'high' as const } },
      antigravity: { plan: { model: 'gemini-4-neon', effort: 'high' as const } },
    },
  }
  const migrated = migrateModelDefaults(old)
  assert.equal(migrated.claudeModel, '')
  assert.equal(migrated.codexModel, '')
  assert.deepEqual(migrated.seriesModels.codex, {})
  assert.deepEqual(migrated.seriesModels.claude, old.seriesModels.claude)
  assert.deepEqual(migrated.seriesModels.antigravity, {})
  assert.equal(migrated.defaultsVersion, 2)
  // Once only: picking GPT-6.1 Sol afterwards sticks.
  assert.equal(migrateModelDefaults({ ...migrated, codexModel: 'gpt-6.1-sol' }).codexModel, 'gpt-6.1-sol')
})

const base = { agent: 'claude', claudeModel: '', claudeEffort: 'high', codexModel: '', codexEffort: 'high', antigravityModel: '', antigravityEffort: 'medium' } as Settings

test('unset models resolve to Studio’s defaults; GPT-6.2 Sol for every Codex role', () => {
  const codex = { ...base, agent: 'codex' } as Settings
  assert.equal(defaultAgentSelection(codex).model, 'gpt-6.2-sol')
  assert.equal(seriesSelection(codex, 'plan').model, 'gpt-6.2-sol')
  assert.equal(seriesSelection(codex, 'make').model, 'gpt-6.2-sol')
  assert.equal(studyModel(codex).model, 'gpt-6.2-sol')
  assert.equal(defaultAgentSelection(base).model, MAKER_DEFAULTS.claude)
  assert.equal(seriesSelection(base, 'plan').model, 'opus')
})

test('each role can use its own provider', () => {
  const mixed = {
    ...base,
    studyAgent: 'codex', planAgent: 'antigravity',
    seriesModels: { antigravity: { plan: { model: 'gemini-4-argon', effort: 'high' } } },
  } as Settings
  assert.deepEqual(defaultAgentSelection(mixed), { agent: 'claude', model: 'claude-sonnet-5-5', effort: 'high' })
  assert.deepEqual(studyModel(mixed), { agent: 'codex', model: 'gpt-6.2-sol', effort: 'high' })
  assert.deepEqual(seriesSelection(mixed, 'plan'), { agent: 'antigravity', model: 'gemini-4-argon', effort: 'high' })
  // Without a lesson override, lessons follow video creation.
  assert.equal(seriesSelection(mixed, 'make').agent, 'claude')
  const override = { ...mixed, lessonAgent: 'codex', seriesModels: { codex: { make: { model: 'gpt-6.1-terra', effort: 'xhigh' } } } } as Settings
  assert.deepEqual(seriesSelection(override, 'make'), { agent: 'codex', model: 'gpt-6.1-terra', effort: 'xhigh' })
})
