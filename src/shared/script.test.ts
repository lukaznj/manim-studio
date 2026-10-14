import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scriptBody, scriptStatus, withScriptStatus } from './script.ts'

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
