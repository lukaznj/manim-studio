// Studio's model defaults, one place to update by hand when providers release models. The lists
// themselves aren't filtered: any model an account offers can be picked (ADR 0068).
import type { Agent, Settings } from './types'

const CODEX_DEFAULT = 'gpt-6.2-sol'

/** What video creation (and the editor's chat) and the lesson chat run when nothing is chosen. */
export const MAKER_DEFAULTS: Record<Agent, string> = { claude: 'claude-sonnet-5-5', codex: CODEX_DEFAULT, antigravity: 'gemini-4-hydrogen' }

/** Course planning's defaults; course lessons inherit video creation's model. */
export const SERIES_PLANNERS: Record<Agent, string> = { claude: 'opus', codex: CODEX_DEFAULT, antigravity: 'gemini-4-neon' }

/** Defaults that earlier versions saved as explicit choices; unset now means Studio's current default. */
const OLD_DEFAULTS = { claude: ['claude-sonnet-5-5'], codex: ['gpt-6.1-sol', 'gpt-6-astra'], plan: { claude: 'opus', codex: 'gpt-6-astra', antigravity: 'gemini-4-neon' } } as const

/**
 * Once (defaultsVersion 2): models that were only ever Studio's defaults become unset, so a later
 * default reaches everyone who never picked one. Explicit choices stay.
 */
export function migrateModelDefaults<T extends Pick<Settings, 'claudeModel' | 'codexModel' | 'seriesModels' | 'defaultsVersion'>>(settings: T): T & { defaultsVersion: number } {
  if ((settings.defaultsVersion ?? 0) >= 2) return { ...settings, defaultsVersion: settings.defaultsVersion! }
  const seriesModels = settings.seriesModels && Object.fromEntries(Object.entries(settings.seriesModels).map(([agent, roles]) => {
    const plan = roles?.plan && roles.plan.model === OLD_DEFAULTS.plan[agent as keyof typeof OLD_DEFAULTS.plan] ? undefined : roles?.plan
    const make = roles?.make && agent === 'codex' && (OLD_DEFAULTS.codex as readonly string[]).includes(roles.make.model) ? undefined : roles?.make
    return [agent, { ...(plan ? { plan } : {}), ...(make ? { make } : {}) }]
  }))
  return {
    ...settings,
    claudeModel: (OLD_DEFAULTS.claude as readonly string[]).includes(settings.claudeModel) ? '' : settings.claudeModel,
    codexModel: (OLD_DEFAULTS.codex as readonly string[]).includes(settings.codexModel) ? '' : settings.codexModel,
    ...(seriesModels ? { seriesModels } : {}),
    defaultsVersion: 2,
  }
}

const version = (label: string) => (/\d+(?:\.\d+)*/.exec(label)?.[0] ?? '0').split('.').map(Number)

/**
 * Newest first: providers don't report release dates, so the version in the name stands in for
 * one ("GPT-6.2 Sol" before "GPT-6.1 Sol"). Within a version the provider's own order stays.
 */
export function sortModels<T extends { label: string }>(models: T[]): T[] {
  return [...models].sort((a, b) => {
    const [x, y] = [version(a.label), version(b.label)]
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0)
    return 0
  })
}
