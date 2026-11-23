import type { Agent, AgentRoute, AgentSelection, EpisodeRun, SeriesRole, SeriesRun, Settings } from './types'
import { MAKER_DEFAULTS, SERIES_PLANNERS } from './model-defaults.ts'
export { MAKER_DEFAULTS, SERIES_PLANNERS }
import { normalizeModelOrder } from './model-fallback.ts'

type ModelSettings = Pick<Settings, 'agent' | 'claudeModel' | 'claudeEffort' | 'codexModel' | 'codexEffort' | 'antigravityModel' | 'antigravityEffort'>

/** Video creation: `agent` and its model. An unset model is Studio's default, resolved here so every caller gets a real one. */
export function defaultAgentSelection(settings: ModelSettings, agent: Agent = settings.agent): AgentSelection {
  return {
    agent,
    model: (agent === 'claude' ? settings.claudeModel : agent === 'codex' ? settings.codexModel : settings.antigravityModel) || MAKER_DEFAULTS[agent],
    effort:
      (agent === 'claude' ? settings.claudeEffort : agent === 'codex' ? settings.codexEffort : settings.antigravityEffort) ||
      (agent === 'antigravity' ? 'medium' : 'high'),
  }
}

/** A confirmed settings change gives the captured maker priority over earlier assignments. */
export function seriesAgentSelection(
  run: Pick<SeriesRun, 'agent' | 'model' | 'effort' | 'makerFirst'>,
  ep: Pick<EpisodeRun, 'assignment'>,
  defaults: AgentSelection,
): AgentSelection {
  if (ep.assignment && !run.makerFirst) return ep.assignment
  return { agent: run.agent ?? defaults.agent, model: run.model ?? defaults.model, effort: run.effort ?? defaults.effort }
}

/**
 * A course role's provider and model. Each role picks its own provider (planAgent, lessonAgent),
 * remembering a model per provider; `agent` asks for one provider's choice instead.
 */
export function seriesSelection(settings: ModelSettings & Pick<Settings, 'seriesModels' | 'planAgent' | 'lessonAgent'>, role: SeriesRole, agent?: Agent): AgentSelection {
  const chosen = agent ?? (role === 'plan' ? settings.planAgent : settings.lessonAgent) ?? settings.agent
  const saved = settings.seriesModels?.[chosen]?.[role]
  if (saved) return { agent: chosen, model: saved.model || (role === 'plan' ? SERIES_PLANNERS : MAKER_DEFAULTS)[chosen], effort: saved.effort }
  return role === 'make' ? defaultAgentSelection(settings, agent ?? settings.agent) : { agent: chosen, model: SERIES_PLANNERS[chosen], effort: 'high' }
}

export function seriesMakerChanged(before: Settings, after: Settings): boolean {
  const previous = seriesSelection(before, 'make')
  const next = seriesSelection(after, 'make')
  const canonical = (selection: AgentSelection) =>
    normalizeModelOrder([{ ...selection, auth: 'account' }])[0]?.model ?? selection.model
  return previous.agent !== next.agent || canonical(previous) !== canonical(next) || previous.effort !== next.effort
}

export function episodeNeedsMaker(episode: EpisodeRun): boolean {
  return ['waiting', 'script', 'scripted', 'scene', 'check'].includes(episode.state)
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
