/** National languages of European countries, including Europe's transcontinental countries. */
export const UI_LANGUAGES = [
  { code: 'sq', name: 'Albanian', nativeName: 'Shqip' },
  { code: 'hy', name: 'Armenian', nativeName: 'Հայերեն' },
  { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycanca' },
  { code: 'be', name: 'Belarusian', nativeName: 'Беларуская' },
  { code: 'bs', name: 'Bosnian', nativeName: 'Bosanski' },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български' },
  { code: 'ca', name: 'Catalan', nativeName: 'Català' },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'et', name: 'Estonian', nativeName: 'Eesti' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'ka', name: 'Georgian', nativeName: 'ქართული' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar' },
  { code: 'is', name: 'Icelandic', nativeName: 'Íslenska' },
  { code: 'ga', name: 'Irish', nativeName: 'Gaeilge' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'kk', name: 'Kazakh', nativeName: 'Қазақша' },
  { code: 'la', name: 'Latin', nativeName: 'Latina' },
  { code: 'lv', name: 'Latvian', nativeName: 'Latviešu' },
  { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių' },
  { code: 'lb', name: 'Luxembourgish', nativeName: 'Lëtzebuergesch' },
  { code: 'mk', name: 'Macedonian', nativeName: 'Македонски' },
  { code: 'mt', name: 'Maltese', nativeName: 'Malti' },
  { code: 'cnr', name: 'Montenegrin', nativeName: 'Crnogorski', locale: 'sr-Latn-ME' },
  { code: 'nb', name: 'Norwegian', nativeName: 'Norsk bokmål' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', locale: 'pt-PT' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română' },
  { code: 'rm', name: 'Romansh', nativeName: 'Rumantsch' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'sr', name: 'Serbian', nativeName: 'Српски' },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina' },
  { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська' },
] as const

export type UiLanguage = (typeof UI_LANGUAGES)[number]['code']

export function resolveUiLanguage(value: unknown): UiLanguage {
  const normalized = typeof value === 'string' ? value.toLowerCase().replaceAll('_', '-') : 'en'
  const base = normalized.split('-')[0]
  if (base === 'sr' && normalized.endsWith('-me')) return 'cnr'
  return UI_LANGUAGES.find((l) => l.code === normalized || l.code === (base === 'no' || base === 'nn' ? 'nb' : base))?.code ?? 'en'
}

/** Intl does not recognize Montenegrin's ISO code; use its equivalent locale for formatting. */
export function uiLocale(language: UiLanguage): string {
  const entry = UI_LANGUAGES.find((l) => l.code === language)!
  return 'locale' in entry ? entry.locale : entry.code
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
export function matchingUiLanguages(query: string, language: UiLanguage) {
  const names = new Intl.DisplayNames([uiLocale(language)], { type: 'language' })
  const needle = fold(query.trim())
  const matches = UI_LANGUAGES.filter((l) => fold(`${l.name} ${l.nativeName} ${l.code} ${names.of(l.code) ?? ''}`).includes(needle))
  if (!needle) return matches
  const rank = (l: (typeof UI_LANGUAGES)[number]) => l.code === needle ? 0 : [l.name, l.nativeName, names.of(l.code) ?? ''].some((name) => fold(name).startsWith(needle)) ? 1 : 2
  return matches.sort((a, b) => rank(a) - rank(b))
}
