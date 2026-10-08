import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session, shell, systemPreferences } from 'electron'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import type { EventChannel, ProjectMeta, Quality } from '../shared/types'
import { chatInterrupt, chatModels, chatReset, chatSend, claudeLogin, claudeLoginCode, claudeLogout, claudeStatus, closeChat, loadChat, onChatEvent } from './claude'
import { install, onSetupEvent, setupStatus } from './env'
import { history, restore } from './git'
import { paths } from './paths'
import * as projects from './projects'
import { cancel, frame, onRenderEvent, render } from './render'
import { runRunner } from './runner'
import { getSettings, setSecret, setSettings } from './settings'
import { checkForUpdates, downloadUpdate, installUpdate, RELEASES_URL, setupUpdater } from './updater'
import { deleteRecording, elevenLabsVoices, onWorkerLog, saveRecording, saveReference, stopTtsWorker, systemVoices } from './voice'

// Isolated data for automated runs (scripts/drive.mjs); never set in normal use.
if (process.env.STUDIO_USER_DATA) app.setPath('userData', process.env.STUDIO_USER_DATA)

protocol.registerSchemesAsPrivileged([
  { scheme: 'studio-media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } },
])

let win: BrowserWindow | null = null
const send = (channel: EventChannel, payload: unknown) => win?.webContents.send(channel, payload)

function createWindow(): void {
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: '#0d1117',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? undefined : { color: '#0d1117', symbolColor: '#c9d1d9', height: 44 },
    trafficLightPosition: { x: 16, y: 15 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
    },
  })
  win.once('ready-to-show', () => win?.show())
  win.on('closed', () => (win = null))
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

/** Local media (renders, recordings, thumbnails) with Range support so <video> can seek. */
function registerMediaProtocol(): void {
  protocol.handle('studio-media', async (req) => {
    const file = decodeURIComponent(new URL(req.url).pathname.slice(1))
    const allowed = [projects.project()?.path, ...getSettings().recentProjects, paths.userData()].filter(Boolean) as string[]
    const full = resolve(file)
    if (!allowed.some((root) => full === resolve(root) || full.startsWith(resolve(root) + sep)) || !existsSync(full)) {
      return new Response('not found', { status: 404 })
    }
    const size = statSync(full).size
    const type = full.endsWith('.mp4') ? 'video/mp4' : full.endsWith('.wav') ? 'audio/wav' : full.endsWith('.mp3') ? 'audio/mpeg' : full.endsWith('.png') ? 'image/png' : 'image/jpeg'
    const range = req.headers.get('range')?.match(/bytes=(\d*)-(\d*)/)
    if (range) {
      const start = range[1] ? Number(range[1]) : 0
      const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
      return new Response(Readable.toWeb(createReadStream(full, { start, end })) as ReadableStream, {
        status: 206,
        headers: { 'Content-Type': type, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' },
      })
    }
    return new Response(Readable.toWeb(createReadStream(full)) as ReadableStream, {
      headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' },
    })
  })
}

function handle(name: string, fn: (...args: never[]) => unknown): void {
  ipcMain.handle(name, (_e, ...args) => fn(...(args as never[])))
}

function registerIpc(): void {
  handle('appInfo', () => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    projectsDir: getSettings().projectsDir,
    releasesUrl: RELEASES_URL,
  }))

  handle('setupStatus', () => setupStatus())
  handle('install', (c: Parameters<typeof install>[0]) => install(c))

  handle('getSettings', () => getSettings())
  handle('setSettings', (patch: Parameters<typeof setSettings>[0]) => setSettings(patch))
  handle('setElevenLabsKey', (key: string) => setSecret('elevenlabs', key.trim()))

  handle('claudeStatus', () => claudeStatus())
  handle('claudeLogin', () => claudeLogin((e) => send('claude-login', e)))
  handle('claudeLoginCode', (code: string) => claudeLoginCode(code))
  handle('claudeLogout', () => claudeLogout())

  handle('listProjects', () => projects.listProjects())
  handle('createProject', (input: Parameters<typeof projects.createProject>[0]) => projects.createProject(input))
  handle('openProject', (path: string) => {
    const opened = projects.openProject(path)
    loadChat(path)
    return opened
  })
  handle('pickProject', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory'], title: 'Otvori projekt (mapa sa scene.py)' })
    const dir = r.filePaths[0]
    if (!dir) return null
    if (!existsSync(join(dir, 'project.json'))) throw new Error('U toj mapi nema project.json — nije Manim Studio projekt.')
    return dir
  })
  handle('pickFolder', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'], title: 'Mapa za projekte' })
    return r.filePaths[0] ?? null
  })
  handle('closeProject', () => {
    closeChat()
    stopTtsWorker()
    cancel('preview')
    projects.closeProject()
  })
  handle('forgetProject', (path: string) => setSettings({ recentProjects: getSettings().recentProjects.filter((p) => p !== path) }))
  handle('reveal', (path: string) => shell.showItemInFolder(path))
  handle('saveScene', (source: string) => projects.saveScene(source))
  handle('updateMeta', (patch: Partial<ProjectMeta>) => projects.updateMeta(patch))

  handle('render', async (quality: Quality) => {
    await render(quality)
  })
  handle('cancelRender', () => cancel('preview'))
  handle('frame', async (t: number, width?: number) => frame(t, width))
  handle('exportVideo', () => exportVideo())

  handle('saveRecording', async (key: string, wav: ArrayBuffer) => {
    const text = projects.readTimeline(projects.requireProject().path)?.voice.find((v) => v.key === key)?.text
    return saveRecording(key, wav, text)
  })
  handle('deleteRecording', (key: string) => deleteRecording(key))
  handle('saveVoiceReference', (wav: ArrayBuffer, text: string) => {
    const p = projects.requireProject()
    const refAudio = saveReference(wav)
    return projects.updateMeta({ voice: { ...p.meta.voice, omnivoice: { refAudio, refText: text } } })
  })
  handle('elevenLabsVoices', () => elevenLabsVoices())
  handle('systemVoices', () => systemVoices())

  handle('chatSend', (req: Parameters<typeof chatSend>[0]) => chatSend(req))
  handle('chatInterrupt', () => chatInterrupt())
  handle('chatReset', () => chatReset())
  handle('chatModels', () => chatModels())

  handle('history', () => history(projects.requireProject().path))
  handle('restore', async (oid: string) => {
    const p = projects.requireProject()
    await restore(p.path, oid)
    const source = projects.readScene()
    p.lastWritten = source
    p.meta = projects.readMeta(p.path)
    send('file-changed', { source, external: true })
  })

  handle('checkForUpdates', () => checkForUpdates())
  handle('downloadUpdate', () => downloadUpdate())
  handle('installUpdate', () => installUpdate())
  handle('openExternal', (url: string) => (/^https:\/\//.test(url) ? shell.openExternal(url) : undefined))
  handle('askMicrophone', async () =>
    process.platform === 'darwin' ? systemPreferences.askForMediaAccess('microphone') : true,
  )
}

async function exportVideo(): Promise<string> {
  const p = projects.requireProject()
  send('export', { stage: 'render' })
  const outcome = await render('final')
  if ('error' in outcome) {
    send('export', { stage: 'error', error: outcome.error.message })
    throw new Error(outcome.error.message)
  }
  if ('cancelled' in outcome) throw new Error('Izvoz je prekinut')
  send('export', { stage: 'package' })
  const dest = join(p.path, 'exports', projects.slugify(p.meta.name))
  await (await runRunner('default', ['export', join(p.path, '.studio', 'final', 'timeline.json'), dest])).done
  const video = `${dest}.mp4`
  send('export', { stage: 'done', path: video })
  return video
}

app.whenReady().then(() => {
  app.setAppUserModelId('cc.razem.manimstudio')
  // The recording booth needs the microphone; nothing else asks for permissions.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media'))
  if (process.platform === 'darwin') Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }]))

  registerMediaProtocol()
  registerIpc()
  onRenderEvent((e) => send('render', e))
  onSetupEvent((e) => send('setup', e))
  onWorkerLog((e) => send('setup', e))
  onChatEvent((e) => send('chat', e))
  projects.onSceneChangedOnDisk((source) => send('file-changed', { source, external: true }))
  setupUpdater((e) => send('update', e))
  createWindow()

  // A fresh install or an app update that changed pixi.toml: bring the env up to date quietly.
  const status = setupStatus()
  if (status.env === 'outdated') void install('env').catch(() => undefined)

  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('window-all-closed', () => {
  stopTtsWorker()
  closeChat()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopTtsWorker()
  closeChat()
})
