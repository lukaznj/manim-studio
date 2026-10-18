// Run against scripts/drive.mjs with an isolated STUDIO_USER_DATA profile.
// Reproduces a slow Google catalog completing after the user selects OpenAI.
import assert from 'node:assert/strict'
import { resolve } from 'node:path'

const data = process.env.STUDIO_USER_DATA
if (!data) throw new Error('Set STUDIO_USER_DATA to the isolated driver profile.')
const command = async (text) => {
  const response = await fetch(`http://127.0.0.1:${process.env.DRIVE_PORT ?? 7357}`, { method: 'POST', body: text })
  const out = await response.text()
  if (!response.ok || /^(ERROR:|Error:|NOT_FOUND)/.test(out)) throw new Error(out)
  return out
}
const evaluate = async (fn) => JSON.parse(await command(`eval (${fn.toString()})()`))
const main = async (fn) => JSON.parse(await command(`main (${fn.toString()})()`))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
assert.equal(await main(() => app.getPath('userData')), resolve(data))
await main(() => {
  const fs = process.getBuiltinModule('fs')
  const settings = () => JSON.parse(fs.readFileSync(app.getPath('userData') + '/settings.json', 'utf8'))
  for (const name of ['claudeStatus', 'claudeUsage', 'chatModels', 'setupStatus', 'pickPdfs', 'planSeries']) ipcMain.removeHandler(name)
  globalThis.seriesModelTest = { fail: false, requests: [], plan: null }
  ipcMain.handle('claudeStatus', (_event, agent) => ({ agent: agent ?? settings().agent, loggedIn: true, method: 'account' }))
  ipcMain.handle('claudeUsage', () => null)
  ipcMain.handle('chatModels', async (_event, requested) => {
    const agent = requested ?? settings().agent
    globalThis.seriesModelTest.requests.push(agent)
    await new Promise((r) => setTimeout(r, agent === 'antigravity' ? 2000 : 150))
    if (globalThis.seriesModelTest.fail) throw new Error('Test catalog unavailable')
    return agent === 'codex'
      ? [
          { value: '', label: 'Default (Codex chooses)', efforts: ['medium', 'high'], description: 'OpenAI test catalog' },
          { value: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', efforts: ['medium', 'high'], description: '' },
        ]
      : agent === 'antigravity'
        ? [
            { value: '', label: 'Default (Gemini 4 Argon)', efforts: ['medium'], description: '' },
            { value: 'gemini-4-argon', label: 'Gemini 4 Argon', efforts: ['medium'], description: '' },
          ]
        : [{ value: 'claude-sonnet-5-5', label: 'Sonnet 5.5', efforts: ['high'], description: '' }]
  })
  ipcMain.handle('setupStatus', () => ({
    pixi: true,
    env: 'ready',
    latex: 'ready',
    omnivoice: 'ready',
    transcribe: 'missing',
    codex: 'ready',
    antigravity: 'ready',
    errors: {},
  }))
  ipcMain.handle('pickPdfs', () => ['test-material.pdf'])
  ipcMain.handle('planSeries', (_event, request) => {
    globalThis.seriesModelTest.plan = { ...request, agent: settings().agent }
    return { title: request.title, bible: 'Test', episodes: [{ title: 'Test', summary: 'Test', sources: [] }] }
  })
  return true
})
await evaluate(async () => {
  await window.studio.setSettings({
    agent: 'antigravity',
    antigravityModel: '',
    codexModel: '',
    codexEffort: 'high',
    mode: 'learn',
    onboardingDone: true,
    uiLanguage: 'en',
    appearance: 'dark',
    defaultVoice: { provider: 'omnivoice', language: 'en' },
    developerMode: false,
  })
  return true
})
await command('eval location.reload()')
await sleep(180)
await command('click button[title=Settings]')
await command('click-text Codex')
await sleep(250)
await command('click dialog[open] .modal-head .icon-btn')
await sleep(250)
await command('click .home-actions button')
await command('click-text New course')
await sleep(2300)
const options = () => evaluate(() => [...document.querySelectorAll('dialog[open] select[aria-label=Model] option')].map((o) => o.textContent))
assert.deepEqual(await options(), ['Default (Codex chooses)', 'GPT-6.1 Sol'])
assert.match(await command('text dialog[open]'), /Model · Codex · OpenAI/)
await command('fill #series-title Provider selection check')
await command('click-text Add PDFs')
await evaluate(() => {
  const select = document.querySelector('dialog[open] select[aria-label=Model]')
  select.value = 'gpt-6.1-sol'
  select.dispatchEvent(new Event('change', { bubbles: true }))
  return true
})
console.log(await command('ss series-openai-dark'))
await evaluate(async () => {
  await window.studio.setSettings({ appearance: 'light' })
  return true
})
await sleep(200)
console.log(await command('ss series-openai-light'))
await command('click-text Plan the episodes')
await sleep(250)
const request = await main(() => globalThis.seriesModelTest.plan)
assert.equal(request.agent, 'codex')
assert.equal(request.model, 'gpt-6.1-sol')
assert.equal(request.effort, 'high')
await command('click dialog[open] .modal-head .icon-btn')
await sleep(250)
await command('click button[title=Settings]')
await sleep(200)
assert.deepEqual(await options(), ['Default (Codex chooses)', 'GPT-6.1 Sol'])
await command('click dialog[open] .modal-head .icon-btn')
await sleep(250)
await main(() => {
  globalThis.seriesModelTest.fail = true
  return true
})
await command('click .home-actions button')
await command('click-text New course')
await sleep(250)
assert.match(await command('text dialog[open]'), /Test catalog unavailable/)
await command('fill #series-title Keep this title')
await command('click-text Add PDFs')
assert.equal(
  await evaluate(() => [...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent.includes('Plan the episodes')).disabled),
  true,
)
await main(() => {
  globalThis.seriesModelTest.fail = false
  return true
})
await command('click-text Retry')
await sleep(250)
assert.deepEqual(await options(), ['Default (Codex chooses)', 'GPT-6.1 Sol'])
assert.equal(await evaluate(() => document.querySelector('#series-title').value), 'Keep this title')
assert.match(await command('text dialog[open]'), /test-material.pdf/)
assert.equal(
  await evaluate(() => [...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent.includes('Plan the episodes')).disabled),
  false,
)
const requestedAgents = await main(() => globalThis.seriesModelTest.requests)
assert(requestedAgents.includes('antigravity') && requestedAgents.includes('codex'), 'Both provider requests must run to exercise the race')
console.log(
  'Passed: delayed Google response cannot replace OpenAI models in series or Settings; chosen model reaches planning; catalog errors block planning and retry preserves the form.',
)
