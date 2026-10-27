import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validStudySelection } from './study-navigation.ts'
import type { WatchSeries, ExerciseSet } from './types'

const course = { episodes: [{ dir: '/course/lesson-1', followUps: [{ dir: '/course/extras/deeper' }] }, { dir: '/course/lesson-2', followUps: [] }], production: {} } as WatchSeries
const exercises = { items: [{ dir: '/course/exercises/one' }] } as ExerciseSet

test('course reopening retains lessons, additional videos, exercises and the production view', () => {
  for (const dir of ['/course/lesson-2', '/course/extras/deeper', '/course/exercises/one']) assert.deepEqual(validStudySelection(course, exercises, { dir }), { dir })
  assert.deepEqual(validStudySelection(course, exercises, { production: true }), { production: true })
})
test('removed, unrelated or malformed remembered views fall back safely', () => {
  for (const value of [null, 'bad', { dir: '/other/lesson' }, { dir: '/course/removed' }, { dir: 42 }]) assert.equal(validStudySelection(course, exercises, value), null)
  assert.equal(validStudySelection({ ...course, production: undefined }, null, { production: true }), null)
})
