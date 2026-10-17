import type { AgentSelection, EpisodeRun, SeriesRun, Settings } from './types'

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
