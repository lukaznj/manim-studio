import { t as uiText, format, currentLocale } from '../lib/i18n'
import { ArrowRight, Hourglass, KeyRound, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Agent, AgentRoute, ClaudeAuth, Settings } from '../../../shared/types'
import { api } from '../lib/api'
import { errorText, toast, useStore } from '../store'

const NAMES: Record<Agent, string> = { claude: 'Claude', codex: 'Codex', antigravity: 'Antigravity' }
const ACCOUNTS: Record<Agent, string> = { claude: 'Claude account', codex: 'ChatGPT account', antigravity: 'Google account' }
const routeDetail = (r: AgentRoute) => uiText(r.auth === 'api-key' ? 'API key' : ACCOUNTS[r.agent])
export const routeName = (r: AgentRoute) => `${NAMES[r.agent]}${r.auth === 'api-key' ? ` · ${routeDetail(r)}` : ''}`

/** How Settings → Accounts signs an agent in (mirrors src/main/agent.ts configuredAuth). */
export function configuredAuth(s: Settings | null, agent: Agent): ClaudeAuth {
  if (!s) return 'account'
  if (agent === 'codex') return s.codexAuth ?? (s.hasOpenAIKey ? 'api-key' : 'account')
  if (agent === 'antigravity') return s.antigravityAuth ?? (s.hasGeminiKey ? 'api-key' : 'account')
  return s.claudeAuth ?? 'account'
}

/**
 * While a series or an exercise set waits for a plan's usage limit to reset (ADR 0048): when it
 * carries on by itself, and a button for each other agent or saved key that can carry on now.
 */
export function LimitSwitch({ until, current, onSwitch }: { until: number; current: AgentRoute; onSwitch: (to: AgentRoute) => Promise<void> }) {
  const [routes, setRoutes] = useState<AgentRoute[] | null>(null)
  const [busy, setBusy] = useState(false)
  const settings = useStore((s) => s.settings)
  useEffect(() => {
    void api.agentRoutes().then(setRoutes, () => setRoutes([]))
  }, [settings?.hasAnthropicKey, settings?.hasOpenAIKey, settings?.hasGeminiKey, settings?.claudeAuth, settings?.codexAuth, settings?.antigravityAuth])
  const others = (routes ?? []).filter((r) => r.agent !== current.agent || r.auth !== current.auth)
  const time = new Date(until).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' })
  const pick = async (to: AgentRoute) => {
    setBusy(true)
    try {
      await onSwitch(to)
      toast(format('Carrying on with {0}.', [routeName(to)]), 'ok')
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="limit-switch" role="status">
      <Hourglass />
      <div className="limit-switch-body">
        <strong>{format('{0} reached its usage limit', [routeName(current)])}</strong>
        <span className="hint">
          {format('It carries on by itself at {0}.', [time])}{' '}
          {others.length
            ? uiText('Or carry on now with another agent:')
            : routes
              ? uiText('To carry on now, sign in to another agent or add an API key in Settings → Accounts.')
              : ''}
        </span>
        {others.length > 0 && (
          <div className="limit-switch-actions">
            {others.map((r) => (
              <button
                key={`${r.agent}-${r.auth}`}
                className="btn limit-switch-route"
                aria-label={`${NAMES[r.agent]} · ${routeDetail(r)}`}
                disabled={busy}
                onClick={() => void pick(r)}
              >
                <span className="limit-switch-route-icon" aria-hidden="true">
                  {r.auth === 'api-key' ? <KeyRound /> : <UserRound />}
                </span>
                <span className="limit-switch-route-label">
                  <strong>{NAMES[r.agent]}</strong>
                  <span>{routeDetail(r)}</span>
                </span>
                <ArrowRight className="limit-switch-route-arrow" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
        {others.some((r) => r.auth === 'api-key') && (
          <span className="hint">{uiText('An API key is billed per use by its provider, separately from any plan.')}</span>
        )}
      </div>
    </div>
  )
}
