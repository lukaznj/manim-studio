// Refresh the English interface catalog. Existing keys stay stable across copy audits.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))
const directory = join(root, 'src/shared/locales')
mkdirSync(directory, { recursive: true })
let previous = {}
try { previous = JSON.parse(readFileSync(join(directory, 'en.json'), 'utf8')) } catch { /* initial extraction */ }
const keys = new Set(Object.keys(previous))
const add = (value) => {
  if (typeof value === 'string' && /[A-Za-z]{2}/.test(value) && !/^https?:|^--|^[.#]/.test(value)) keys.add(value.trim())
}
const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)])
const attributes = new Set(['label', 'title', 'text', 'placeholder', 'lead', 'eyebrow', 'description', 'caption', 'aria-label', 'emptyText'])
const literal = (node) => {
  if (!node) return
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node.text)
  else if (ts.isConditionalExpression(node)) { literal(node.whenTrue); literal(node.whenFalse) }
}
for (const path of files(join(root, 'src')).filter((p) => /\.(tsx?|mjs)$/.test(p) && !p.includes('/locales/') && !p.endsWith('.test.ts'))) {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, path.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  function visit(node) {
    if (ts.isCallExpression(node) && /^(t|uiText|format|localize|say|translateUi|formatUi)$/.test(node.expression.getText(source))) {
      const arg = node.arguments[/^(translateUi|formatUi)$/.test(node.expression.getText(source)) ? 1 : 0]
      literal(arg)
    }
    if (path.endsWith('/main/menu.ts') && ts.isCallExpression(node) && node.expression.getText(source) === 'item') literal(node.arguments[0])
    if (path.includes('/main/') && ts.isNewExpression(node) && node.expression.getText(source) === 'Error') literal(node.arguments?.[0])
    if (ts.isPropertyAssignment(node) && attributes.has(node.name.getText(source).replaceAll("'", '').replaceAll('"', '')) && ts.isStringLiteral(node.initializer)) add(node.initializer.text)
    if (ts.isJsxAttribute(node) && attributes.has(node.name.getText(source)) && node.initializer && ts.isStringLiteral(node.initializer)) add(node.initializer.text)
    if (ts.isJsxText(node)) add(node.text.replace(/\s+/g, ' '))
    ts.forEachChild(node, visit)
  }
  visit(source)
}
const catalog = Object.fromEntries([...keys].sort().map((key) => [key, key]))
writeFileSync(join(directory, 'en.json'), JSON.stringify(catalog, null, 2) + '\n')
console.log(`English interface catalog: ${keys.size} messages`)
