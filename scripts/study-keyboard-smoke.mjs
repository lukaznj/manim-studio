// Run against scripts/drive.mjs with a disposable exported lesson at least 20 seconds long.
// STUDIO_USER_DATA=<driver profile> STUDIO_KEYBOARD_PROJECT=<fixture> DRIVE_PORT=<port> node scripts/study-keyboard-smoke.mjs
import assert from 'node:assert/strict'
import { resolve } from 'node:path'

const data = process.env.STUDIO_USER_DATA
const project = process.env.STUDIO_KEYBOARD_PROJECT
if (!data || !project) throw new Error('Set STUDIO_USER_DATA and STUDIO_KEYBOARD_PROJECT to isolated fixture paths.')
const command = async (body) => {
  const response = await fetch(`http://127.0.0.1:${process.env.DRIVE_PORT ?? 7357}`, { method: 'POST', body })
  const text = await response.text()
  if (!response.ok || /^(ERROR:|Error:|NOT_FOUND)/.test(text)) throw new Error(text)
  return text
}
const evaluate = async (fn) => JSON.parse(await command(`eval (${fn.toString()})()`))
const until = async (fn) => {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(fn)) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`Timed out: ${fn}`)
}
assert.equal(JSON.parse(await command("main app.getPath('userData')")), resolve(data))
if (await evaluate(() => !!document.fullscreenElement)) await command('eval document.exitFullscreen()')
await until(() => !document.fullscreenElement)
await command(`main BrowserWindow.getAllWindows()[0].webContents.send('open-project', {path:${JSON.stringify(resolve(project))}})`)
await until(() => document.querySelector('.study-player video')?.readyState >= 2)
assert((await evaluate(() => document.querySelector('video').duration)) > 20)
const atTen = () => evaluate(() => {
  const video = document.querySelector('video')
  video.pause()
  video.currentTime = 10
  return true
})
const time = () => evaluate(() => document.querySelector('video').currentTime)
const near = (actual, expected) => assert(Math.abs(actual - expected) < 0.1, `${actual} should be ${expected}`)
for (const selector of ['.study-player', '.study-play', '.study-skip', '.study-volume button', '.study-current-chapter', '.study-seek input']) {
  await atTen()
  await command(`eval document.querySelector(${JSON.stringify(selector)}).focus()`)
  await command('press ArrowRight')
  near(await time(), 15)
  await command('press ArrowLeft')
  near(await time(), 10)
}
// Rapid seeking reads the actual playhead, rather than a React render's older value.
await command('press ArrowRight')
await command('press ArrowRight')
near(await time(), 20)
await evaluate(() => { document.querySelector('video').currentTime = 2; return true })
await command('press ArrowLeft')
near(await time(), 0)

await atTen()
await evaluate(() => {
  const video = document.querySelector('video')
  video.volume = 0.5
  video.muted = false
  return true
})
await until(() => Number(document.querySelector('.study-volume input').value) === 0.5)
await evaluate(() => { document.querySelector('.study-volume input').focus(); return true })
await command('press ArrowLeft')
near(await time(), 10)
near(await evaluate(() => Number(document.querySelector('.study-volume input').value)), 0.45)

await evaluate(() => { document.querySelector('#study-assistant [role="tab"]:first-of-type').focus(); return true })
await command('press End')
await until(() => document.querySelector('#study-assistant [role="tab"]:last-child').getAttribute('aria-selected') === 'true')
await command('fill .composer-input Keep this draft')
await command('press ArrowLeft')
near(await time(), 10)
assert.equal(await evaluate(() => document.querySelector('.composer-input').value), 'Keep this draft')
// A macOS pointer click must transfer playback shortcuts out of the chat composer.
await command('mouse .study-player video')
await evaluate(() => { document.querySelector('video').pause(); document.querySelector('video').currentTime = 10; return true })
assert.equal(await evaluate(() => document.activeElement === document.querySelector('.study-player')), true)
await command('press ArrowRight')
near(await time(), 15)

await atTen()
await command('mouse .study-current-chapter')
await until(() => !!document.querySelector('dialog[open]'))
await command('press ArrowRight')
near(await time(), 10)
await command('press Escape')
await until(() => !document.querySelector('dialog[open]'))
await command('mouse .study-rate')
await until(() => !!document.querySelector('.study-speed-menu:popover-open'))
await command('press ArrowLeft')
near(await time(), 10)
await command('press Escape')
await until(() => !document.querySelector(':popover-open'))

await command('mouse .study-control-row > button:last-child')
await until(() => !!document.fullscreenElement)
assert.equal(await evaluate(() => getComputedStyle(document.querySelector('.titlebar')).getPropertyValue('-webkit-app-region')), 'no-drag')
for (const appearance of ['dark', 'light']) {
  await command(`eval window.studio.setSettings({appearance:'${appearance}'})`)
  // Finish the appearance transition and reveal the fullscreen toolbar.
  await new Promise((r) => setTimeout(r, 600))
  await atTen()
  await evaluate(() => { document.querySelector('.study-play').focus(); return true })
  await command('press ArrowRight')
  near(await time(), 15)
  await command('press ArrowLeft')
  near(await time(), 10)
  await command(`ss study-keyboard-${appearance}`)
}
await evaluate(() => { document.querySelector('.study-player').focus(); return true })
await command('press f')
await until(() => !document.fullscreenElement)
assert.equal(await evaluate(() => document.querySelector('.composer-input').value), 'Keep this draft')
console.log('Passed: five-second seeking on player/buttons/timeline, repeated keys, start clamp, chat/volume/menu isolation, pointer focus from chat, fullscreen and both themes.')
