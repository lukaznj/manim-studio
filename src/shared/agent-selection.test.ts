import test from 'node:test'
import assert from 'node:assert/strict'
import { seriesAgentSelection, seriesSelection, switchSeriesSelection } from './agent-selection.ts'
import type { AgentSelection, EpisodeRun, SeriesRun } from './types.ts'

test('episode assignments survive reorder and serialization, independently of current Settings', () => {
  const assignments: AgentSelection[] = [
    { agent: 'claude', model: 'sonnet', effort: 'high' },
    { agent: 'codex', model: 'sol', effort: 'medium' },
    { agent: 'antigravity', model: 'gemini', effort: 'low' },
  ]
  const episodes = assignments.map((assignment, i) => ({ dir: String(i), title: String(i), state: 'waiting', warnings: [], assignment }))
  const resumed = JSON.parse(JSON.stringify([episodes[2], episodes[0], episodes[1]])) as EpisodeRun[]
  const changedDefault: AgentSelection = { agent: 'claude', model: 'different' }
  for (const ep of resumed) assert.deepEqual(seriesAgentSelection({}, ep, changedDefault), assignments[Number(ep.dir)])
})

test('a normal series keeps its captured provider and model after Settings changes', () => {
  assert.deepEqual(seriesAgentSelection({ agent: 'codex', model: 'sol', effort: 'high' }, {}, { agent: 'claude', model: 'opus', effort: 'low' }), {
    agent: 'codex',
    model: 'sol',
    effort: 'high',
  })
})

const creation = {
  agent: 'claude' as const, claudeModel: 'haiku', claudeEffort: 'low' as const,
  codexModel: 'sol', codexEffort: 'medium' as const, antigravityModel: '', antigravityEffort: 'medium' as const,
}

test('episodes inherit the creation model and effort while planning stays independent', () => {
  assert.deepEqual(seriesSelection(creation, 'plan'), { agent: 'claude', model: 'opus', effort: 'high' })
  assert.deepEqual(seriesSelection(creation, 'make'), { agent: 'claude', model: 'haiku', effort: 'low' })
  assert.deepEqual(seriesSelection(creation, 'make', 'codex'), { agent: 'codex', model: 'sol', effort: 'medium' })
  assert.equal(seriesSelection(creation, 'plan', 'codex').model, 'gpt-6-astra')
  assert.equal(seriesSelection(creation, 'make', 'antigravity').effort, 'medium')
})

test('saved episode overrides remain explicit until removed; removing one restores inheritance', () => {
  const saved = { ...creation, seriesModels: { claude: { make: { model: 'sonnet', effort: 'medium' as const } } } }
  assert.deepEqual(seriesSelection(saved, 'make'), { agent: 'claude', model: 'sonnet', effort: 'medium' })
  assert.equal(seriesSelection(saved, 'plan').model, 'opus')
  assert.deepEqual(seriesSelection({ ...saved, seriesModels: { claude: { make: undefined } } }, 'make'), { agent: 'claude', model: 'haiku', effort: 'low' })
})

test('explicit takeover reroutes waiting comparison episodes and persists the chosen sign-in without rewriting completed work', () => {
  const original: AgentSelection = { agent: 'claude', model: 'sonnet', effort: 'high' }
  const run: SeriesRun = {
    title: 'Comparison', folder: '/test', agents: 1, state: 'working', agent: 'claude',
    episodes: ['done', 'export', 'scene', 'waiting'].map((state, i) => ({
      dir: String(i), title: String(i), state: state as EpisodeRun['state'], assignment: { ...original }, warnings: [],
      ...(state === 'scene' ? { limitedUntil: Date.now() + 60000 } : {}),
    })),
  }
  const maker: AgentSelection = { agent: 'codex', model: 'gpt-6.1-sol', effort: 'high' }
  switchSeriesSelection(run, { agent: 'codex', auth: 'api-key' }, maker)
  const restored = JSON.parse(JSON.stringify(run)) as SeriesRun
  for (const ep of restored.episodes.slice(0, 2)) assert.deepEqual(ep.assignment, original)
  for (const ep of restored.episodes.slice(2)) {
    assert.deepEqual(seriesAgentSelection(restored, ep, original), maker)
    assert.equal(ep.assignmentAuth, 'api-key')
  }
  assert.equal(restored.auth, 'api-key')
  assert.equal(restored.agent, 'codex')
  // Same-provider account → API key takeovers must also release the waiting turn.
  switchSeriesSelection(run, { agent: 'codex', auth: 'account' }, maker)
  assert.equal(run.episodes[2].assignmentAuth, 'account')
})
