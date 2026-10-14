import assert from 'node:assert/strict'
import { test } from 'node:test'
import { footprints, processTree } from './memory.ts'

test('the process tree holds only the app and what it started, biggest first', () => {
  const ps = [
    '  1     0   9000 /sbin/launchd',
    ' 50     1 100000 /Applications/Manim Studio.app/Contents/MacOS/Manim Studio',
    ' 70    60 5000000 python -m studio_runner tts-worker', // listed before its parent
    ' 60    50  20000 pixi run python',
    ' 80     1 7000000 /Applications/Other.app/Contents/MacOS/Other',
  ].join('\n')
  const tree = processTree(ps, 50)
  assert.deepEqual(
    tree.map((p) => [p.pid, p.mb]),
    [
      [70, 4883],
      [50, 98],
      [60, 20],
    ],
  )
})

test('footprints read Activity Monitor numbers in any unit', () => {
  const out = [
    'Electron Helper (Renderer) [37326]: 64-bit    Footprint: 120 MB (16384 bytes per page)',
    'python3.12 [70]: 64-bit    Footprint: 5.6 GB (16384 bytes per page)',
    'Electron Helper [37325]: 64-bit    Footprint: 7073 KB (16384 bytes per page)',
    'Summary Footprint: 5.7 GB',
  ].join('\n')
  assert.deepEqual(
    [...footprints(out)],
    [
      [37326, 120],
      [70, 5734],
      [37325, 7],
    ],
  )
})
