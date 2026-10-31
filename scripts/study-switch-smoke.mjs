// Run with scripts/drive.mjs and an isolated profile containing an exported fixture course.
// Delay lesson details so transient placeholders and metadata layout shifts are measurable.
import assert from 'node:assert/strict'
import { resolve } from 'node:path'

const data = process.env.STUDIO_USER_DATA
if (!data) throw new Error('Set STUDIO_USER_DATA to an isolated fixture profile.')
const command = async (body) => {
  const response = await fetch(`http://127.0.0.1:${process.env.DRIVE_PORT ?? 7357}`, { method: 'POST', body })
  const result = await response.text()
  if (!response.ok || /^(ERROR:|Error:|NOT_FOUND)/.test(result)) throw new Error(result)
  return result
}
const evaluate = async (fn) => JSON.parse(await command(`eval (${fn.toString()})()`))
const main = async (fn) => JSON.parse(await command(`main (${fn.toString()})()`))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function assertFullscreenControls() {
  assert(
    (await evaluate(() => document.querySelector('.study-player-toolbar').getBoundingClientRect().height)) < 90,
    'Fullscreen toolbar should be one compact row',
  )
  const buttons = await evaluate(() =>
    [...document.querySelectorAll('.study-control-row > button, .study-volume > button')].map((button) => {
      const rect = button.getBoundingClientRect()
      const toolbar = button.closest('.study-player-toolbar')
      return {
        label: button.getAttribute('aria-label'),
        visible: Number(getComputedStyle(toolbar).opacity) === 1 && rect.top >= 0 && rect.bottom <= innerHeight,
        clickable: button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)),
      }
    }),
  )
  assert(buttons.length >= 6 && buttons.every((button) => button.visible && button.clickable), JSON.stringify(buttons))
}
assert.equal(await main(() => app.getPath('userData')), resolve(data))
await main(() => {
  const original = ipcMain._invokeHandlers.get('watchDetail')
  ipcMain.removeHandler('watchDetail')
  ipcMain.handle('watchDetail', async (...args) => {
    await new Promise((r) => setTimeout(r, 450))
    return original(...args)
  })
  return true
})
await command('click .series-card')
await sleep(650)
for (const appearance of ['dark', 'light']) {
  await command(`eval window.studio.setSettings({appearance:'${appearance}'})`)
  await sleep(600) // Let the separate theme crossfade finish before measuring lesson navigation.
  for (const target of [1, 0, 2, 0]) {
    const recording = command(`eval (async () => {
      const samples = []
      const initial = document.querySelector('.study-player').getBoundingClientRect()
      const content = document.querySelector('.study-content')
      document.querySelectorAll('.study-library-content .ex-row')[${target}].click()
      const start = performance.now()
      while (performance.now() - start < 850) {
        await new Promise(requestAnimationFrame)
        const player = document.querySelector('.study-player')
        const rect = player?.getBoundingClientRect()
        samples.push({height:rect?.height ?? 0, top:rect?.top ?? 0,
          muteLeft:document.querySelector('button[aria-label="Mute"]').getBoundingClientRect().left,
          transform:getComputedStyle(document.querySelector('.study-content')).transform,
          sameContent:content === document.querySelector('.study-content')})
      }
      return {initial:{height:initial.height,top:initial.top},samples,
        title:document.querySelector('.ex-detail h1').textContent,
        src:document.querySelector('video')?.src}
    })()`)
    if (target === 1) {
      await sleep(180)
      await command(`ss study-switch-${appearance}`)
    }
    const result = JSON.parse(await recording)
    assert(result.samples.length > 5)
    assert(
      result.samples.every((s) => s.height > 0),
      `Player disappeared: ${appearance}, lesson ${target + 1}`,
    )
    const heights = result.samples.map((s) => s.height)
    assert(Math.max(...heights) - Math.min(...heights) < 1, `Player height jumped: ${JSON.stringify(result)}`)
    assert(Math.abs(result.initial.height - heights[0]) < 1, 'Player shrank while lesson details loaded')
    assert(
      result.samples.every((s) => s.sameContent && s.transform === 'none'),
      'The whole content pane remounted or moved',
    )
    assert(
      result.samples.every((s) => Math.abs(s.top - result.initial.top) < 1),
      'Player moved below the heading',
    )
    const mutePositions = result.samples.map((s) => s.muteLeft)
    assert(Math.max(...mutePositions) - Math.min(...mutePositions) < 1, 'Controls moved when subtitles loaded')
    console.log(`Stable ${appearance} switch to lesson ${target + 1}: ${heights[0].toFixed(1)}px player, ${result.samples.length} frames`)
  }
}
console.log('Passed: repeated lesson switches keep the player and content geometry stable while details and video metadata load, in both themes.')
assert.equal(await evaluate(() => !!document.querySelector('.study-controls button[aria-label="Show video file"]')), false)
assert.equal(await evaluate(() => !!document.querySelector('.study-chapter-bar')), false, 'The chapter number/name row must be absent')
assert.equal(await evaluate(() => document.querySelector('video').textTracks[0].mode), 'showing', 'Subtitles must stay enabled when their track arrives')
await command('click button[aria-label="Browse chapters"]')
await sleep(100)
await command('click dialog[open] .study-chapter-item:nth-child(2)')
await sleep(250)
assert((await evaluate(() => document.querySelector('video').currentTime)) >= 3, 'The compact Chapters button must retain chapter seeking')
await evaluate(() => {
  const video = document.querySelector('video')
  video.pause()
  video.currentTime = 0.5
  return true
})
await command('mouse button[aria-label="Full screen"]')
await sleep(200)
assert.equal(await evaluate(() => !!document.fullscreenElement), true)
await assertFullscreenControls()
await command('ss study-fullscreen-controls')
assert.equal(await evaluate(() => document.activeElement === document.querySelector('.study-player')), true, 'Fullscreen must focus the player')
await command('press Space')
assert.equal(await evaluate(() => document.querySelector('video').paused), false)
assert.equal(await evaluate(() => !!document.fullscreenElement), true, 'Space must play instead of exiting fullscreen')
await sleep(2500)
assert.equal(
  await evaluate(() => document.querySelector('.study-player').classList.contains('controls-hidden')),
  true,
  'Fullscreen controls must hide when idle',
)
assert.equal(await evaluate(() => getComputedStyle(document.querySelector('video')).cursor), 'none', 'The idle cursor must hide')
await command('ss study-fullscreen-idle')
await evaluate(() => {
  document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
  return true
})
await sleep(250)
assert.equal(await evaluate(() => document.querySelector('.study-player').classList.contains('controls-hidden')), false, 'Mouse movement must reveal controls')
await assertFullscreenControls()
await command('press Space')
assert.equal(await evaluate(() => document.querySelector('video').paused), true)
assert.equal(await evaluate(() => document.querySelector('.study-player').classList.contains('controls-hidden')), false, 'Paused controls must stay visible')
const beforeSeek = await evaluate(() => document.querySelector('video').currentTime)
await command('press ArrowRight')
assert(Math.abs((await evaluate(() => document.querySelector('video').currentTime)) - beforeSeek - 5) < 0.1)
await command('press ArrowLeft')
assert(Math.abs((await evaluate(() => document.querySelector('video').currentTime)) - beforeSeek) < 0.1)
await command('mouse .study-controls button[aria-label="Play video"]')
await main(async () => {
  const target = BrowserWindow.getAllWindows()[0].webContents
  target.debugger.attach('1.3')
  await target.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 400, y: 200 })
  target.debugger.detach()
  return true
})
await sleep(2500)
assert.equal(
  await evaluate(() => document.querySelector('.study-player').classList.contains('controls-hidden')),
  true,
  'A clicked play button must not prevent idle hiding',
)
assert.equal(
  await evaluate(() => document.activeElement === document.querySelector('.study-player')),
  true,
  'Hidden pointer-activated buttons must release focus',
)
await command('press Space')
await command('mouse button[aria-label="Exit full screen"]')
await sleep(200)
assert.equal(await evaluate(() => !!document.fullscreenElement), false)
assert.equal(await evaluate(() => document.activeElement === document.querySelector('.study-player')), true, 'Exiting fullscreen must focus the player')
await command('press Space')
assert.equal(await evaluate(() => document.querySelector('video').paused), false)
await command('press Space')
console.log(
  'Passed: fullscreen keyboard focus, immediate Space/arrow shortcuts, idle controls/cursor hiding, pointer wake-up, pause visibility, and removed file button.',
)
