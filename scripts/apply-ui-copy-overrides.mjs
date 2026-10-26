// Keep UI terminology choices after generating draft translations.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const directory = fileURLToPath(new URL('../src/shared/locales/', import.meta.url))
const source = JSON.parse(readFileSync(`${directory}en.json`, 'utf8'))
const overrides = JSON.parse(readFileSync(new URL('./ui-copy-overrides.json', import.meta.url), 'utf8'))
for (const [code, terms] of Object.entries(overrides)) {
  const file = `${directory}${code}.json`
  const catalog = JSON.parse(readFileSync(file, 'utf8'))
  for (const [key, value] of Object.entries(terms)) {
    if (!(key in source)) throw new Error(`Unknown UI glossary key: ${key}`)
    catalog[key] = value
  }
  writeFileSync(file, JSON.stringify(Object.fromEntries(Object.keys(source).filter((k) => k in catalog).map((k) => [k, catalog[k]])), null, 2) + '\n')
}
console.log(`Applied UI terminology for ${Object.keys(overrides).length} languages`)
