import type { AgentSelection, AgentRoute, Effort, ModelRoute, PlanUsage } from './types'

export const modelFamily = ({ agent, model }: AgentSelection): string => {
  if (agent === 'claude') return /opus/i.test(model) ? 'opus' : /haiku/i.test(model) ? 'haiku' : 'sonnet'
  return model
}
export const modelRouteKey = (route: ModelRoute): string => `${route.agent}:${route.auth}:${route.model}`
export const accountRouteKey = (route: AgentRoute): string => `${route.agent}:${route.auth}`

export function normalizeModelOrder(value: unknown): ModelRoute[] {
  if (!Array.isArray(value)) return []
  const out: ModelRoute[] = []
  for (const item of value.slice(0, 24)) {
    const route = item as ModelRoute | null
    if (!route || !['claude', 'codex', 'antigravity'].includes(route.agent) || !['account', 'api-key'].includes(route.auth)
      || typeof route.model !== 'string' || route.model.length > 200 || /[\r\n\0]/.test(route.model)
      || (route.agent === 'codex' && !['gpt-6-astra', 'gpt-6.1-sol'].includes(route.model))) continue
    const model = route.agent === 'claude' ? !route.model || route.model === 'sonnet' ? 'claude-sonnet-5-5' : route.model === 'opus' ? 'claude-opus-5-5' : route.model === 'haiku' ? 'claude-haiku-5-5' : route.model : route.model || 'gemini-4-argon'
    const effort = ['low', 'medium', 'high', 'xhigh', 'max'].includes(route.effort ?? '') ? route.effort : 'high' as Effort
    const normalized = { agent: route.agent, auth: route.auth, model, effort }
    if (!out.some((existing) => modelRouteKey(existing) === modelRouteKey(normalized))) out.push(normalized)
  }
  return out
}

/** Rejected allowances are shared by jobs; a concurrent success must not erase a known limit. */
export class ModelLimitPools {
  private blocked = new Map<string, number>()
  constructor(saved: { key: string; until: number }[] = []) {
    for (const entry of saved) if (entry && typeof entry.key === 'string' && Number.isFinite(entry.until)) this.blocked.set(entry.key, entry.until)
  }
  reject(route: ModelRoute, until: number, kind?: string, now = Date.now()): void {
    const family = route.agent === 'claude' && /(?:seven_day_|model_)(opus|sonnet|haiku)/.exec(kind ?? '')?.[1]
    const key = family ? `model:${accountRouteKey(route)}:${family}` : `account:${accountRouteKey(route)}`
    this.blocked.set(key, Math.max(this.blocked.get(key) ?? 0, until > now ? until : now + 30 * 60_000))
  }
  until(route: ModelRoute, now = Date.now()): number {
    return Math.max(0, ...[`account:${accountRouteKey(route)}`, `model:${accountRouteKey(route)}:${modelFamily(route)}`].map((key) => {
      const until = this.blocked.get(key) ?? 0
      return until > now ? until : 0
    }))
  }
  entries(now = Date.now()): { key: string; until: number }[] {
    return [...this.blocked].filter(([, until]) => until > now).map(([key, until]) => ({ key, until }))
  }
}

/** A family-specific allowance must not make another Claude model look exhausted. */
export function modelUsagePercent(route: ModelRoute, usage?: PlanUsage | null): number | null {
  if (route.auth === 'api-key' || !usage || (usage.agent && usage.agent !== route.agent)) return null
  const applicable = usage.windows.filter((window) => {
    const family = route.agent === 'claude' && /\b(opus|sonnet|haiku)\b/i.exec(window.label)?.[1]?.toLowerCase()
    return Number.isFinite(window.percent) && (!family || family === modelFamily(route))
  })
  return applicable.length ? Math.min(100, Math.max(0, ...applicable.map((window) => window.percent))) : null
}
