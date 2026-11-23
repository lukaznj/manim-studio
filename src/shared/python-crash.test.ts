import test from 'node:test'
import assert from 'node:assert/strict'
import { pythonCrashMessage } from './python-crash.ts'

test('a Python crash names what broke, not just its exit code', () => {
  const log = ['Traceback (most recent call last):', '  File "captions.py", line 54, in tex', '    name = m.group(1)', "AttributeError: 'NoneType' object has no attribute 'group'"]
  assert.equal(pythonCrashMessage(log, 1), "Python stopped: AttributeError: 'NoneType' object has no attribute 'group'")
  assert.equal(pythonCrashMessage(['MemoryError'], 1), 'Python stopped: MemoryError')
  assert.equal(pythonCrashMessage(['some warning', 'Error rendering at 0.5 s'], 1), 'Python exited with code 1')
  assert.equal(pythonCrashMessage([], 137), 'Python exited with code 137')
})
