import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { studyPath, studyCourseRoot } from './study-paths.ts'
import { archiveStudySources } from './study-source-archive.ts'
import type { ProjectMeta } from '../shared/types.ts'

test('course scope admits its lessons and extras and refuses another project or an escaping symlink', () => {
  const root = mkdtempSync(join(tmpdir(), 'studio-study-scope-'))
  try {
    const course = join(root, 'course'), lesson = join(course, 'one'), extra = join(course, 'extras', 'more'), outside = join(root, 'other')
    for (const dir of [lesson, extra, outside]) mkdirSync(dir, { recursive: true })
    writeFileSync(join(course, 'series.json'), JSON.stringify({ episodes: ['one', '../other'] }))
    const meta = { series: { folder: course } } as ProjectMeta
    assert.equal(studyCourseRoot(lesson, meta), course)
    assert.equal(studyCourseRoot(extra, { ...meta, extra: { of: 'one', at: 0, request: '' } }), course)
    assert.equal(studyCourseRoot(outside, meta), null)
    assert.equal(studyPath(course, '..', 'other'), null)
    symlinkSync(outside, join(course, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
    assert.equal(studyPath(course, 'escape'), null)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('the shared archive preserves full inputs, including unassigned and colliding names, and is restart-safe', () => {
  const root = mkdtempSync(join(tmpdir(), 'studio-study-archive-'))
  try {
    const input = join(root, 'inputs'), course = join(root, 'course')
    mkdirSync(input)
    const a = join(input, 'Notes!.pdf'), b = join(input, 'Notes?.pdf'), c = join(input, 'Unused.pdf')
    for (const [file, body] of [[a, 'Full original A'], [b, 'Full original B'], [c, 'Original not assigned to any episode']]) writeFileSync(file, body)
    const result = archiveStudySources(course, [a, b, c])
    assert.equal(new Set(result.map((item) => item.name)).size, 3)
    assert.deepEqual(archiveStudySources(course, [a, b, c]), result)
    assert.ok(result.some((item) => item.original === 'Unused.pdf'))
  } finally { rmSync(root, { recursive: true, force: true }) }
})
