import { catalogs } from './locales/index.ts'
import { uiLocale, type UiLanguage } from './ui-languages.ts'

/** Product copy only. User documents, project names, code and narration are never translated. */
export function translateUi(language: UiLanguage, text: string): string {
  if (language === 'en') return text
  const catalog = catalogs[language]
  if (!catalog) return text
  if (catalog[text]) return catalog[text]
  const key = text.trim()
  return catalog[key] ? text.replace(key, () => catalog[key]) : text
}

// ICU-lite: {0, plural, one {# file} other {# files}}; the language's own forms (few, many, =0…) come from Intl.PluralRules.
const PLURAL = /\{(\d+), plural,((?:\s*=?\w+\s*\{[^{}]*\})+)\s*\}/g

/** Translate templates before interpolation, preserving user content and every placeholder. */
export function formatUi(language: UiLanguage, template: string, values: unknown[]): string {
  const rules = new Intl.PluralRules(uiLocale(language))
  return translateUi(language, template)
    .replace(PLURAL, (_match, index: string, options: string) => {
      const n = Number(values[Number(index)])
      const forms = Object.fromEntries([...options.matchAll(/(=?\w+)\s*\{([^{}]*)\}/g)].map((m) => [m[1], m[2]]))
      return (forms[`=${n}`] ?? forms[rules.select(n)] ?? forms.other ?? '').replaceAll('#', String(n))
    })
    .replace(/\{(\d+)\}/g, (_match, index: string) => String(values[Number(index)] ?? ''))
}
