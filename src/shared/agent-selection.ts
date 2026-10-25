import type { Agent, AgentSelection, EpisodeRun, SeriesRole, SeriesRun, Settings } from './types'

export function defaultAgentSelection(settings: Settings): AgentSelection {
  const agent = settings.agent
  return {
    agent,
    model: agent === 'claude' ? settings.claudeModel : agent === 'codex' ? settings.codexModel : settings.antigravityModel,
    effort:
      (agent === 'claude' ? settings.claudeEffort : agent === 'codex' ? settings.codexEffort : settings.antigravityEffort) ||
      (agent === 'antigravity' ? 'medium' : 'high'),
  }
}

/** Saved assignments win on every step and after restart; global settings never reroute them. */
export function seriesAgentSelection(
  run: Pick<SeriesRun, 'agent' | 'model' | 'effort'>,
  ep: Pick<EpisodeRun, 'assignment'>,
  defaults: AgentSelection,
): AgentSelection {
  return ep.assignment ?? { agent: run.agent ?? defaults.agent, model: run.model ?? defaults.model, effort: run.effort ?? defaults.effort }
}

/** What a series uses unless Settings → Agent says otherwise: a strong planner, a faster maker. */
export const SERIES_MODELS: Record<Agent, Record<SeriesRole, string>> = {
  claude: { plan: 'opus', make: 'sonnet' }, // Opus 5.5 plans, Sonnet 5.5 makes
  codex: { plan: 'gpt-6-astra', make: 'gpt-6-astra' },
  antigravity: { plan: '', make: '' }, // Gemini 4 Argon
}

export function seriesSelection(settings: Pick<Settings, 'agent' | 'seriesModels'>, role: SeriesRole, agent: Agent = settings.agent): AgentSelection {
  const saved = settings.seriesModels?.[agent]?.[role]
  return { agent, model: saved?.model ?? SERIES_MODELS[agent][role], effort: saved?.effort ?? 'high' }
}
