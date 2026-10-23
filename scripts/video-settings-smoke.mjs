// Run with scripts/drive.mjs and an isolated STUDIO_USER_DATA profile.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const data = process.env.STUDIO_USER_DATA
if (!data) throw new Error('Set STUDIO_USER_DATA to an isolated fixture profile.')
const command = async (body) => {
  const response = await fetch(`http://127.0.0.1:${process.env.DRIVE_PORT ?? 7357}`, { method: 'POST', body })
  const result = await response.text()
  if (!response.ok || /^(ERROR:|Error:|NOT_FOUND)/.test(result)) throw new Error(result)
  return result
}
const evaluate = async (fn) => JSON.parse(await command(`eval (${fn.toString()})()`))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
assert.equal(JSON.parse(await command('main app.getPath("userData")')), resolve(data))
const name = `Video settings check ${Date.now()}`
const dir = JSON.parse(
  await command(
    `eval window.studio.createProject(${JSON.stringify({ name, aspect: '16:9', theme: 'dark', language: 'en', scriptFirst: false, parentDir: join(dirname(data), 'video-settings-projects') })})`,
  ),
)
const metaFile = join(dir, 'project.json')
const meta = JSON.parse(readFileSync(metaFile, 'utf8'))
assert.equal(meta.scriptFirst, true, 'An old caller must not disable scripting for a new project')
// Simulate an older project whose user had disabled scripting.
writeFileSync(metaFile, JSON.stringify({ ...meta, scriptFirst: false }))
for (const [mode, uiLanguage, appearance] of [
  ['create', 'en', 'dark'],
  ['learn', 'en', 'light'],
  ['create', 'hr', 'light'],
]) {
  await command(
    `eval window.studio.setSettings(${JSON.stringify({ mode, homeTab: mode, uiLanguage, appearance, projectsDir: dirname(dir), recentProjects: [dir], onboardingDone: true })})`,
  )
  await command('eval location.reload()')
  await sleep(500)
  await command(`click-text ${name}`)
  await sleep(400)
  if (mode === 'create') {
    await command(`click-text ${uiLanguage === 'hr' ? 'Scenarij' : 'Script'}`)
    const text = await command('text .script-pane')
    assert.doesNotMatch(text, /Script first is off|Planiranje scenarija isključeno/)
    assert.match(text, uiLanguage === 'hr' ? /agent ovdje prvo izrađuje scenarij/ : /the agent plans it here first/)
  }
  await command(`click button[title="${uiLanguage === 'hr' ? 'Postavke' : 'Settings'}"]`)
  await command('click .settings-tabs button:nth-of-type(4)')
  await sleep(150)
  const rows = await evaluate(() => [...document.querySelectorAll('.settings-body .set-row-title')].map((el) => el.textContent))
  assert(!rows.some((row) => /Script first|Najprije scenarij|Background picture|Pozadinska slika/.test(row)), JSON.stringify(rows))
  assert(
    rows.some((row) => /Background colour|Boja pozadine/.test(row)),
    'Colour controls should still be present',
  )
  await command(`ss video-settings-${mode}-${uiLanguage}`)
  await command('press Escape')
  await sleep(250)
  if (mode === 'create') {
    await command('press Control+n')
    await sleep(200)
    const form = await command('text dialog[open]')
    assert.doesNotMatch(form, /Plan a script first|Najprije isplaniraj scenarij/)
    await command('press Escape')
  }
  console.log(`Passed ${mode}/${uiLanguage}: removed settings, legacy Script tab, and new-project form.`)
}
console.log(
  'Passed: script-first is required for new projects even for old callers; legacy projects keep the script workflow and the removed preferences are absent in Learn/Create and English/Croatian.',
)
