import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isSeriesCheckpoint, recoverSeries } from './series-recovery.ts'
import type { EpisodeRun, SeriesRun } from './types.ts'

const stages: EpisodeRun['state'][] = ['waiting', 'script', 'scripted', 'scene', 'check', 'export', 'done', 'failed', 'stopped']
function run(state: SeriesRun['state'] = 'working'): SeriesRun {
  return { title: 'Course', folder: '/course', state, agents: 3, agent: 'codex', model: 'gpt-6.1-sol', episodes: stages.map((stage, i) => ({
    dir: `/course/${i}`, title: stage, state: stage, warnings: [], tried: true,
    assignment: { agent: 'codex', model: 'gpt-6-astra', effort: 'high' },
    exportJob: stage === 'export' ? 'saved-export' : undefined, activity: 'Working', limitedUntil: 42, held: i === 1,
  })) }
}

test('restart recovers every production stage without rerunning done work or forgetting holds/routes', () => {
  const original = run()
  const recovered = recoverSeries(original)
  assert.equal(recovered.state, 'stopped')
  assert.deepEqual(recovered.episodes.map((ep) => ep.state), stages)
  assert.equal(recovered.episodes[1].held, true)
  assert.equal(recovered.episodes[5].exportJob, 'saved-export')
  assert.equal(recovered.episodes[4].assignment?.model, 'gpt-6-astra')
  assert.ok(recovered.episodes.every((ep) => !ep.activity && !ep.limitedUntil))
  assert.equal(original.state, 'working')
  assert.equal(original.episodes[0].activity, 'Working')
})

test('paused runs require Continue; completed runs remain completed; invalid agent counts are bounded', () => {
  assert.equal(recoverSeries(run('paused')).state, 'stopped')
  assert.equal(recoverSeries(run('done')).state, 'done')
  assert.equal(recoverSeries({ ...run(), agents: -1 }).agents, 1)
})

test('corrupt run files cannot masquerade as a resumable series', () => {
  const checkpoint = { run: run(), exportOptions: { themes: [], languages: [], languageVideos: false } }
  assert.equal(isSeriesCheckpoint(checkpoint), true)
  for (const value of [null, {}, { run: run() }, { ...checkpoint, run: { ...run(), episodes: [{}] } }, { ...checkpoint, run: { ...run(), state: 'unknown' } }])
    assert.equal(isSeriesCheckpoint(value), false)
})
