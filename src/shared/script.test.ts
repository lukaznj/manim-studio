import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scriptBody, scriptBrief, scriptStatus, withScriptStatus } from './script.ts'

test('a script is a draft until its front matter says approved', () => {
  const draft = '---\nstatus: draft\n---\n# Title\n'
  assert.equal(scriptStatus(draft), 'draft')
  assert.equal(scriptStatus('# No front matter'), 'draft')
  const approved = withScriptStatus(draft, 'approved')
  assert.equal(scriptStatus(approved), 'approved')
  assert.equal(scriptBody(approved), '# Title\n')
})

test('setting the status keeps other front matter and adds it when missing', () => {
  const other = withScriptStatus('---\nseries: linear-algebra\n---\nBody', 'approved')
  assert.match(other, /series: linear-algebra/)
  assert.equal(scriptStatus(other), 'approved')
  assert.equal(scriptStatus(withScriptStatus('Just text', 'approved')), 'approved')
  assert.equal(scriptBody(withScriptStatus('Just text', 'approved')), '\nJust text')
})

test('every generation workflow includes scripting before scene implementation', () => {
  for (const options of [{}, { auto: true }, { desktop: true }]) {
    const brief = scriptBrief(options)
    assert.match(brief, /Always plan the video in words before writing code/)
    assert.match(brief, /Write script\.md/)
    assert.match(brief, /Once it is approved, write scene\.py from it/)
    assert.doesNotMatch(brief, /skip the script/)
  }
})

test('manual scripts wait for approval while automated runs review their own', () => {
  assert.match(scriptBrief(), /Then stop:.*wait/)
  assert.match(scriptBrief({ auto: true }), /Review it yourself/)
  assert.match(scriptBrief({ desktop: true }), /with write_script/)
})
