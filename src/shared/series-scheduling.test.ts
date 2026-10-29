import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextSeriesTask } from './series-scheduling.ts'
import type { EpisodeRun } from './types.ts'

const episode = (n: number, state: EpisodeRun['state'] = 'scripted'): EpisodeRun => ({ dir: `/course/${n}`, title: `Lesson ${n}`, state, warnings: [] })

test('every ready video can start even with more than four active agents and a script writer', () => {
  const episodes = [episode(0, 'waiting'), ...Array.from({ length: 12 }, (_, i) => episode(i + 1))]
  const active = new Map<string, 'script' | 'video'>()
  for (let i = 0; i < 13; i++) {
    const next = nextSeriesTask(episodes, active)
    assert.ok(next)
    active.set(next.episode.dir, next.kind)
  }
  assert.equal([...active.values()].filter((kind) => kind === 'script').length, 1)
  assert.equal([...active.values()].filter((kind) => kind === 'video').length, 12)
  assert.equal(nextSeriesTask(episodes, active), null)
})

test('scripts remain ordered and held, exported or completed episodes never start another agent', () => {
  const episodes = [episode(1, 'waiting'), episode(2, 'waiting'), { ...episode(3), held: true }, episode(4, 'export'), episode(5, 'done')]
  const active = new Map<string, 'script' | 'video'>()
  assert.equal(nextSeriesTask(episodes, active)?.episode.dir, '/course/1')
  active.set('/course/1', 'script')
  assert.equal(nextSeriesTask(episodes, active), null)
  active.delete('/course/1')
  episodes[0].state = 'scripted'
  assert.equal(nextSeriesTask(episodes, active)?.episode.dir, '/course/2')
  active.set('/course/2', 'script')
  assert.equal(nextSeriesTask(episodes, active)?.episode.dir, '/course/1')
})

test('queue selection is FIFO, paused courses do not block it, and restoration never starts work', async () => {
  const { nextQueuedSeries } = await import('./series-scheduling.ts')
  const course = (folder: string, state: import('./types.ts').SeriesRun['state'], queuedAt = 0): import('./types.ts').SeriesRun => ({ folder, title: folder, state, queuedAt, episodes: [episode(1)] })
  const runs = [course('/paused', 'paused'), course('/later', 'queued', 20), course('/first', 'queued', 10)]
  assert.equal(nextQueuedSeries(runs, true)?.folder, '/first')
  assert.equal(nextQueuedSeries(runs, false), undefined)
  assert.equal(nextQueuedSeries([...runs, course('/running', 'working')], true), undefined)
  assert.deepEqual(runs.map((run) => run.state), ['paused', 'queued', 'queued'])
})
