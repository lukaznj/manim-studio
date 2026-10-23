// Real media in an isolated driver profile; no generation or account calls are needed.
// Set STUDIO_USER_DATA and STUDIO_FIXTURE_COURSE to disposable test fixture paths.
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

const data = process.env.STUDIO_USER_DATA
const source = process.env.STUDIO_FIXTURE_COURSE
assert(data && source, 'Set STUDIO_USER_DATA and STUDIO_FIXTURE_COURSE.')
const command = async (body) => {
  const response = await fetch(`http://127.0.0.1:${process.env.DRIVE_PORT ?? 7357}`, { method: 'POST', body })
  const result = await response.text()
  if (!response.ok || /^(ERROR:|Error:|NOT_FOUND)/.test(result)) throw new Error(result)
  return result
}
const evaluate = async (fn) => JSON.parse(await command(`eval (${fn.toString()})()`))
const main = async (fn) => JSON.parse(await command(`main (${fn.toString()})()`))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, label) => {
  for (let i = 0; i < 60; i++) {
    if (await evaluate(fn)) return
    await sleep(100)
  }
  throw new Error(`Timed out: ${label}`)
}
const json = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2))
assert.equal(await main(() => app.getPath('userData')), resolve(data))
const root = join(dirname(data), 'projects', `playback-course-${Date.now()}`)
mkdirSync(root, { recursive: true })
const course = JSON.parse(readFileSync(join(source, 'series.json'), 'utf8'))
const dirs = course.episodes.slice(0, 3).map((name, i) => {
  const from = join(source, name),
    dir = join(root, `${i + 1}-lesson`)
  cpSync(from, dir, { recursive: true, filter: (path) => basename(path) !== '.git' })
  const meta = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'))
  meta.series = { ...meta.series, folder: root, episode: i + 1, of: 3 }
  json(join(dir, 'project.json'), meta)
  const timelineFile = join(dir, '.studio/preview/timeline.json')
  const timeline = readFileSync(timelineFile, 'utf8').replaceAll(JSON.stringify(from).slice(1, -1), JSON.stringify(dir).slice(1, -1))
  writeFileSync(timelineFile, timeline)
  return dir
})
json(join(root, 'series.json'), { ...course, plan: { ...course.plan, episodes: course.plan.episodes.slice(0, 3) }, episodes: dirs.map((dir) => basename(dir)) })
await main(() => {
  for (const name of ['claudeStatus', 'claudeUsage', 'chatModels']) ipcMain.removeHandler(name)
  ipcMain.handle('claudeStatus', () => ({ loggedIn: true, method: 'account', agent: 'codex' }))
  ipcMain.handle('claudeUsage', () => null)
  ipcMain.handle('chatModels', () => [])
  return true
})
await command(
  `eval window.studio.setSettings(${JSON.stringify({ mode: 'learn', onboardingDone: true, uiLanguage: 'en', appearance: 'dark', recentProjects: dirs, projectsDir: root, studyAutoplay: false, studyPlaybackRate: 1 })})`,
)
const open = async () => {
  await command('eval location.reload()')
  await sleep(500)
  await until(() => !!document.querySelector('.series-card'), 'home course')
  await command('click .series-card')
  await until(() => document.querySelector('video')?.duration > 8, 'video metadata')
}
const lesson = async (index) => {
  await command(`eval document.querySelectorAll('.study-library-content .ex-row')[${index}].click()`)
  await sleep(400)
  await until(() => document.querySelector('video')?.duration > 8, 'selected lesson')
}
const seek = async (seconds) => {
  await command(`eval document.querySelector('video').currentTime = ${seconds}`)
  await sleep(180)
}
await open()
assert.equal(await evaluate(() => document.querySelector('[role="switch"][aria-label="Autoplay next lesson"]').getAttribute('aria-checked')), 'false')
await seek(2.25)
await lesson(1)
await seek(4.25) // Automatic handoff must start at zero even when this lesson has old progress.
await lesson(0)
assert(Math.abs((await evaluate(() => document.querySelector('video').currentTime)) - 2.25) < 0.15, 'Resume positions below three seconds')
await seek(7.25)
await open()
assert(Math.abs((await evaluate(() => document.querySelector('video').currentTime)) - 7.25) < 0.15, 'Resume near the end survives renderer restart')
assert(await evaluate(() => document.querySelector('video').paused), 'Manual open resumes paused')
// Re-export under a different filename: the project, rather than the old media URL, owns history.
const original = await command(`eval window.studio.watchDetail(${JSON.stringify(dirs[0])})`).then(JSON.parse)
const replacement = original.video.replace(/\.mp4$/, '-new.mp4')
cpSync(original.video, replacement)
if (original.vtt) cpSync(original.vtt, replacement.replace(/\.mp4$/, '.hr.vtt'))
await open()
assert((await evaluate(() => document.querySelector('video').src)).includes('-new.mp4'))
assert(Math.abs((await evaluate(() => document.querySelector('video').currentTime)) - 7.25) < 0.15, 'Re-export retains project resume position')
console.log('Resume: short positions, near-end positions, app reload and a renamed export passed.')

await command('click button[aria-label="Playback speed"]')
await until(() => !!document.querySelector('.study-speed-menu:popover-open'), 'speed menu opens')
await command('press ArrowDown')
await command('press Enter')
await sleep(180)
assert.equal(await evaluate(() => document.querySelector('video').playbackRate), 1.25)
assert.equal(await evaluate(() => document.activeElement.classList.contains('study-player')), true, 'Choosing speed returns keyboard control to playback')
await command('click button[aria-label="Playback speed"]')
await command('ss study-speed-dark')
await command('press Escape')
await command("eval window.studio.setSettings({appearance:'light'})")
await sleep(650)
await command('click button[aria-label="Playback speed"]')
await command('ss study-speed-light')
await command('press Escape')
await command('size 1100 760')
await command('ss study-playback-compact')
assert(
  await evaluate(() => {
    const bar = document.querySelector('.study-player-toolbar').getBoundingClientRect()
    return [...document.querySelectorAll('.study-control-row > button')].every((button) => {
      const rect = button.getBoundingClientRect()
      return rect.left >= bar.left && rect.right <= bar.right
    })
  }),
  'Controls fit at minimum window width',
)
await open()
assert.equal(await evaluate(() => document.querySelector('video').playbackRate), 1.25, 'Speed persists after restart')
await seek(8.5)
await command('click button[aria-label="Play video"]')
await until(() => document.querySelector('video')?.ended, 'autoplay off stops at end')
assert.equal(await evaluate(() => document.querySelector('.study-library-content .ex-row[aria-current="true"] .ex-num').textContent), '1')
await open()
assert.equal(await evaluate(() => document.querySelector('video').currentTime), 0, 'Completed lesson reopens at beginning')
await command('click button[aria-label="Autoplay next lesson"]')
await sleep(150)
assert.equal(await evaluate(() => document.querySelector('[role="switch"]').getAttribute('aria-checked')), 'true')
await seek(8)
await command('click button[aria-label="Play video"]')
await command('click-text Go deeper')
await until(() => document.querySelector('video')?.ended, 'finish with a follow-up draft open')
assert(await evaluate(() => !!document.querySelector('dialog[open]')), 'Autoplay does not close a follow-up draft')
assert.equal(await evaluate(() => document.querySelector('.ex-detail .eyebrow').textContent.trim()), 'Lesson 1')
await command('click-text Cancel')
await sleep(200)
await command('mouse button[aria-label="Full screen"]')
await until(() => !!document.fullscreenElement, 'fullscreen')
await evaluate(() => {
  window.playbackRoot = document.querySelector('.study-player')
  return true
})
await command('click button[aria-label="Playback speed"]')
await sleep(100)
assert(
  await evaluate(() => {
    const menu = document.querySelector('.study-speed-menu')
    const rect = menu.getBoundingClientRect()
    return menu.matches(':popover-open') && menu.contains(document.elementFromPoint(rect.x + 20, rect.y + 20))
  }),
  'Speed menu is visible in fullscreen top layer',
)
await command('press Escape')
assert(await evaluate(() => !!document.fullscreenElement), 'First Escape dismisses speed menu without leaving fullscreen')
for (const number of [2, 3]) {
  await seek(8.5)
  await command('click button[aria-label="Play video"]')
  await command(
    `eval new Promise(resolve => { const timer = setInterval(() => { if (document.querySelector('.ex-detail .eyebrow')?.textContent.trim() === 'Lesson ${number}' && !document.querySelector('video')?.paused) { clearInterval(timer); resolve(true) } }, 50); setTimeout(() => {clearInterval(timer);resolve(false)}, 5000) })`,
  ).then((result) => assert.equal(JSON.parse(result), true, `Autoplay starts lesson ${number}`))
  assert(
    await evaluate(() => document.fullscreenElement === window.playbackRoot && document.querySelector('.study-player') === window.playbackRoot),
    'Autoplay preserves the fullscreen player DOM',
  )
  assert((await evaluate(() => document.querySelector('video').currentTime)) < 2, 'Next lesson starts at beginning')
  await command('click button[aria-label="Pause video"]')
}
await seek(8.5)
await command('click button[aria-label="Play video"]')
await until(() => document.querySelector('video')?.ended, 'last lesson stops')
assert.equal(await evaluate(() => document.querySelector('.ex-detail .eyebrow').textContent.trim()), 'Lesson 3')
await command('press Escape')
await until(() => !document.fullscreenElement, 'exit fullscreen')
await open()
assert.equal(await evaluate(() => document.querySelector('[role="switch"]').getAttribute('aria-checked')), 'true', 'Autoplay preference persists')
const logs = await command('logs')
assert(!logs.includes('[pageerror]'), logs)
console.log('Speed: keyboard selection, saved preference, light/dark themes, compact layout and fullscreen popover passed.')
console.log('Autoplay: off by default, completion handling, ordered playback, last-episode stop and fullscreen continuity passed.')
console.log(JSON.stringify({ root, dirs }))
