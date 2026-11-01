import test from 'node:test'
import assert from 'node:assert/strict'
import { freeName } from './file-name.ts'

test('a saved copy is named after the video, safely and without overwriting', () => {
  const taken = new Set(['/out/Kvadratne jednadžbe.mp4', '/out/Kvadratne jednadžbe (2).mp4'])
  assert.equal(freeName('/out', 'Kvadratne jednadžbe', '.mp4', (p) => taken.has(p)), '/out/Kvadratne jednadžbe (3).mp4')
  assert.equal(freeName('/out', 'a/b: c?*', '.mp4', () => false), '/out/a b c.mp4')
  assert.equal(freeName('/out', 'Trailing dots...', '.mp4', () => false), '/out/Trailing dots.mp4')
  assert.equal(freeName('/out', '   ', '.mp4', () => false), '/out/Video.mp4')
})
