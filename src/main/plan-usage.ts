import type { Agent, ClaudeAuth, PlanUsage } from '../shared/types'
import { claudeUsage } from './claude'
import { codexPlanUsage } from './codex'
import { getSettings } from './settings'

const readings = new Map<Agent, { until: number; value: Promise<PlanUsage | null> }>()
export const clearPlanUsage = (): void => readings.clear()

/** Provider-reported account usage only. Never derive subscription percentages from tokens. */
export async function agentPlanUsage(agent: Agent = getSettings().agent, auth?: ClaudeAuth): Promise<PlanUsage | null> {
  if (!['claude', 'codex', 'antigravity'].includes(agent)) return null
  if (auth === 'api-key') return null
  const settings = getSettings()
  const keyMode = agent === 'claude' ? settings.claudeAuth === 'api-key'
    : agent === 'codex' ? (settings.codexAuth ?? (settings.hasOpenAIKey ? 'api-key' : 'account')) === 'api-key'
      : (settings.antigravityAuth ?? (settings.hasGeminiKey ? 'api-key' : 'account')) === 'api-key'
  if (keyMode) return null
  const cached = readings.get(agent)
  if (cached && cached.until > Date.now()) return cached.value
  const value = (agent === 'claude' ? claudeUsage(true) : agent === 'codex' ? codexPlanUsage() : Promise.resolve(null))
    .then((usage) => usage?.windows.length ? { ...usage, agent } : null)
    .catch(() => null)
  readings.set(agent, { until: Date.now() + 30_000, value })
  return value
}
