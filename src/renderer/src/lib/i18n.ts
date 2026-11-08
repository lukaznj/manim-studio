import { translateUi } from '../../../shared/i18n'
import { resolveUiLanguage, uiLocale, type UiLanguage } from '../../../shared/ui-languages'

let language: UiLanguage = 'en'
export const currentLanguage = (): UiLanguage => language
export const currentLocale = (): string => uiLocale(language)

export function setLanguage(next: UiLanguage): void {
  language = resolveUiLanguage(next)
  document.documentElement.lang = uiLocale(language)
}

/** Product copy only. Never pass scene source, narration or user documents through this catalog. */
export function t(text: string): string {
  return translateUi(language, text)
}

/** Rendering-boundary helper also accepts icons, fragments and numeric values. */
export function localize<T>(value: T): T {
  return (typeof value === 'string' ? t(value) : value) as T
}

const plurals = new Map<UiLanguage, Intl.PluralRules>()
/** `{0, plural, one {# lesson} other {# lessons}}`: the form this language uses for that number. */
function plural(template: string, values: unknown[]): string {
  return template.replace(/\{(\d+), plural,((?:\s*\w+\s*\{[^{}]*\})+)\s*\}/g, (_match, index: string, cases: string) => {
    const n = Number(values[Number(index)])
    if (!plurals.has(language)) plurals.set(language, new Intl.PluralRules(uiLocale(language)))
    const forms = Object.fromEntries([...cases.matchAll(/(\w+)\s*\{([^{}]*)\}/g)].map((m) => [m[1], m[2]]))
    return (forms[plurals.get(language)!.select(n)] ?? forms.other ?? '').replace(/#/g, String(n))
  })
}

/** Translate the template first; interpolated user content is always preserved verbatim. */
export function format(template: string, values: unknown[]): string {
  return plural(t(template), values).replace(/\{(\d+)\}/g, (_match, index: string) => String(values[Number(index)] ?? ''))
}

/** Counts in the UI: "1 lesson", "2 lekcije", "5 lekcija". */
export const LESSONS = '{0, plural, one {# lesson} other {# lessons}}'
export const EXERCISES = '{0, plural, one {# exercise} other {# exercises}}'
