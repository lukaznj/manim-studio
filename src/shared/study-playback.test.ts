import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextStudyEpisode, readStudyProgress, resumePosition, studyProgressSummary } from './study-playback.ts'

test('sidebar progress validates stored history and distinguishes near completion from an ended video', () => {
  const progress = readStudyProgress('{"position":75.25,"duration":120,"completed":false}')!
  assert.deepEqual(studyProgressSummary(progress), { percent: 75.25 / 120 * 100, remaining: 45 })
  assert.deepEqual(studyProgressSummary({ position: 120, duration: 120, completed: true }), { percent: 100, remaining: 0 })
  assert.deepEqual(studyProgressSummary({ position: 120, duration: 120, completed: false }), { percent: 99, remaining: 0 })
  assert.equal(readStudyProgress('{"position":200,"duration":120}')?.position, 120)
  for (const raw of [null, '{}', '12', '{"position":-1,"duration":10}', '{"position":1,"duration":0}', '{"position":"1","duration":10}', '{"position":1,"duration":1e999}']) assert.equal(readStudyProgress(raw), null)
})

test('resume keeps short and nearly finished positions, and reads old numeric history', () => {
  assert.equal(resumePosition('2.25', 9), 2.25)
  assert.equal(resumePosition(JSON.stringify({ position: 7.75, duration: 9, completed: false }), 9), 7.75)
  assert.equal(resumePosition(JSON.stringify({ position: 9, duration: 9, completed: true }), 9), 0)
  assert.equal(resumePosition('100', 9), 8.95)
  for (const raw of [null, '', 'undefined', 'null', '{}', '"4"', '-1', '{"position":"2"}']) assert.equal(resumePosition(raw, 9), 0)
  assert.equal(resumePosition('4', Infinity), 0)
})

test('autoplay advances only to the immediately following ready episode, without looping', () => {
  const episodes = [
    { dir: 'a', video: 'a.mp4' },
    { dir: 'b', video: 'b.mp4' },
    { dir: 'c', video: 'c.mp4' },
  ]
  assert.equal(nextStudyEpisode(episodes, 'a'), episodes[1])
  assert.equal(nextStudyEpisode(episodes, 'c'), undefined)
  assert.equal(nextStudyEpisode(episodes, 'missing'), undefined)
  for (const next of [{ dir: 'b' }, { dir: 'b', video: 'b.mp4', state: 'making' }, { dir: 'b', video: 'b.mp4', state: 'failed' }]) {
    assert.equal(nextStudyEpisode([episodes[0], next, episodes[2]], 'a'), undefined)
  }
})
