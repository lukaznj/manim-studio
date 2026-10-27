import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { dependencyFailure, envFilesReady, latexFilesReady, managedPython, usableExecutable } from './dependency-health.ts'

const file = (path: string, body = 'fixture executable') => { mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, body); chmodSync(path, 0o755) }

test('a surviving environment directory does not hide an uninstalled, empty or non-executable Python', () => {
  const root = mkdtempSync(join(tmpdir(), 'studio-env-health-'))
  try {
    assert.equal(envFilesReady(root), false)
    file(managedPython(root)); assert.equal(envFilesReady(root), true)
    writeFileSync(managedPython(root), ''); assert.equal(envFilesReady(root), false)
    file(managedPython(root)); chmodSync(managedPython(root), 0o644)
    if (process.platform !== 'win32') assert.equal(usableExecutable(managedPython(root)), false)
    file(join(root, 'python.exe')); assert.equal(envFilesReady(root, 'win32'), true)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('TinyTeX needs real programs and essential packages even when its old ready marker survives', () => {
  const root = mkdtempSync(join(tmpdir(), 'studio-latex-health-')), suffix = process.platform === 'win32' ? '.exe' : ''
  try {
    file(join(root, '.manim-studio-ready'))
    assert.equal(latexFilesReady(root), false)
    for (const name of ['latex', 'dvisvgm', 'kpsewhich']) file(join(root, 'bin', 'platform', name + suffix))
    assert.equal(latexFilesReady(root), false)
    for (const name of ['standalone/standalone.cls', 'preview/preview.sty', 'amsmath/amsmath.sty', 'xcolor/xcolor.sty']) file(join(root, 'texmf-dist', 'tex', 'latex', name))
    assert.equal(latexFilesReady(root), true)
    rmSync(join(root, 'bin', 'platform', 'dvisvgm' + suffix))
    assert.equal(latexFilesReady(root), false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('runtime dependency failures offer repair while scene bugs and invalid LaTeX remain ordinary errors', () => {
  assert.equal(dependencyFailure("ModuleNotFoundError: No module named 'manim'", 'default'), 'env')
  assert.equal(dependencyFailure("ModuleNotFoundError: No module named 'faster_whisper'", 'transcribe'), 'transcribe')
  assert.equal(dependencyFailure("ModuleNotFoundError: No module named 'torch'", 'omnivoice'), 'omnivoice')
  assert.equal(dependencyFailure("FileNotFoundError: [Errno 2] No such file or directory: 'latex'", 'default'), 'latex')
  assert.equal(dependencyFailure("FileNotFoundError: [Errno 2] No such file or directory: 'ffmpeg'", 'default'), 'env')
  assert.equal(dependencyFailure("! LaTeX Error: File `standalone.cls' not found.", 'default'), 'latex')
  for (const log of ["ModuleNotFoundError: No module named 'my_scene_helper'", '! Undefined control sequence. \\invalidcommand', 'NameError: name x is not defined', 'Python exited with code 1']) assert.equal(dependencyFailure(log, 'default'), null)
})
