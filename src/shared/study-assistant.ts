import type { Agent, FrameRegion, Settings } from './types'
import { CODEX_EXECUTOR, isCodexModel } from './codex-selection.ts'

export function studyModel(settings: Pick<Settings, 'agent' | 'studyModels'>) {
  const agent: Agent = settings.agent
  const saved = settings.studyModels?.[agent]
  const model = agent === 'claude' ? 'claude-sonnet-5-5' : agent === 'codex' ? CODEX_EXECUTOR : ''
  return { model: saved && (agent !== 'codex' || isCodexModel(saved.model)) ? saved.model : model, effort: saved?.effort ?? 'high' as const }
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
