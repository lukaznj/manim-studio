import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_SUBTITLE_STYLE, subtitleStyle, subtitleVariables } from './subtitle-style.ts'

test('subtitle preferences tolerate old and malformed saved settings', () => {
  assert.deepEqual(subtitleStyle(), DEFAULT_SUBTITLE_STYLE)
  assert.deepEqual(subtitleStyle(null), DEFAULT_SUBTITLE_STYLE)
  const saved = subtitleStyle({ size: Infinity, color: 'url(secret)', background: '#bad', opacity: -20, position: 'left', outline: 'yes' } as never)
  assert.equal(saved.size, 100)
  assert.equal(saved.color, '#ffffff')
  assert.equal(saved.background, '#000000')
  assert.equal(saved.opacity, 0)
  assert.equal(saved.position, 'bottom')
  assert.equal(saved.outline, true)
  assert.equal(subtitleStyle({ size: 500 }).size, 200)
  assert.equal(subtitleStyle({ size: 0 }).size, 75)
})

test('subtitle colors, transparency and contrast outline follow the viewer choice', () => {
  const clear = subtitleVariables(subtitleStyle({ color: '#000000', background: '#FFFFFF', opacity: 0, outline: false }))
  assert.equal(clear['--subtitle-background'], 'rgb(255 255 255 / 0)')
  assert.equal(clear['--subtitle-shadow'], 'none')
  const outlined = subtitleVariables(subtitleStyle({ color: '#000000', size: 150 }))
  assert.match(outlined['--subtitle-shadow'], /#fff/)
  assert.equal(outlined['--subtitle-scale'], '1.5')
  assert.match(subtitleVariables(subtitleStyle({ color: '#00ff00' }))['--subtitle-shadow'], /#000/)
})
