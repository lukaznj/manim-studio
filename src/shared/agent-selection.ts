import type { Agent, AgentRoute, AgentSelection, EpisodeRun, SeriesRole, SeriesRun, Settings } from './types'
import { CODEX_PLANNER } from './codex-selection.ts'
import { normalizeModelOrder } from './model-fallback.ts'

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

/** A confirmed settings change gives the captured maker priority over earlier assignments. */
export function seriesAgentSelection(
  run: Pick<SeriesRun, 'agent' | 'model' | 'effort' | 'makerFirst'>,
  ep: Pick<EpisodeRun, 'assignment'>,
  defaults: AgentSelection,
): AgentSelection {
  if (ep.assignment && !run.makerFirst) return ep.assignment
  return { agent: run.agent ?? defaults.agent, model: run.model ?? defaults.model, effort: run.effort ?? defaults.effort }
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
