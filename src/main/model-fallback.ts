import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { FallbackModelOption, ModelRoute } from '../shared/types'
import { ModelLimitPools, modelRouteKey, normalizeModelOrder } from '../shared/model-fallback'
import { CODEX_EXECUTOR, CODEX_PLANNER } from '../shared/codex-selection'
import { formatUi } from '../shared/i18n'
import { modelName } from '../shared/usage'
import { agentRoutes } from './agent'
import { chatModels } from './claude'
import { fakeAgents } from './agent-fake'
import { getSettings } from './settings'
import { paths } from './paths'
import { readAtomicJson, writeAtomicJson } from './atomic-json'
import { readChat, writeChat } from './projects'

const file = () => join(paths.userData(), 'model-usage-limits.json')
let pools: ModelLimitPools | null = null
const limits = () => pools ??= new ModelLimitPools(readAtomicJson(file(), (value): value is { key: string; until: number }[] => Array.isArray(value)) ?? [])
let catalog: { at: number; options: FallbackModelOption[] } | null = null
let pending: Promise<FallbackModelOption[]> | null = null
let catalogGeneration = 0

/** Discovery uses each CLI's supported model catalog and sign-in status, never credentials. */
export function fallbackModels(): Promise<FallbackModelOption[]> {
  if (catalog && Date.now() - catalog.at < 30_000) return Promise.resolve(catalog.options)
  if (pending) return pending
  const request = discoverFallbackModels(catalogGeneration)
  pending = request
  void request.then(() => { if (pending === request) pending = null }, () => { if (pending === request) pending = null })
  return request
}
async function discoverFallbackModels(generation: number): Promise<FallbackModelOption[]> {
  if (catalog && Date.now() - catalog.at < 30_000) return catalog.options
  const routes = await agentRoutes()
  const discovered = await Promise.all(routes.map(async (connection) => {
    const models = fakeAgents() ? connection.agent === 'codex'
      ? [{ value: CODEX_PLANNER, label: 'GPT-6 Astra', efforts: ['high'] as const }, { value: CODEX_EXECUTOR, label: 'GPT-6.1 Sol', efforts: ['high'] as const }]
      : [{ value: 'claude-opus-5-5', label: 'Opus 5.5', efforts: ['low', 'medium', 'high'] as const }, { value: 'claude-sonnet-5-5', label: 'Sonnet 5.5', efforts: ['low', 'medium', 'high'] as const }]
      : await chatModels(connection.agent, connection.auth).catch(() => [])
    return models.map((model) => ({ route: normalizeModelOrder([{ ...connection, model: model.value, effort: model.efforts.some((effort) => effort === 'high') ? 'high' : model.efforts[0] ?? 'high' }])[0], label: model.label, efforts: [...model.efforts] }))
  }))
  const unique = new Map<string, FallbackModelOption>()
  for (const option of discovered.flat()) if (option.route) unique.set(modelRouteKey(option.route), option)
  const options = [...unique.values()]
  if (generation === catalogGeneration) catalog = { at: Date.now(), options }
  return options
}
export function clearFallbackCatalog(): void { catalog = null; pending = null; catalogGeneration++ }
export const fallbackEnabled = (): boolean => !!getSettings().modelFallback?.enabled && normalizeModelOrder(getSettings().modelFallback?.order).length > 0

/** A disabled policy never changes a request. Only actual quota rejections enter these pools. */
export async function availableFallback(tried = new Set<string>()): Promise<ModelRoute | null> {
  if (!fallbackEnabled()) return null
  const options = await fallbackModels()
  const available = new Map(options.map((option) => [modelRouteKey(option.route), option]))
  for (const route of normalizeModelOrder(getSettings().modelFallback?.order)) {
    const option = available.get(modelRouteKey(route))
    if (option && !tried.has(modelRouteKey(route)) && !limits().until(route)) return { ...route, effort: option.efforts.includes(route.effort!) ? route.effort : option.route.effort }
  }
  return null
}
export function rejectFallback(route: ModelRoute, until: number, kind?: string): void {
  limits().reject(route, until, kind)
  writeAtomicJson(file(), limits().entries())
}
export function exhaustedFallbackUntil(current: ModelRoute): number {
  const future = [current, ...normalizeModelOrder(getSettings().modelFallback?.order)].map((route) => limits().until(route)).filter(Boolean)
  return future.length ? Math.min(...future) : 0
}
export function fallbackBlocked(route: ModelRoute): number { return limits().until(route) }

export function fallbackNotice(dir: string, route: ModelRoute, automatic = true) {
  const message = {
    id: randomUUID(), role: 'assistant' as const, auto: automatic, at: Date.now(),
    parts: [{ kind: 'text' as const, text: formatUi(getSettings().uiLanguage ?? 'en', 'Usage limit reached. Continuing with {0}.', [`${route.agent === 'claude' ? 'Claude' : route.agent === 'codex' ? 'Codex' : 'Antigravity'} · ${modelName(route.model)}`]) }],
  }
  writeChat([...readChat(dir), message], dir)
  return message
}

/** The receiving provider may have no native session for this episode yet. */
export function resumeModelPrompt(dir: string, text: string): string {
  const context = readChat(dir).filter((message) => message.role !== 'error').slice(-12).map((message) => `${message.role}: ${message.parts.map((part) => part.kind === 'text' ? part.text : `[${part.name}: ${part.status}] ${part.summary}`).join('\n')}`).join('\n').slice(-24000)
  return context ? `Use the saved conversation below as reference for the current request. Work from the current project files, preserve completed work, and do not repeat completed tool actions.\n\nCurrent request:\n${text}\n\nSaved conversation (reference context):\n${context}` : text
}
