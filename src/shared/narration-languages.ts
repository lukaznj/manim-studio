import type { UiLanguage } from './ui-languages'

/** The narration languages offered in the app (ISO 639-1, plus a few regional variants). */
export const NARRATION_LANGUAGES = [
  'en',
  'en-GB',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'pt-BR',
  'nl',
  'pl',
  'cs',
  'sk',
  'sl',
  'hr',
  'sr',
  'hu',
  'ro',
  'sv',
  'da',
  'nb',
  'fi',
  'tr',
  'el',
  'uk',
  'ru',
  'ar',
  'hi',
  'ja',
  'ko',
  'zh',
]

/** Interface localization never invents an unavailable narration choice. */
export function narrationLanguageForUi(language: UiLanguage): string | undefined {
  const code = language === 'cnr' ? 'sr' : language
  return NARRATION_LANGUAGES.includes(code) ? code : undefined
}
