import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePairingCode } from './pairing.ts'

test('a pairing code holds the address and the token', () => {
  const code = 'msw1.' + Buffer.from(JSON.stringify({ url: 'http://acer.tail.razem.cc:7400/', token: 'abc_-1' })).toString('base64url')
  assert.deepEqual(parsePairingCode(`  ${code}\n`), { url: 'http://acer.tail.razem.cc:7400', token: 'abc_-1' })
  assert.deepEqual(parsePairingCode('http://10.0.0.5:7400 tok'), { url: 'http://10.0.0.5:7400', token: 'tok' })
  assert.throws(() => parsePairingCode('msw1.%%%'), /incomplete/)
  assert.throws(() => parsePairingCode('hello'), /pairing code/)
})
