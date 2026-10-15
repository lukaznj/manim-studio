// Each agent turn's tokens and cost, kept in the project's .studio/usage.json (src/shared/usage.ts).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SDKResultMessage } from '@anthropic-ai/claude-agent-sdk'
import { tokensFrom, usageDelta, type ModelTokens, type UsageEntry } from '../shared/usage'

const file = (dir: string) => join(dir, '.studio', 'usage.json')

export function readUsage(dir: string): UsageEntry[] {
  try {
    return existsSync(file(dir)) ? (JSON.parse(readFileSync(file(dir), 'utf8')) as UsageEntry[]) : []
  } catch {
    return []
  }
}

/** A turn's entry from its result message; `prev` is the session's running totals before it. */
export function entryFrom(step: string, result: SDKResultMessage, prev: Record<string, ModelTokens>, tools: Record<string, number>, ms: number): UsageEntry {
  const cumulative: Record<string, ModelTokens> = {}
  for (const [model, u] of Object.entries(result.modelUsage ?? {})) cumulative[model] = tokensFrom(u)
  return { at: Date.now(), step, session: result.session_id, models: usageDelta(prev, cumulative), tools, ms, cumulative }
}

/** Records a turn from its result message; returns the entry (this turn's own use). */
export function recordTurn(dir: string, step: string, result: SDKResultMessage, tools: Record<string, number>, ms: number): UsageEntry {
  const prev = readUsage(dir).findLast((e) => e.session === result.session_id)?.cumulative ?? {}
  const entry = entryFrom(step, result, prev, tools, ms)
  appendUsage(dir, entry)
  return entry
}

/** Adds an entry to the project's log (also one made elsewhere: series planning, before the series folder existed). */
export function appendUsage(dir: string, entry: UsageEntry): void {
  mkdirSync(join(dir, '.studio'), { recursive: true })
  writeFileSync(file(dir), JSON.stringify([...readUsage(dir), entry]))
}
