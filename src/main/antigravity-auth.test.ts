import test from 'node:test'
import assert from 'node:assert/strict'
import { googleSignInSaved, macGoogleCredentialArgs } from './antigravity-auth.ts'

test('macOS sign-in checks the CLI service/account identity without reading credentials', () => {
  const args = macGoogleCredentialArgs('find')
  assert.equal(args[0], 'find-generic-password')
  // Verified against the managed CLI's native Keychain entry; its displayed label is not its service.
  assert.equal(args[args.indexOf('-s') + 1], 'gemini')
  assert.equal(args[args.indexOf('-a') + 1], 'antigravity')
  assert.equal(args.includes('-w'), false)
  assert.equal(args.includes('-g'), false)
})

test('sign-out targets the same precise item, preserving other Gemini accounts', () => {
  const find = macGoogleCredentialArgs('find'), remove = macGoogleCredentialArgs('delete')
  assert.equal(remove[0], 'delete-generic-password')
  assert.deepEqual(remove.slice(1), find.slice(1))
  assert.ok(remove.includes('-a'))
})

test('a saved sign-in is recognized before startup or when it appears just before a helper failure', async () => {
  let saved = false
  const status = async () => ({ loggedIn: saved })
  assert.equal(await googleSignInSaved(status), false)
  saved = true
  assert.equal(await googleSignInSaved(status), true)
  assert.equal(await googleSignInSaved(async () => { throw new Error('Keychain unavailable') }), false)
})
