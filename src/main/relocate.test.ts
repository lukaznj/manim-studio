import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { movedSeriesFolder, relocate } from './relocate.ts'

const project = (dir: string, meta: object = { name: 'x' }) => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'project.json'), JSON.stringify(meta))
}

test('a located project replaces its old path, and the ones moved with it come back', () => {
  const root = mkdtempSync(join(tmpdir(), 'relocate-'))
  const old = join(root, 'old')
  const now = join(root, 'new')
  project(join(now, 'a'))
  project(join(now, 'b'))
  project(join(now, 'series', '01-c'))
  project(join(root, 'kept'))
  const recent = [join(old, 'a'), join(root, 'kept'), join(old, 'b'), join(old, 'series', '01-c'), join(old, 'gone')]
  const { recent: out, moved } = relocate(recent, join(old, 'a'), join(now, 'a'))
  assert.deepEqual(out, [join(now, 'a'), join(root, 'kept'), join(now, 'b'), join(now, 'series', '01-c'), join(old, 'gone')])
  assert.equal(moved.length, 3)
})

test('an episode found again brings its siblings along, and a path already listed is not doubled', () => {
  const root = mkdtempSync(join(tmpdir(), 'relocate-'))
  project(join(root, 'new', 's', '01-a'))
  project(join(root, 'new', 's', '02-b'))
  const recent = [join(root, 'old', 's', '01-a'), join(root, 'old', 's', '02-b'), join(root, 'new', 's', '01-a')]
  const { recent: out, moved } = relocate(recent, recent[0], join(root, 'new', 's', '01-a'))
  assert.deepEqual(out, [join(root, 'new', 's', '01-a'), join(root, 'new', 's', '02-b')])
  assert.equal(moved.length, 2)
})

test('an episode follows its series folder when the stored one is gone', () => {
  const root = mkdtempSync(join(tmpdir(), 'relocate-'))
  const series = join(root, 'new', 's')
  project(join(series, '01-a'), { name: 'a', series: { folder: join(root, 'old', 's') } })
  assert.equal(movedSeriesFolder(join(series, '01-a')), null) // no series.json next to it
  writeFileSync(join(series, 'series.json'), '{}')
  assert.equal(movedSeriesFolder(join(series, '01-a')), series)
  writeFileSync(join(series, '01-a', 'project.json'), JSON.stringify({ series: { folder: series } }))
  assert.equal(movedSeriesFolder(join(series, '01-a')), null)
})
