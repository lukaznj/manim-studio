import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { freeName } from './file-name.ts'

// Paths use the system's separator, so the expected ones are joined too (Windows CI).
const at = (name: string) => join('/out', name)

test('a saved copy is named after the video, safely and without overwriting', () => {
  const taken = new Set([at('Kvadratne jednadžbe.mp4'), at('Kvadratne jednadžbe (2).mp4')])
  assert.equal(freeName('/out', 'Kvadratne jednadžbe', '.mp4', (p) => taken.has(p)), at('Kvadratne jednadžbe (3).mp4'))
  assert.equal(freeName('/out', 'a/b: c?*', '.mp4', () => false), at('a b c.mp4'))
  assert.equal(freeName('/out', 'Trailing dots...', '.mp4', () => false), at('Trailing dots.mp4'))
  assert.equal(freeName('/out', '   ', '.mp4', () => false), at('Video.mp4'))
})
