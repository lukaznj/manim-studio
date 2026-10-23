// Run after launching scripts/drive.mjs with a fresh, isolated profile.
// STUDIO_FIXTURE_PROJECT supplies a disposable project with a rendered timeline.
import assert from 'node:assert/strict'
import { resolve } from 'node:path'

const data = process.env.STUDIO_USER_DATA
const project = process.env.STUDIO_FIXTURE_PROJECT
assert(data && project, 'Set STUDIO_USER_DATA and STUDIO_FIXTURE_PROJECT to isolated fixture paths.')
const command = async (body) => {
  const response = await fetch(`http://127.0.0.1:${process.env.DRIVE_PORT ?? 7357}`, { method: 'POST', body })
  const result = await response.text()
  if (!response.ok || /^(ERROR:|Error:|NOT_FOUND)/.test(result)) throw new Error(result)
  return result
}
const evaluate = async (fn) => JSON.parse(await command(`eval (${fn.toString()})()`))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
assert.equal(JSON.parse(await command('main app.getPath("userData")')), resolve(data))
const initial = await evaluate(() => window.studio.getSettings())
assert.equal(initial.previewSize, 1080, 'Fresh preview preference defaults to 1080p')
assert.equal(initial.studySize, 1080, 'Fresh export preference defaults to 1080p')
for (const [mode, appearance] of [
  ['learn', 'light'],
  ['create', 'dark'],
  ['both', 'light'],
]) {
  await command(`eval window.studio.setSettings(${JSON.stringify({ mode, homeTab: 'create', uiLanguage: 'en', appearance, onboardingDone: true })})`)
  await command('eval location.reload()')
  await sleep(600)
  await command('click button[title="Settings"]')
  await command('click .settings-tabs button:nth-of-type(4)')
  await sleep(180)
  assert.equal(await evaluate(() => document.querySelector('[aria-label="Study videos"] [aria-checked="true"]').textContent.trim()), '1080p')
  if (mode !== 'learn') {
    assert.equal(await evaluate(() => document.querySelector('[aria-label="Preview resolution"] [aria-checked="true"]').textContent.trim()), '1080p')
  } else {
    assert.equal(await evaluate(() => !!document.querySelector('[aria-label="Preview resolution"]')), false)
  }
  await command(`ss render-defaults-${mode}-${appearance}`)
  await command('press Escape')
  await sleep(200)
  await command(`main BrowserWindow.getAllWindows()[0].webContents.send('menu',${JSON.stringify({ action: 'open-recent', path: project })})`)
  await sleep(600)
  await command('main BrowserWindow.getAllWindows()[0].webContents.send("menu",{action:"export"})')
  await sleep(180)
  assert.equal(await evaluate(() => document.querySelector('[aria-label="Resolution"] [aria-checked="true"]').textContent.trim()), '1080p')
  await command(`ss export-default-${mode}-${appearance}`)
  await command('press Escape')
  await sleep(180)
}
// Deliberate lower quality preferences still survive a mode change and reload.
await command('eval window.studio.setSettings({previewSize:720,studySize:720,mode:"learn"})')
await command('eval location.reload()')
await sleep(600)
assert.equal((await evaluate(() => window.studio.getSettings())).previewSize, 720)
await command('click button[title="Settings"]')
await command('click .settings-tabs button:nth-of-type(4)')
await sleep(150)
assert.equal(await evaluate(() => document.querySelector('[aria-label="Study videos"] [aria-checked="true"]').textContent.trim()), '720p')
await command('press Escape')
await command('eval window.studio.setSettings({previewSize:1080,studySize:1080})')
assert(!(await command('logs')).includes('[pageerror]'))
console.log(
  '1080p defaults: preview/export preferences, Settings and the export dialog passed in Learn, Create and Both. Explicit lower-quality preferences are retained.',
)
