import { app, BrowserWindow, dialog, ipcMain, nativeTheme, protocol, session, shell, systemPreferences } from 'electron'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import type { EventChannel, ExportOptions, ProjectMeta, Quality } from '../shared/types'
import { applyChatSettings, chatInterrupt, chatModels, chatReset, chatSend, claudeLogin, claudeLoginCode, claudeLogout, claudeStatus, claudeUsage, closeChat, loadChat, onChatEvent } from './claude'
import { install, onSetupEvent, setupStatus } from './env'
import { exportVideo } from './export'
import { importMedia, listMedia, removeMedia } from './media'
import { history, restore } from './git'
import { claudeDesktopStatus, startDesktopEndpoint } from './mcp'
import { watchMemory } from './memory'
import { refreshMenu, setupMenu } from './menu'
import { paths } from './paths'
import * as projects from './projects'
import { cancel, frame, onRenderEvent, render } from './render'
import { runningJobs } from './runner'
import { getSettings, setSecret, setSettings } from './settings'
import { checkForUpdates, downloadUpdate, installUpdate, RELEASES_URL, setupUpdater } from './updater'
import { deleteRecording, elevenLabsLibrary, elevenLabsVoices, onWorkerLog, saveRecording, saveReference, stopTtsWorker, systemVoices } from './voice'

// Isolated data for automated runs (scripts/drive.mjs); never set in normal use.
if (process.env.STUDIO_USER_DATA) app.setPath('userData', process.env.STUDIO_USER_DATA)

// One running copy per data folder. A second launch (Claude Desktop starting Studio, a
// manim-studio:// link) brings this one forward instead.
if (!app.requestSingleInstanceLock()) app.exit(0)
app.on('second-instance', () => void showWindow())
app.on('open-url', (e) => {
  e.preventDefault()
  void app.whenReady().then(showWindow)
})

protocol.registerSchemesAsPrivileged([
  { scheme: 'studio-media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } },
])

let win: BrowserWindow | null = null
const send = (channel: EventChannel, payload: unknown) => win?.webContents.send(channel, payload)

// The window behind the page (and the Windows/Linux title-bar buttons) in the title bar's --bg.
// nativeTheme.themeSource follows Settings → Appearance and drives prefers-color-scheme too.
const chrome = () =>
  nativeTheme.shouldUseDarkColors ? { color: '#070e19', symbolColor: '#9eadc3', height: 44 } : { color: '#e7ebf1', symbolColor: '#46566c', height: 44 }

function createWindow(): void {
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: chrome().color,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? undefined : chrome(),
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

async function showWindow(): Promise<BrowserWindow> {
  if (!win) createWindow()
  const w = win!
  if (w.webContents.isLoading()) await new Promise<void>((r) => w.webContents.once('did-finish-load', () => r()))
  if (w.isMinimized()) w.restore()
  w.show()
  w.focus()
  return w
}

/** For Claude Desktop: show the window with this project open, as if it had been clicked on Home. */
async function openInWindow(dir: string): Promise<void> {
  await showWindow()
  // The page may still be starting up (its listeners come after its first data loads), so ask again until it has.
  for (let i = 0; projects.project()?.path !== dir; i++) {
    if (i === 150) throw new Error('Manim Studio didn’t open the project. Is a dialog open in it?')
    if (i % 10 === 0) send('open-project', { path: dir })
    await new Promise((r) => setTimeout(r, 100))
  }
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
  handle('setSettings', (patch: Parameters<typeof setSettings>[0]) => {
    const settings = setSettings(patch)
    if ('claudeModel' in patch || 'claudeEffort' in patch) void applyChatSettings()
    if (patch.appearance) nativeTheme.themeSource = patch.appearance
    // Another sign-in method means another Claude Code process: the next message starts it.
    if ('claudeAuth' in patch) closeChat()
    if (patch.appearance || patch.recentProjects) refreshMenu()
    return settings
  })
  handle('setElevenLabsKey', (key: string) => setSecret('elevenlabs', key.trim()))
  handle('setAnthropicKey', (key: string) => setSecret('anthropic', key.trim()))

  handle('claudeStatus', () => claudeStatus())
  handle('claudeUsage', () => claudeUsage())
  handle('claudeLogin', () => claudeLogin((e) => send('claude-login', e)))
  handle('claudeLoginCode', (code: string) => claudeLoginCode(code))
  handle('claudeLogout', () => claudeLogout())

  handle('listProjects', () => projects.listProjects())
  handle('createProject', (input: Parameters<typeof projects.createProject>[0]) => projects.createProject(input))
  handle('openProject', (path: string) => {
    const opened = projects.openProject(path)
    loadChat(path)
    refreshMenu()
    return opened
  })
  handle('pickProject', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory'], title: 'Open a project (the folder with scene.py)' })
    const dir = r.filePaths[0]
    if (!dir) return null
    if (!existsSync(join(dir, 'project.json'))) throw new Error('That folder has no project.json, so it is not a Manim Studio project.')
    return dir
  })
  handle('pickFolder', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'], title: 'Projects folder' })
    return r.filePaths[0] ?? null
  })
  handle('closeProject', () => {
    closeChat()
    stopTtsWorker()
    cancel('preview')
    projects.closeProject()
    refreshMenu()
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
  handle('exportVideo', (options: ExportOptions) => exportWithProgress(options))
  handle('listMedia', () => listMedia())
  handle('importMedia', (paths: string[]) => importMedia(paths))
  handle('removeMedia', (name: string) => removeMedia(name))
  handle('installClaudeExtension', installClaudeExtension)
  handle('claudeDesktopStatus', () => claudeDesktopStatus())

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
  handle('elevenLabsLibrary', (language: string, search: string) => elevenLabsLibrary(language, search))
  handle('systemVoices', (language?: string) => systemVoices(language))

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

/** Claude Desktop owns .mcpb files and shows its own install (or update) dialog. */
async function installClaudeExtension(): Promise<void> {
  const error = await shell.openPath(paths.mcpb())
  if (error) throw new Error(`Couldn’t open the extension (${error}). Is Claude Desktop installed?`)
}

/** The export, with its progress shown in the window (the dialog, or Claude Desktop's export). */
const exportWithProgress = (options: ExportOptions) => exportVideo(options, (e) => send('export', e))

app.whenReady().then(() => {
  app.setAppUserModelId('cc.razem.manimstudio')
  // The recording booth needs the microphone; nothing else asks for permissions.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media'))
  setupMenu(
    (action, extra) => void showWindow().then(() => send('menu', { action, ...extra })),
    () => void installClaudeExtension().catch((e: Error) => dialog.showErrorBox('Claude Desktop', e.message)),
  )

  nativeTheme.themeSource = getSettings().appearance
  nativeTheme.on('updated', () => {
    win?.setBackgroundColor(chrome().color)
    if (process.platform !== 'darwin') win?.setTitleBarOverlay(chrome())
  })
  registerMediaProtocol()
  registerIpc()
  onRenderEvent((e) => send('render', e))
  onSetupEvent((e) => send('setup', e))
  onWorkerLog((e) => send('setup', e))
  onChatEvent((e) => send('chat', e))
  projects.onSceneChangedOnDisk((source) => send('file-changed', { source, external: true }))
  setupUpdater((e) => send('update', e))
  startDesktopEndpoint({
    openInWindow,
    sceneWritten: (source) => send('file-changed', { source, external: true, agent: true }),
    exportVideo: () => exportWithProgress({ themes: [], languages: [], languageVideos: false }),
  })
  if (app.isPackaged) app.setAsDefaultProtocolClient('manim-studio')
  watchMemory(join(app.getPath('logs'), 'memory.log'), () => ({
    project: projects.project()?.path ?? null,
    voice: projects.project()?.meta.voice.provider ?? null,
    pythonJobs: [...runningJobs].map(([pid, job]) => ({ pid, what: job.what, since: job.since, lastLog: job.log().split('\n').slice(-15) })),
  }))
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
