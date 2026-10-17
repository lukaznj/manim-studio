// Run against scripts/drive.mjs with STUDIO_USER_DATA and STUDIO_FAKE_AGENT=1.
// Authentication/catalog/planning are stand-ins; generation uses the real fake-agent render/export path.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const data = process.env.STUDIO_USER_DATA
if (!data) throw new Error('Set STUDIO_USER_DATA to the isolated driver profile.')
const command = async (text) => {
  const response = await fetch(`http://127.0.0.1:${process.env.DRIVE_PORT ?? 7357}`, { method: 'POST', body: text })
  const out = await response.text()
  if (!response.ok || /^(Error:|NOT_FOUND)/.test(out)) throw new Error(out)
  return out
}
const evaluate = async (fn, arg) => JSON.parse(await command(`eval (${fn.toString()})(${JSON.stringify(arg)})`))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const main = (fn) => command(`main (${fn.toString()})()`)
assert.equal(JSON.parse(await command('main app.getPath("userData")')), resolve(data))
assert.equal(JSON.parse(await command('main !!process.env.STUDIO_FAKE_AGENT')), true)

await main(() => {
  for (const name of [
    'claudeStatus',
    'claudeUsage',
    'chatModels',
    'setupStatus',
    'pickPdfs',
    'planSeries',
    'claudeDesktopStatus',
    'checkElevenLabsKey',
    'elevenLabsUsage',
  ])
    ipcMain.removeHandler(name)
  process.getBuiltinModule('fs').writeFileSync(app.getPath('userData') + '/elevenlabs.secret', 'test-only-not-a-real-key')
  ipcMain.handle('checkElevenLabsKey', () => ({ tts: true, voices: true, user: false }))
  ipcMain.handle('elevenLabsUsage', () => null)
  ipcMain.handle('claudeStatus', async (_event, agent = 'claude') => {
    await new Promise((r) => setTimeout(r, 450))
    return { agent, loggedIn: true, method: 'account', subscription: 'Test account' }
  })
  ipcMain.handle('claudeUsage', () => null)
  ipcMain.handle('chatModels', (_event, agent = 'claude') =>
    agent === 'claude'
      ? [{ value: 'claude-sonnet-5-5', label: 'Sonnet 5.5', efforts: ['medium', 'high'], description: 'Test catalog' }]
      : agent === 'codex'
        ? [
            { value: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', efforts: ['low', 'medium', 'high'], description: 'Test catalog' },
            { value: 'gpt-6-luna', label: 'GPT-6 Luna', efforts: ['low', 'medium', 'high'], description: 'Test catalog' },
          ]
        : [{ value: 'gemini-4-argon', label: 'Gemini 4 Argon', efforts: ['low', 'medium', 'high'], description: 'Test catalog' }],
  )
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
  ipcMain.handle('planSeries', () => ({
    title: 'Developer smoke series',
    bible: 'Synthetic test material',
    episodes: [
      { title: 'Claude episode', summary: 'Synthetic test', sources: [] },
      { title: 'Codex episode', summary: 'Synthetic test', sources: [] },
    ],
  }))
  ipcMain.handle('claudeDesktopStatus', () => ({ installed: false, enabled: false, version: null, current: app.getVersion() }))
  return true
})
await evaluate(async () => {
  await window.studio.setSettings({
    mode: 'learn',
    onboardingDone: true,
    uiLanguage: 'en',
    appearance: 'dark',
    agent: 'claude',
    developerMode: false,
    developerEpisodeModels: false,
    developerUsageMetrics: false,
    developerTimingMetrics: false,
    developerResourceMetrics: false,
    seriesAgents: 4,
    gpuEncoding: 'off',
    defaultVoice: { provider: 'elevenlabs', language: 'en', elevenlabs: { voiceId: 'test-voice' } },
  })
  return true
})
await command('eval location.reload()')
await sleep(900)
await evaluate(async () => {
  await window.studio.stopSeries()
  await new Promise((r) => setTimeout(r, 1000))
  await window.studio.dismissSeries()
  return true
})
await command('click button[title=Settings]')
await command('click-text General')
await sleep(200)
const initial = await evaluate(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  return [...document.querySelectorAll('dialog[open] .settings-body .tabs')].map((group) => {
    const indicator = group.querySelector('.tabs-indicator'),
      selected = group.querySelector('[aria-checked=true]')
    return {
      duration: getComputedStyle(indicator).transitionDuration,
      left: new DOMMatrix(getComputedStyle(indicator).transform).m41,
      selected: selected.offsetLeft,
      width: indicator.getBoundingClientRect().width,
    }
  })
})
assert(
  initial.every((p) => p.duration === '0s' && p.width > 0 && Math.abs(p.left - p.selected) < 1),
  JSON.stringify(initial),
)
await evaluate(() => {
  for (let i = 0; i < 4; i++) document.querySelector('dialog[open] .version-unlock').click()
  return true
})
assert.equal((await evaluate(() => window.studio.getSettings())).developerMode, false)
await command('click .version-unlock')
await sleep(200)
assert.equal((await evaluate(() => window.studio.getSettings())).developerMode, true)
await command('click-text Accounts')
const flashes = await evaluate(async () => {
  const buttons = []
  for (let i = 0; i < 15; i++) {
    buttons.push([...document.querySelectorAll('dialog[open] .account-section button')].some((b) => /Sign in/.test(b.textContent)))
    await new Promise((r) => setTimeout(r, 40))
  }
  return buttons
})
assert(
  flashes.every((value) => !value),
  'Sign in flashed before signed-in status resolved',
)
assert.match(await command('text dialog[open]'), /Sign out/)
const connect = await evaluate(() =>
  [...document.querySelectorAll('dialog[open] .set-row')]
    .find((r) => r.querySelector('.set-row-title')?.textContent === 'Claude Desktop')
    ?.querySelector('button')
    ?.textContent.trim(),
)
assert.equal(connect, 'Connect')
await command('click-text Develop')
await sleep(150)
await evaluate(() => {
  for (const group of document.querySelectorAll('dialog[open] .settings-body .tabs'))
    [...group.querySelectorAll('button')].find((b) => b.textContent === 'On').click()
  return true
})
await sleep(300)
const flags = await evaluate(() => window.studio.getSettings())
assert(flags.developerEpisodeModels && flags.developerUsageMetrics && flags.developerTimingMetrics && flags.developerResourceMetrics)
const animation = await evaluate(async () => {
  const group = document.querySelector('dialog[open] .settings-body .tabs')
  group.querySelector('button').click()
  await new Promise((r) => requestAnimationFrame(r))
  return getComputedStyle(group.querySelector('.tabs-indicator')).transitionDuration
})
assert.notEqual(animation, '0s', 'Actual selection changes should animate')
await evaluate(() => {
  document.querySelectorAll('dialog[open] .settings-body .tabs button')[1].click()
  return true
})
await sleep(250)
console.log(await command('ss develop-dark'))
await evaluate(async () => {
  await window.studio.setSettings({ appearance: 'light' })
  return true
})
await sleep(200)
console.log(await command('ss develop-light'))
await evaluate(async () => {
  await window.studio.setSettings({ appearance: 'dark' })
  return true
})
await command('click dialog[open] .modal-head .icon-btn')
await sleep(300)
await command('click .home-actions button')
await sleep(100)
await command('click-text New course')
await sleep(700)
await command('click-text Add PDFs')
await command('click-text Plan the episodes')
await sleep(800)
const selection = await evaluate(() => {
  const ep = document.querySelectorAll('dialog[open] .series-episode')[1]
  const agent = ep.querySelector('select[aria-label="Episode 2 agent"]')
  agent.value = 'codex'
  agent.dispatchEvent(new Event('change', { bubbles: true }))
  return true
})
assert(selection)
await sleep(150)
await command('ss episode-models')
await evaluate(() => {
  document.querySelector('dialog[open] .series-episode button[aria-label=Later]').click()
  return true
})
await sleep(150)
assert.match(await command('text dialog[open] .series-episode'), /Codex/)
await command('click-text Make all 2 episodes')
let run,
  firstCompleted = false
for (let i = 0; i < 240; i++) {
  run = await evaluate(() => window.studio.seriesRun())
  if (run) {
    assert.equal(run.agents, 1)
    assert.equal(run.episodes[0].assignment.agent, 'codex')
    assert.equal(run.episodes[1].assignment.agent, 'claude')
    if (!['done', 'failed'].includes(run.episodes[0].state)) assert.equal(run.episodes[1].state, 'waiting', 'measured episodes overlapped')
    if (run.episodes[0].state === 'done') firstCompleted = true
    if (run.state === 'done') break
    if (run.episodes.some((e) => e.state === 'failed')) throw new Error(JSON.stringify(run.episodes.map((e) => ({ state: e.state, error: e.error }))))
  }
  await sleep(1000)
}
assert(firstCompleted && run?.state === 'done', 'Measured series did not finish')
for (const ep of run.episodes) {
  assert(existsSync(ep.report))
  const metrics = JSON.parse(readFileSync(join(ep.dir, '.studio/episode-metrics.json'), 'utf8'))
  assert.equal(metrics.selection.model, ep.assignment.model)
  assert(metrics.phases.some((p) => p.name === 'Script') && metrics.phases.some((p) => p.name === 'Export'))
  assert(metrics.resources.length >= 2)
  const usage = JSON.parse(readFileSync(join(ep.dir, '.studio/usage.json'), 'utf8'))
  assert(usage.every((u) => Object.keys(u.models).includes(ep.assignment.model)))
}
assert(existsSync(run.report))
writeFileSync(join(data, 'smoke-result.json'), JSON.stringify(run, null, 2))
console.log(
  'Tab initialization, five-click unlock, account loading, Connect label, assignments, serialization, real fixture renders/exports and HTML report generation passed.',
)
console.log(`Combined report: ${run.report}`)
const reportLayout = JSON.parse(
  await main(async () => {
    const fs = process.getBuiltinModule('fs'),
      path = process.getBuiltinModule('path')
    const result = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'smoke-result.json'), 'utf8'))
    const win = new BrowserWindow({ show: false, width: 1280, height: 1000 })
    try {
      await win.loadFile(result.report)
      const shots = process.env.SCREENSHOT_DIR
      for (const [name, selector, index = 0] of [
        ['report-top', 'h1'],
        ['report-usage', '.chart'],
        ['report-hardware', '.chart', 2],
      ]) {
        await win.webContents.executeJavaScript(`document.querySelectorAll(${JSON.stringify(selector)})[${index}]?.scrollIntoView()`)
        await new Promise((r) => setTimeout(r, 100))
        fs.writeFileSync(path.join(shots, name + '.png'), (await win.capturePage()).toPNG())
      }
      return await win.webContents.executeJavaScript(
        '({ width:innerWidth, scrollWidth:document.documentElement.scrollWidth, charts:document.querySelectorAll(".chart").length })',
      )
    } finally {
      win.destroy()
    }
  }),
)
assert(reportLayout.charts >= 12 && reportLayout.scrollWidth <= reportLayout.width, JSON.stringify(reportLayout))
console.log('Offline report rendered in Electron without horizontal page overflow.')
