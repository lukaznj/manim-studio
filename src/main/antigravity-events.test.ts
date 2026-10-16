import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { ChatPart } from '../shared/types'
import { agyFollower, toolPart, type AgyEvent } from './antigravity-events.ts'

// Real runs of agy 1.3.6 (paths replaced): Studio's tools through the MCP bridge, and a refused write.
const events = (name: string) =>
  readFileSync(join(import.meta.dirname, 'fixtures', `agy-${name}.ndjson`), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as AgyEvent)

function play(name: string) {
  const parts: ChatPart[] = []
  const statuses: [string, string][] = []
  const conversations: string[] = []
  const feed = agyFollower({ part: (p) => parts.push(p), status: (id, s) => statuses.push([id, s]), conversation: (id) => conversations.push(id) })
  let outcome = null
  for (const e of events(name)) outcome = feed(e) ?? outcome
  return { parts, statuses, conversations, outcome }
}

test('Studio’s tools, the CLI’s own and the agent’s text become chat parts', () => {
  const { parts, statuses, conversations, outcome } = play('mcp')
  const tools = parts.filter((p) => p.kind === 'tool').map((p) => p.kind === 'tool' && [p.name, p.summary])
  assert.deepEqual(tools, [
    ['Read', 'Reading render_preview.json'],
    ['Read', 'Reading calculate.json'],
    ['mcp__studio__render_preview', 'Rendering the preview'],
    ['mcp__studio__calculate', 'Checking a calculation'],
  ])
  assert.ok(statuses.every(([, s]) => s === 'ok') && statuses.length === 4)
  const text = parts.filter((p) => p.kind === 'text')
  assert.equal(text.length, 1) // the deltas joined into one reply
  assert.match(text[0].kind === 'text' ? text[0].text : '', /^Here are the results[\s\S]*42/)
  assert.equal(conversations.length, 1) // reported once, for resuming
  assert.equal(outcome?.ok, true)
  assert.equal(outcome?.result.usage?.total_tokens, 42438)
})

test('a refused tool fails the turn and says why', () => {
  const { statuses, outcome } = play('outside-write')
  assert.deepEqual(
    statuses.map(([, s]) => s),
    ['error'],
  )
  assert.equal(outcome?.ok, false)
  assert.match(outcome?.error ?? '', /doesn’t allow writing \/elsewhere\/outside\.txt/)
})

test('an error result fails the turn with the CLI’s message', () => {
  const feed = agyFollower({ part: () => {}, status: () => {}, conversation: () => {} })
  const out = feed({ event: 'result', result: { conversation_id: '', status: 'ERROR', response: '', error: 'authentication failed or timed out' } })
  assert.deepEqual([out?.ok, out?.error], [false, 'authentication failed or timed out'])
})

test('edits and shell commands are named by what they do', () => {
  assert.deepEqual(toolPart('1', { name: 'replace_file_content', parameters: { TargetFile: '/p/scene.py' } }, 'running'), {
    kind: 'tool',
    id: '1',
    name: 'Edit',
    summary: 'Editing scene.py',
    status: 'running',
  })
  const shell = toolPart('2', { name: 'run_command', parameters: { CommandLine: 'echo hi' } }, 'error')
  assert.equal(shell.kind === 'tool' && shell.summary, 'Running echo hi')
})
