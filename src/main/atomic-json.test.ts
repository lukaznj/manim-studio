import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readAtomicJson, writeAtomicJson } from './atomic-json.ts'

test('checkpoints retain a usable previous version after truncated writes and a repair', () => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-checkpoint-'))
  const file = join(dir, 'run.json')
  const valid = (value: unknown): value is { step: string } => typeof (value as { step?: string })?.step === 'string'
  try {
    writeAtomicJson(file, { step: 'script' })
    writeAtomicJson(file, { step: 'scene' })
    writeFileSync(file, '{"step":')
    assert.deepEqual(readAtomicJson(file, valid), { step: 'script' })
    writeAtomicJson(file, { step: 'check' })
    assert.deepEqual(readAtomicJson(file, valid), { step: 'check' })
    assert.deepEqual(JSON.parse(readFileSync(`${file}.bak`, 'utf8')), { step: 'script' })
    // An interrupted replacement never replaces the committed file with its unfinished temp file.
    writeFileSync(`${file}.interrupted.tmp`, '{')
    assert.deepEqual(readAtomicJson(file, valid), { step: 'check' })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('valid JSON with an invalid checkpoint schema falls back; missing files are harmless', () => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-checkpoint-'))
  const file = join(dir, 'run.json')
  const valid = (value: unknown): value is string[] => Array.isArray(value)
  try {
    assert.equal(readAtomicJson(file, valid), null)
    writeAtomicJson(file, ['saved'])
    writeAtomicJson(file, {})
    assert.deepEqual(readAtomicJson(file, valid), ['saved'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
