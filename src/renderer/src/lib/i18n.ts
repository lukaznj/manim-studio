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

/** Translate the template first; interpolated user content is always preserved verbatim. */
export function format(template: string, values: unknown[]): string {
  return t(template).replace(/\{(\d+)\}/g, (_match, index: string) => String(values[Number(index)] ?? ''))
}
