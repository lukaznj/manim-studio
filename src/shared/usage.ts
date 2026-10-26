// What making a video cost: one entry per agent turn, kept per project in .studio/usage.json
// (src/main/usage.ts). The SDK reports per-model totals that add up over a session, and a resumed
// session starts from its saved total, so an entry is the difference from the session's last one.

export interface ModelTokens {
  input: number
  output: number // thinking included
  cacheRead: number
  cacheWrite: number
  costUSD: number // what these tokens cost on the API; on a Claude plan they count against its limits
}

export interface UsageEntry {
  auth?: 'account' | 'api-key' // recorded at execution; missing on older entries, never inferred as API billing
  provider?: 'claude' | 'codex' | 'antigravity'
  providerUsage?: Record<string, number> // original CLI counters; no invented category semantics
  costKnown?: boolean // false: this provider did not report an API price
  at: number
  step: string // "Script", "Video", "Fixing the render", "Chat", "Planning the series"…
  session?: string
  models: Record<string, ModelTokens> // this turn's own use, by model id
  tools: Record<string, number> // tool calls in the turn, by name
  ms: number
  cumulative?: Record<string, ModelTokens> // the session's running totals after this turn
}

const ZERO: ModelTokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUSD: 0 }
const KEYS = Object.keys(ZERO) as (keyof ModelTokens)[]

/** The SDK's ModelUsage in our terms. */
export function tokensFrom(u: {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  costUSD: number
}): ModelTokens {
  return { input: u.inputTokens, output: u.outputTokens, cacheRead: u.cacheReadInputTokens, cacheWrite: u.cacheCreationInputTokens, costUSD: u.costUSD }
}

/**
 * This turn's use: the running totals minus the session's previous ones. A total that went down
 * (a resumed session that didn't keep its totals) counts from zero again.
 */
export function usageDelta(prev: Record<string, ModelTokens>, now: Record<string, ModelTokens>): Record<string, ModelTokens> {
  const out: Record<string, ModelTokens> = {}
  for (const [model, n] of Object.entries(now)) {
    const p = prev[model] ?? ZERO
    const reset = KEYS.some((k) => n[k] < p[k])
    const d = Object.fromEntries(KEYS.map((k) => [k, reset ? n[k] : n[k] - p[k]])) as unknown as ModelTokens
    if (KEYS.some((k) => d[k] > 0)) out[model] = d
  }
  return out
}

/** All of the entries' use added up, by model. */
export function usageTotals(entries: UsageEntry[]): Record<string, ModelTokens> {
  const out: Record<string, ModelTokens> = {}
  for (const e of entries)
    for (const [model, n] of Object.entries(e.models)) {
      const t = (out[model] ??= { ...ZERO })
      for (const k of KEYS) t[k] += n[k]
    }
  return out
}

export const costOf = (models: Record<string, ModelTokens>): number => Object.values(models).reduce((s, n) => s + n.costUSD, 0)

/** API estimates are relevant only when every recorded turn used a key and reported pricing. */
export const apiEstimateOf = (entries: UsageEntry[]): number | null => entries.length && entries.every((entry) => entry.auth === 'api-key' && entry.costKnown !== false)
  ? entries.reduce((total, entry) => total + costOf(entry.models), 0) : null

/** "claude-sonnet-5-5" → "Sonnet 5.5"; "claude-opus-5-5-20261001" → "Opus 5.5". */
export function modelName(id: string): string {
  const m = /claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?/.exec(id)
  if (!m) return id
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}`
}
