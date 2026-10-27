import type { ModelRoute } from '../shared/types'
import type { EpisodeAgent } from './agent'
import type { TurnResult } from './claude'
import { modelRouteKey } from '../shared/model-fallback.ts'
import { usageLimitFromError } from '../shared/usage-limit.ts'

/** Keep an active turn intact; reevaluate production priority at the next safe turn boundary. */
export function routedAgent(initial: ModelRoute, policy: {
  open: (route: ModelRoute) => Promise<EpisodeAgent>
  enabled: () => boolean
  preferred: (tried?: Set<string>) => Promise<ModelRoute | null>
  blocked: (route: ModelRoute) => number
  exhaustedUntil: (route: ModelRoute) => number
  reject: (route: ModelRoute, until: number, kind?: string) => void
  outcome: (route: ModelRoute, result: TurnResult) => void
  selected: (route: ModelRoute) => void
  resume: (text: string) => string
  notice: (route: ModelRoute) => void
  followPriority: boolean
  withHistory: boolean
}): EpisodeAgent {
  let selected = initial
  let inner: EpisodeAgent | null = null
  let closed = false
  policy.selected(selected)
  const select = (next: ModelRoute) => {
    inner?.close()
    inner = null
    selected = next
    policy.selected(selected)
  }
  return {
    async turn(text, step) {
      const tried = new Set<string>()
      let prompt = policy.withHistory ? policy.resume(text) : text
      if (closed) return { ok: false, error: 'Stopped' }
      if (policy.followPriority && policy.enabled()) {
        const preferred = await policy.preferred()
        if (closed) return { ok: false, error: 'Stopped' }
        if (preferred && (modelRouteKey(preferred) !== modelRouteKey(selected) || preferred.effort !== selected.effort)) {
          select(preferred)
          prompt = policy.resume(text)
        }
      }
      for (;;) {
        if (closed) return { ok: false, error: 'Stopped' }
        if (policy.enabled() && policy.blocked(selected)) {
          const next = await policy.preferred(tried)
          if (closed) return { ok: false, error: 'Stopped' }
          if (!next) return { ok: false, error: 'All models in your fallback order have reached their usage limits.', limitedUntil: policy.exhaustedUntil(selected) }
          select(next)
          prompt = policy.resume(text)
        }
        if (!inner) {
          const opened = await policy.open(selected)
          if (closed) { opened.close(); return { ok: false, error: 'Stopped' } }
          inner = opened
        }
        const active = inner
        const result = await active.turn(prompt, step)
        policy.outcome(selected, result)
        if (closed || result.ok || !policy.enabled()) return result
        const limit = result.limitedUntil !== undefined ? { until: result.limitedUntil, kind: result.limitKind } : usageLimitFromError(result.error)
        if (!limit) return result
        tried.add(modelRouteKey(selected))
        policy.reject(selected, limit.until, limit.kind)
        const next = await policy.preferred(tried)
        if (closed) return { ok: false, error: 'Stopped' }
        if (!next) return { ...result, limitedUntil: policy.exhaustedUntil(selected) || limit.until }
        select(next)
        policy.notice(selected)
        prompt = `The previous model reached a usage limit. Continue the unfinished request.\n\n${policy.resume(text)}`
      }
    },
    close() { if (closed) return; closed = true; inner?.close() },
  }
}
