import test from 'node:test'
import assert from 'node:assert/strict'
import { seriesAgentSelection } from './agent-selection.ts'
import type { AgentSelection, EpisodeRun } from './types.ts'

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

test('series default to a planner and a maker per agent, at high effort, until Settings say otherwise', async () => {
  const { seriesSelection } = await import('./agent-selection.ts')
  assert.deepEqual(seriesSelection({ agent: 'claude' }, 'plan'), { agent: 'claude', model: 'opus', effort: 'high' })
  assert.deepEqual(seriesSelection({ agent: 'claude' }, 'make'), { agent: 'claude', model: 'sonnet', effort: 'high' })
  assert.equal(seriesSelection({ agent: 'codex' }, 'plan').model, 'gpt-6-astra')
  assert.equal(seriesSelection({ agent: 'antigravity' }, 'make').model, '') // Gemini 4 Argon
  const saved = { agent: 'claude' as const, seriesModels: { claude: { make: { model: 'haiku', effort: 'medium' as const } } } }
  assert.deepEqual(seriesSelection(saved, 'make'), { agent: 'claude', model: 'haiku', effort: 'medium' })
  assert.equal(seriesSelection(saved, 'plan').model, 'opus')
})
