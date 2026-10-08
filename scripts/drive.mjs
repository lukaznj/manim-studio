// Drives the built app for screenshots and smoke checks (agents and humans alike).
//   npm run build && node scripts/drive.mjs          # starts a command server on :7357
//   curl -s localhost:7357 -d 'launch'                # then send commands
//   curl -s localhost:7357 -d 'ss home'
// Data goes to an isolated folder (STUDIO_USER_DATA / STUDIO_PROJECTS_DIR), never your real one.
import { _electron as electron } from 'playwright-core'
import { createServer } from 'node:http'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const APP_DIR = resolve(import.meta.dirname, '..')
const DATA = process.env.STUDIO_USER_DATA ?? join(tmpdir(), 'manim-studio-drive', 'data')
const PROJECTS = process.env.STUDIO_PROJECTS_DIR ?? join(tmpdir(), 'manim-studio-drive', 'projects')
const SHOTS = process.env.SCREENSHOT_DIR ?? join(tmpdir(), 'manim-studio-drive', 'shots')
const PORT = Number(process.env.DRIVE_PORT ?? 7357)
for (const d of [DATA, PROJECTS, SHOTS]) mkdirSync(d, { recursive: true })

const bin =
  process.platform === 'darwin'
    ? join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
    : process.platform === 'win32'
      ? join(APP_DIR, 'node_modules/electron/dist/electron.exe')
      : join(APP_DIR, 'node_modules/electron/dist/electron')

let app = null
let page = null
const logs = []

const commands = {
  async launch() {
    if (app) return 'already launched'
    // DRIVE_EXECUTABLE drives a packaged build (e.g. "dist/mac-arm64/Manim Studio.app/Contents/MacOS/Manim Studio").
    app = await electron.launch({
      executablePath: process.env.DRIVE_EXECUTABLE ?? bin,
      args: process.env.DRIVE_EXECUTABLE ? [] : [APP_DIR],
      env: { ...process.env, STUDIO_USER_DATA: DATA, STUDIO_PROJECTS_DIR: PROJECTS },
      colorScheme: null, // Playwright would pin prefers-color-scheme to light; let Settings → Appearance drive it
      timeout: 30_000,
    })
    page = await app.firstWindow()
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
    await page.waitForSelector('.app-main > *', { timeout: 20_000 })
    return `launched: ${page.url()}\ndata: ${DATA}\nprojects: ${PROJECTS}`
  },
  async ss(name) {
    const file = join(SHOTS, `${name || Date.now()}.png`)
    await page.screenshot({ path: file })
    return file
  },
  async click(sel) {
    return page.evaluate((s) => {
      const el = document.querySelector(s)
      if (!el) return 'NOT_FOUND'
      el.click()
      return 'OK'
    }, sel)
  },
  async 'click-text'(text) {
    return page.evaluate((t) => {
      const els = [...document.querySelectorAll('button, a, [role="button"], [role="radio"], article')]
      const el = els.find((e) => e.textContent?.trim() === t) ?? els.find((e) => e.textContent?.includes(t))
      if (!el) return 'NOT_FOUND'
      el.click()
      return `OK: ${el.tagName}`
    }, text)
  },
  /** Real mouse click at an element's centre (for pointer-event handlers). */
  async mouse(sel) {
    const box = await page.locator(sel).first().boundingBox()
    if (!box) return 'NOT_FOUND'
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    return 'OK'
  },
  async drag(arg) {
    const [sel, dx] = arg.split(/\s+(?=-?\d+$)/)
    const box = await page.locator(sel).first().boundingBox()
    if (!box) return 'NOT_FOUND'
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    for (let i = 1; i <= 10; i++) await page.mouse.move(x + (Number(dx) * i) / 10, y)
    await page.mouse.up()
    return 'OK'
  },
  async fill(arg) {
    const [sel, ...rest] = arg.split(' ')
    await page.fill(sel, rest.join(' '))
    return 'OK'
  },
  async type(text) {
    await page.keyboard.type(text, { delay: 20 })
    return 'OK'
  },
  async press(key) {
    await page.keyboard.press(key)
    return 'OK'
  },
  async wait(arg) {
    const [sel, ms] = arg.split(/\s+(?=\d+$)/)
    try {
      await page.waitForSelector(sel, { timeout: Number(ms ?? 15000) })
      return `found ${sel}`
    } catch {
      return `TIMEOUT ${sel}`
    }
  },
  async gone(arg) {
    const [sel, ms] = arg.split(/\s+(?=\d+$)/)
    try {
      await page.waitForSelector(sel, { state: 'detached', timeout: Number(ms ?? 15000) })
      return `gone ${sel}`
    } catch {
      return `STILL THERE ${sel}`
    }
  },
  async sleep(ms) {
    await new Promise((r) => setTimeout(r, Number(ms)))
    return 'OK'
  },
  async eval(expr) {
    return JSON.stringify(await page.evaluate(expr), null, 1)
  },
  /** Evaluate in the main process: `main app.getAppPath()` (electron module members are in scope). */
  async main(expr) {
    return JSON.stringify(await app.evaluate((electron, src) => new Function(...Object.keys(electron), `return (${src})`)(...Object.values(electron)), expr))
  },
  async text(sel) {
    return page.evaluate((s) => (s ? document.querySelector(s) : document.body)?.innerText ?? '(null)', sel || null)
  },
  async size(arg) {
    const [w, h] = arg.split(/\s+/).map(Number)
    await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setSize(w, h), [w, h])
    return 'OK'
  },
  async logs() {
    return logs.splice(0).join('\n') || '(no logs)'
  },
  async quit() {
    await app?.close().catch(() => {})
    app = null
    setTimeout(() => process.exit(0), 100)
    return 'bye'
  },
}

createServer(async (req, res) => {
  let body = ''
  for await (const chunk of req) body += chunk
  const [cmd, ...rest] = body.trim().split(' ')
  let out
  try {
    if (!commands[cmd]) out = `unknown: ${cmd}. commands: ${Object.keys(commands).join(', ')}`
    else if (!page && cmd !== 'launch' && cmd !== 'quit') out = 'launch first'
    else out = await commands[cmd](rest.join(' '))
  } catch (e) {
    out = `ERROR: ${e.message}`
  }
  res.end(String(out) + '\n')
})
  .on('error', (e) => {
    console.error(e.code === 'EADDRINUSE' ? `port ${PORT} is taken (another drive.mjs?); set DRIVE_PORT` : e.message)
    process.exit(1)
  })
  .listen(PORT, '127.0.0.1', () => console.log(`drive: http://127.0.0.1:${PORT}  shots: ${SHOTS}`))
