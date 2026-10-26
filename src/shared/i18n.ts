import { catalogs } from './locales/index.ts'
import type { UiLanguage } from './ui-languages'

/** Product copy only. User documents, project names, code and narration are never translated. */
export function translateUi(language: UiLanguage, text: string): string {
  if (language === 'en') return text
  const catalog = catalogs[language]
  if (!catalog) return text
  if (catalog[text]) return catalog[text]
  const key = text.trim()
  return catalog[key] ? text.replace(key, () => catalog[key]) : text
}

/** Translate templates before interpolation, preserving user content and every placeholder. */
export function formatUi(language: UiLanguage, template: string, values: unknown[]): string {
  return translateUi(language, template).replace(/\{(\d+)\}/g, (_match, index: string) => String(values[Number(index)] ?? ''))
}
