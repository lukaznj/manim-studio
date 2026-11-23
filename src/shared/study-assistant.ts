import type { Agent, AgentSelection, Effort, FrameRegion, Settings } from './types'
import { MAKER_DEFAULTS } from './model-defaults.ts'

/** The lesson chat's provider (studyAgent, unset: video creation's) and its model there. */
export function studyModel(settings: Pick<Settings, 'agent' | 'studyAgent' | 'studyModels'>): AgentSelection & { effort: Effort } {
  const agent: Agent = settings.studyAgent ?? settings.agent
  const saved = settings.studyModels?.[agent]
  return { agent, model: saved?.model || MAKER_DEFAULTS[agent], effort: saved?.effort ?? 'high' }
}

export function validFrameRegion(value: FrameRegion): boolean {
  return !!value && [value.x, value.y, value.width, value.height].every(Number.isFinite) &&
    value.x >= 0 && value.y >= 0 && value.width >= .01 && value.height >= .01 &&
    value.x + value.width <= 1.001 && value.y + value.height <= 1.001
}

/** Structured advice is validated before it can start a render. */
export function videoAdvice(text: string): { medium: 'text' | 'video'; title: string; answer: string } {
  const raw = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const value = JSON.parse(raw)
  if (!value || !['text', 'video'].includes(value.medium) || typeof value.title !== 'string' ||
    !value.title.trim() || value.title.length > 120 || typeof value.answer !== 'string' || !value.answer.trim())
    throw new Error('The assistant returned an incomplete video recommendation. Try again.')
  return { medium: value.medium, title: value.title.trim(), answer: value.answer.trim() }
}

export function nearbyFollowUps<T extends { at: number; state: string }>(items: T[], time: number): T[] {
  return items.filter((item) => item.state === 'done' && time >= Math.max(0, item.at - 3) && time <= item.at + 8)
}
