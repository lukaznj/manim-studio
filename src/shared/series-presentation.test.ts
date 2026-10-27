import assert from 'node:assert/strict'
import { test } from 'node:test'
import { episodePresentation, lessonIsBuilding, productionVisible } from './series-presentation.ts'
import type { EpisodeRun, ExportJob, SeriesRun } from './types.ts'

const episode: EpisodeRun = { dir: '/course/1', title: 'Lesson', state: 'scene', warnings: [] }
const run: SeriesRun = { folder: '/course', title: 'Course', state: 'working', agents: 2, episodes: [episode] }

test('every unfinished series episode uses production even if a preview or partial export exists', () => {
  for (const state of ['waiting', 'script', 'scripted', 'scene', 'check', 'export', 'failed', 'stopped'] as EpisodeRun['state'][])
    assert.equal(lessonIsBuilding({ ...episode, state }), true)
  assert.equal(lessonIsBuilding({ ...episode, state: 'done' }, 'making'), false)
  assert.equal(lessonIsBuilding(undefined, 'making'), true)
  assert.equal(lessonIsBuilding(undefined, 'failed'), true)
  assert.equal(lessonIsBuilding(undefined, undefined), false)
})

test('pauses and stops affect all unfinished stages, including exports and queued scripts', () => {
  for (const state of ['waiting', 'script', 'scripted', 'scene', 'check', 'export'] as EpisodeRun['state'][]) {
    assert.equal(episodePresentation({ ...run, state: 'paused' }, { ...episode, state }).held, true)
    assert.equal(episodePresentation({ ...run, state: 'stopped' }, { ...episode, state }).active, false)
  }
  assert.equal(episodePresentation(run, { ...episode, held: true }).active, false)
  assert.equal(episodePresentation({ ...run, state: 'paused' }, { ...episode, state: 'done' }).held, false)
})

test('export progress describes its real phase and never fabricates a percentage for an agent', () => {
  const job = { phase: 'assembling', percent: .42 } as ExportJob
  assert.equal(episodePresentation(run, episode, job).percent, undefined)
  assert.deepEqual(
    { label: episodePresentation(run, { ...episode, state: 'export' }, job).label, percent: episodePresentation(run, { ...episode, state: 'export' }, job).percent },
    { label: 'Assembling', percent: 42 },
  )
  assert.equal(episodePresentation(run, { ...episode, state: 'export' }, { ...job, percent: 2 }).percent, 100)
})

test('a failed render check stays at the check stage; completed lessons have all stages complete', () => {
  assert.equal(episodePresentation(run, { ...episode, state: 'failed', failedAt: 'check' }).stage, 2)
  assert.equal(episodePresentation(run, { ...episode, state: 'failed', failedAt: 'export' }).stage, 3)
  assert.equal(episodePresentation(run, { ...episode, state: 'done' }).stage, 4)
})

test('remote exports keep their true running state when the series agents are paused', () => {
  const remote = { state: 'running', options: { server: 'worker' }, phase: 'rendering', percent: .5 } as ExportJob
  const view = episodePresentation({ ...run, state: 'paused' }, { ...episode, state: 'export' }, remote)
  assert.equal(view.held, false)
  assert.equal(view.active, true)
  assert.equal(view.percent, 50)
  assert.equal(view.label, 'Rendering')
})


test('finished successful courses hide production for viewers but preserve failures and developer history', () => {
  const complete = { ...run, state: 'done' as const, episodes: [{ ...episode, state: 'done' as const }] }
  assert.equal(productionVisible(complete), false)
  assert.equal(productionVisible(complete, true), true)
  assert.equal(productionVisible({ ...complete, episodes: [{ ...episode, state: 'failed' }] }), true)
  assert.equal(productionVisible({ ...complete, state: 'working' }), true)
  assert.equal(productionVisible({ ...complete, state: 'stopped', episodes: [episode] }), true)
})
