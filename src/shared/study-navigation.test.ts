import assert from 'node:assert/strict'
import { test } from 'node:test'
import { studyLibraryNeeded, validStudySelection } from './study-navigation.ts'
import type { WatchSeries, ExerciseSet } from './types'

const course = { episodes: [{ dir: '/course/lesson-1', followUps: [{ dir: '/course/extras/deeper' }] }, { dir: '/course/lesson-2', followUps: [] }], production: {} } as WatchSeries
const exercises = { items: [{ dir: '/course/exercises/one' }] } as ExerciseSet

test('standalone video navigation appears as soon as related content is requested', () => {
  const video = { folder: '/video', title: 'Video', episodes: [{ dir: '/video', number: 1, title: 'Video', followUps: [] }] } as WatchSeries
  assert.equal(studyLibraryNeeded(video, null), false)
  for (const state of ['making', 'done', 'failed'] as const)
    assert.equal(studyLibraryNeeded({ ...video, episodes: [{ ...video.episodes[0], followUps: [{ dir: '/video/extra', title: 'More', at: 10, request: 'Explain', state }] }] }, null), true)
  assert.equal(studyLibraryNeeded({ ...video, exercises: '/video/exercises' }, null), true)
  assert.equal(studyLibraryNeeded(video, { items: [], intake: { state: 'reading', files: 1 } } as unknown as ExerciseSet), true)
  assert.equal(studyLibraryNeeded({ ...video, folder: '/one-lesson-course' }, null), true)
  assert.equal(studyLibraryNeeded(course, exercises), true)
  assert.equal(studyLibraryNeeded(null, exercises), true)
})

test('course reopening retains lessons, additional videos, exercises and the production view', () => {
  for (const dir of ['/course/lesson-2', '/course/extras/deeper', '/course/exercises/one']) assert.deepEqual(validStudySelection(course, exercises, { dir }), { dir })
  assert.deepEqual(validStudySelection(course, exercises, { production: true }), { production: true })
})
test('removed, unrelated or malformed remembered views fall back safely', () => {
  for (const value of [null, 'bad', { dir: '/other/lesson' }, { dir: '/course/removed' }, { dir: 42 }]) assert.equal(validStudySelection(course, exercises, value), null)
  assert.equal(validStudySelection({ ...course, production: undefined }, null, { production: true }), null)
})
