import assert from 'node:assert/strict'
import { test } from 'node:test'
import { interfaceSize, chatTextSize, stepInterfaceSize } from './text-size.ts'

test('text preferences handle old settings, invalid persisted values, and safe bounds', () => {
  assert.equal(interfaceSize(), 100)
  assert.equal(interfaceSize(NaN), 100)
  assert.equal(interfaceSize(900), 150)
  assert.equal(interfaceSize(-1), 75)
  assert.equal(chatTextSize(), 13)
  assert.equal(chatTextSize(Infinity), 13)
  assert.equal(chatTextSize(100), 24)
  assert.equal(chatTextSize(0), 12)
})
test('zoom shortcuts step through sizes from custom values and stop at either bound', () => {
  assert.equal(stepInterfaceSize(undefined, 1), 110)
  assert.equal(stepInterfaceSize(110, -1), 100)
  assert.equal(stepInterfaceSize(117, 1), 125)
  assert.equal(stepInterfaceSize(117, -1), 110)
  assert.equal(stepInterfaceSize(150, 1), 150)
  assert.equal(stepInterfaceSize(75, -1), 75)
})
