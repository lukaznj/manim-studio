import type { Agent, AgentRoute, AgentSelection, EpisodeRun, SeriesRole, SeriesRun, Settings } from './types'
import { CODEX_PLANNER } from './codex-selection.ts'

type ModelSettings = Pick<Settings, 'agent' | 'claudeModel' | 'claudeEffort' | 'codexModel' | 'codexEffort' | 'antigravityModel' | 'antigravityEffort'>

export function defaultAgentSelection(settings: ModelSettings, agent: Agent = settings.agent): AgentSelection {
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

/** Planning has its own default; episode creation inherits the normal creation model. */
export const SERIES_PLANNERS: Record<Agent, string> = {
  claude: 'opus',
  codex: CODEX_PLANNER,
  antigravity: '', // Gemini 4 Argon
}

export function seriesSelection(settings: ModelSettings & Pick<Settings, 'seriesModels'>, role: SeriesRole, agent: Agent = settings.agent): AgentSelection {
  const saved = settings.seriesModels?.[agent]?.[role]
  if (saved) return { agent, model: saved.model, effort: saved.effort }
  return role === 'make' ? defaultAgentSelection(settings, agent) : { agent, model: SERIES_PLANNERS[agent], effort: 'high' }
}

/** An explicit takeover also replaces unfinished comparison assignments, but never completed history. */
export function switchSeriesSelection(run: SeriesRun, to: AgentRoute, maker: AgentSelection): void {
  Object.assign(run, maker, { auth: to.auth })
  for (const episode of run.episodes) {
    if (episode.state === 'done' || episode.state === 'export') continue
    if (episode.assignment) {
      episode.assignment = { ...maker }
      episode.assignmentAuth = to.auth
    }
  }
}
