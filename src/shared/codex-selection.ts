import type { ModelOption, Settings } from './types'

/** The Codex models Studio offers: OpenAI's most capable ones (ADR 0039). */
export const CODEX_MODELS: Readonly<Record<string, string>> = { 'gpt-6-astra': 'GPT-6 Astra', 'gpt-6.1-sol': 'GPT-6.1 Sol', 'gpt-6.1-terra': 'GPT-6.1 Terra' }
export const CODEX_EXECUTOR = 'gpt-6.1-sol'
export const CODEX_PLANNER = 'gpt-6-astra'

export function isCodexModel(model: string | undefined): boolean {
  return !!model && Object.hasOwn(CODEX_MODELS, model)
}

/** Keep account-provided availability and effort levels, within Studio's supported choices. */
export function studioCodexModels(models: ModelOption[]): ModelOption[] {
  return models.filter((m) => isCodexModel(m.value)).map((m) => ({
    ...m,
    label: CODEX_MODELS[m.value],
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
