import test from 'node:test'
import assert from 'node:assert/strict'
import { matchingUiLanguages, resolveUiLanguage, UI_LANGUAGES, uiLocale } from './ui-languages.ts'
import { formatUi, translateUi } from './i18n.ts'
import { readFileSync } from 'node:fs'
import { uiCatalogIssues } from './ui-catalog-validation.ts'
import { narrationLanguageForUi } from './narration-languages.ts'

test('language search matches native and translated names, accents and language codes', () => {
  assert.deepEqual(matchingUiLanguages('cestina', 'en').map((l) => l.code), ['cs'])
  assert.deepEqual(matchingUiLanguages('українська', 'en').map((l) => l.code), ['uk'])
  assert.deepEqual(matchingUiLanguages('allemand', 'fr').map((l) => l.code), ['de'])
  assert.equal(matchingUiLanguages('de', 'en')[0].code, 'de')
  assert.deepEqual(matchingUiLanguages('nonexistent-language', 'en'), [])
})

test('saved regional locales normalize without losing English or Croatian; invalid settings fall back to English', () => {
  assert.equal(resolveUiLanguage('hr-HR'), 'hr')
  assert.equal(resolveUiLanguage('de_DE'), 'de')
  assert.equal(resolveUiLanguage('no-NO'), 'nb')
  assert.equal(resolveUiLanguage('nn-NO'), 'nb')
  assert.equal(resolveUiLanguage('pt-PT'), 'pt')
  assert.equal(resolveUiLanguage('cnr'), 'cnr')
  assert.equal(resolveUiLanguage('sr-Latn-ME'), 'cnr')
  assert.equal(resolveUiLanguage('invalid'), 'en')
  assert.equal(resolveUiLanguage(undefined), 'en')
  assert.equal(resolveUiLanguage(123), 'en')
  for (const l of UI_LANGUAGES) assert.doesNotThrow(() => new Intl.DateTimeFormat(uiLocale(l.code)))
})

test('translation preserves surrounding whitespace and inserts user content only after translation', () => {
  assert.equal(translateUi('en', ' Settings '), ' Settings ')
  assert.equal(translateUi('de', ' Settings '), ' Einstellungen ')
  assert.equal(formatUi('de', 'Step {0} of {1}', ['My untouched project {1}', 9]), 'Schritt My untouched project {1} von 9')
  assert.equal(translateUi('fr', 'Some user-authored document text'), 'Some user-authored document text')
})

test('onboarding only seeds narration with an offered language; unsupported interface locales keep narration separate', () => {
  assert.equal(narrationLanguageForUi('hr'), 'hr')
  assert.equal(narrationLanguageForUi('cs'), 'cs')
  assert.equal(narrationLanguageForUi('cnr'), 'sr')
  assert.equal(narrationLanguageForUi('ga'), undefined)
  assert.equal(narrationLanguageForUi('rm'), undefined)
})

test('every advertised locale has a complete offline catalog with the same interpolation tokens', () => {
  const read = (code: string) => JSON.parse(readFileSync(new URL(`./locales/${code}.json`, import.meta.url), 'utf8')) as Record<string, string>
  const source = read('en')
  for (const language of UI_LANGUAGES) {
    const catalog = read(language.code)
    assert.deepEqual(Object.keys(catalog).sort(), Object.keys(source).sort(), language.code)
    for (const [key, value] of Object.entries(catalog)) {
      assert.deepEqual(uiCatalogIssues(language.code, key, value), [], `${language.code}: ${key}`)
    }
  }
})

test('draft validation catches lost tokens, changed product names and runaway or off-topic output', () => {
  assert.ok(uiCatalogIssues('fr', 'Step {0}', 'Étape {1}').includes('placeholders changed'))
  assert.ok(uiCatalogIssues('fr', 'Connect Codex', 'Connecter un agent').includes('Codex changed'))
  assert.ok(uiCatalogIssues('la', 'Sign in', 'et descriptio et descriptio et descriptio').includes('repetitive translation'))
  assert.ok(uiCatalogIssues('ka', 'Sign in', '1999 წელს გამოვიდა ალბომი').includes('unexpected year'))
  assert.deepEqual(uiCatalogIssues('de', 'Python 3.12', 'Python 3.12'), [])
  assert.deepEqual(uiCatalogIssues('fr', 'Version 2026', 'Version 2026'), [])
})
