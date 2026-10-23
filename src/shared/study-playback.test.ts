import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextStudyEpisode, resumePosition } from './study-playback.ts'

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
