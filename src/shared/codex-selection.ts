import type { ModelOption, Settings } from './types'

export const CODEX_EXECUTOR = 'gpt-6.1-sol'
export const CODEX_PLANNER = 'gpt-6-astra'

export function isCodexModel(model: string | undefined): boolean {
  return model === CODEX_EXECUTOR || model === CODEX_PLANNER
}

/** Keep account-provided availability and effort levels, within Studio's supported choices. */
export function studioCodexModels(models: ModelOption[]): ModelOption[] {
  return models.filter((m) => isCodexModel(m.value)).map((m) => ({
    ...m,
    label: m.value === CODEX_PLANNER ? 'GPT-6 Astra' : 'GPT-6.1 Sol',
  }))
}

/** Migrate old account defaults and retired models, including saved planner/maker overrides. */
export function normalizeCodexSettings<T extends Pick<Settings, 'codexModel' | 'codexFallbackModel' | 'seriesModels'>>(settings: T): T {
  const roles = settings.seriesModels?.codex
  return {
    ...settings,
    codexModel: isCodexModel(settings.codexModel) ? settings.codexModel : CODEX_EXECUTOR,
    codexFallbackModel: isCodexModel(settings.codexFallbackModel) ? settings.codexFallbackModel : undefined,
    ...(roles ? { seriesModels: { ...settings.seriesModels, codex: {
      ...roles,
      ...(roles.plan ? { plan: { ...roles.plan, model: isCodexModel(roles.plan.model) ? roles.plan.model : CODEX_PLANNER } } : {}),
      ...(roles.make ? { make: { ...roles.make, model: isCodexModel(roles.make.model) ? roles.make.model : CODEX_EXECUTOR } } : {}),
    } } } : {}),
  }
}
