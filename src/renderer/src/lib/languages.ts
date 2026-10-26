export { NARRATION_LANGUAGES as LANGUAGES } from '../../../shared/narration-languages'


import { currentLanguage } from './i18n'
import { uiLocale } from '../../../shared/ui-languages'
export const languageName = { of: (code: string): string | undefined => new Intl.DisplayNames([uiLocale(currentLanguage())], { type: 'language' }).of(code) }
