import assert from 'node:assert/strict'
import { test } from 'node:test'
import { slugify } from './slug.ts'

test('slugs work for any language', () => {
  assert.equal(slugify('Kvadratna funkcija — tjeme'), 'kvadratna-funkcija-tjeme')
  assert.equal(slugify('Đurđa i Šime'), 'durda-i-sime')
  assert.equal(slugify('Théorème de Pythagore'), 'theoreme-de-pythagore')
  assert.equal(slugify('Größte Zahl'), 'grosste-zahl')
  assert.equal(slugify('!!!'), 'project')
})
