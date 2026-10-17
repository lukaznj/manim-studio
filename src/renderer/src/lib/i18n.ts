import { hr } from './hr'

let language: 'en' | 'hr' = 'en'
export const currentLanguage = (): 'en' | 'hr' => language

export function setLanguage(next: 'en' | 'hr'): void {
  language = next
  document.documentElement.lang = next
}

/** Product copy only. Never pass scene source, narration or user documents through this catalog. */
export function t(text: string): string {
  if (language === 'en') return text
  if (hr[text]) return hr[text]
  const key = text.trim()
  return hr[key] ? text.replace(key, () => hr[key]) : text
}

/** Rendering-boundary helper also accepts icons, fragments and numeric values. */
export function localize<T>(value: T): T {
  return (typeof value === 'string' ? t(value) : value) as T
}

/** Translate the template first; interpolated user content is always preserved verbatim. */
export function format(template: string, values: unknown[]): string {
  return t(template).replace(/\{(\d+)\}/g, (_match, index: string) => String(values[Number(index)] ?? ''))
}
