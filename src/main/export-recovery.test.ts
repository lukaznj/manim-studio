import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeAtomicJson } from './atomic-json.ts'
import { completedExport } from './export-recovery.ts'

test('recover a completed silent video with empty subtitles, but retry missing or incomplete media', () => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-export-recovery-'))
  const video = join(dir, 'video.mp4'), subtitles = join(dir, 'video.srt')
  const result = { folder: dir, files: [video, subtitles], warnings: [] }
  try {
    writeFileSync(video, 'finished movie')
    writeFileSync(subtitles, '') // valid when the video has no narration
    writeAtomicJson(join(dir, '.studio', 'completed-exports', 'job.json'), result)
    assert.deepEqual(completedExport(dir, 'job'), result)
    assert.equal(completedExport(dir, '../../elsewhere'), null)
    writeFileSync(video, '')
    assert.equal(completedExport(dir, 'job'), null)
    rmSync(video)
    assert.equal(completedExport(dir, 'job'), null)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
