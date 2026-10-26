import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loginFailureDetails, redactLoginLog } from './login-diagnostics.ts'

test('Python startup failures preserve their traceback and final cause', () => {
  const result = loginFailureDetails(new Error('Python exited with code 1'), 'Traceback (most recent call last):\n  File "agy_login.py", line 92\nOSError: [Errno 24] Too many open files')
  assert.match(result, /Python exited with code 1/)
  assert.match(result, /OSError: \[Errno 24\] Too many open files/)
})

test('sign-in logs remove URLs, account identities and credential values', () => {
  const secrets = ['test@example.com', 'private-code', 'private-refresh', 'private-bearer', 'ya29.private-token', 'AIzaPrivateKey']
  const result = redactLoginLog(`https://accounts.google.com/auth?code=private-code\n${secrets[0]}\nauthorization_code=private-code\nrefresh_token=private-refresh\nBearer private-bearer\nya29.private-token\nAIzaPrivateKey`)
  for (const secret of secrets) assert.ok(!result.includes(secret), secret)
  assert.match(result, /\[URL omitted\]/)
  assert.ok(redactLoginLog('a'.repeat(20000)).length <= 12000)
  assert.ok(!redactLoginLog('{"refresh_token":"quoted-private-value"}').includes('quoted-private-value'))
})
