import { app, BrowserWindow, dialog, ipcMain, nativeTheme, protocol, session, shell, systemPreferences } from 'electron'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { basename, dirname, join, normalize, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import type { Agent, EventChannel, ExerciseInput, ExportOptions, NewExerciseSet, ProjectMeta, Quality, QuickRequest, SeriesStart } from '../shared/types'
import {
  applyChatSettings,
  chatInterrupt,
  chatModels,
  chatReset,
  chatSend,
  claudeLogin,
  claudeLoginCode,
  claudeLogout,
  claudeStatus,
  claudeUsage,
  closeChat,
  loadChat,
  onChatEvent,
  projectUsage,
} from './claude'
import { install, onSetupEvent, setupStatus } from './env'
import { cancelExport, clearExports, exportJobs, exportsBusy, onExportsChanged, pauseExport, queueExport } from './exports'
import { importMedia, listMedia, removeMedia } from './media'
import { importSources, listSources, removeSource, sourcePages } from './sources'
import { history, restore } from './git'
import { claudeDesktopStatus, startDesktopEndpoint } from './mcp'
import { watchMemory } from './memory'
import { quickRun, setupQuick, startQuick, stopQuick } from './quick'
import {
  continueSeries,
  dismissSeries,
  pauseEpisode,
  pauseSeries,
  planSeries,
  seriesRun,
  setupSeries,
  startSeries,
  stopSeries,
  writeEpisodeBible,
} from './series'
import { addServer, checkServer, listServers, removeServer } from './remote'
import { movedSeriesFolder, relocate } from './relocate'
import * as ex from './exercises'
import { videoEncoder } from './encoder'
import { requestFollowUp, retryFollowUp, setupWatch, setWatched, watchDetail, watchSeries } from './watch'
import { checkAnthropicKey, checkGeminiKey, checkOpenAIKey, keyUsable } from './keys'
import { refreshMenu, setupMenu } from './menu'
import { paths } from './paths'
import * as projects from './projects'
import { cancel, frame, onRenderEvent, render } from './render'
import { pauseTag, resumeAll, runningJobs } from './runner'
import { getSettings, setSecret, setSettings } from './settings'
import { checkForUpdates, downloadUpdate, installUpdate, RELEASES_URL, setupUpdater } from './updater'
import {
  checkElevenLabsKey,
  deleteRecording,
  elevenLabsDefaultVoice,
  elevenLabsLibrary,
  elevenLabsUsage,
  elevenLabsVoices,
  voicePreview,
  onWorkerLog,
  saveElevenLabsKey,
  saveRecording,
  saveReference,
  stopTtsWorker,
} from './voice'

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
    const allowed = [projects.project()?.path, ...getSettings().recentProjects, ...(getSettings().exerciseSets ?? []), paths.userData()].filter(
      Boolean,
    ) as string[]
    const full = resolve(file)
    if (!allowed.some((root) => full === resolve(root) || full.startsWith(resolve(root) + sep)) || !existsSync(full)) {
      return new Response('not found', { status: 404 })
    }
    const size = statSync(full).size
    const type = full.endsWith('.mp4')
      ? 'video/mp4'
      : full.endsWith('.wav')
        ? 'audio/wav'
        : full.endsWith('.mp3')
          ? 'audio/mpeg'
          : full.endsWith('.png')
            ? 'image/png'
            : 'image/jpeg'
    const range = req.headers.get('range')?.match(/bytes=(\d*)-(\d*)/)
    if (range) {
      const start = range[1] ? Number(range[1]) : 0
      const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
      return new Response(Readable.toWeb(createReadStream(full, { start, end })) as ReadableStream, {
        status: 206,
        headers: {
          'Content-Type': type,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
        },
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
    if ('claudeAuth' in patch || 'codexAuth' in patch || 'antigravityAuth' in patch || 'agent' in patch) closeChat()
    if (patch.appearance || patch.recentProjects || patch.mode) refreshMenu()
    return settings
  })
  handle('setElevenLabsKey', async (key: string) => {
    await saveElevenLabsKey(key)
    return getSettings()
  })
  handle('checkElevenLabsKey', (again?: boolean) => checkElevenLabsKey(undefined, again))
  handle('elevenLabsUsage', () => elevenLabsUsage())
  handle('setAnthropicKey', async (key: string) => {
    if (key.trim()) await keyUsable('anthropic', key.trim())
    closeChat() // the next message starts Claude Code with the new key
    return setSecret('anthropic', key.trim())
  })
  handle('checkAnthropicKey', (again?: boolean) => checkAnthropicKey(undefined, again))
  handle('setOpenAIKey', async (key: string) => {
    if (key.trim()) await keyUsable('openai', key.trim())
    closeChat() // Codex picks the key up when it starts again
    return setSecret('openai', key.trim())
  })
  handle('checkOpenAIKey', (again?: boolean) => checkOpenAIKey(undefined, again))
  handle('setGeminiKey', async (key: string) => {
    if (key.trim()) await keyUsable('gemini', key.trim())
    closeChat() // Antigravity picks the key up on its next run
    return setSecret('gemini', key.trim())
  })
  handle('checkGeminiKey', (again?: boolean) => checkGeminiKey(undefined, again))

  handle('claudeStatus', (agent?: Agent) => claudeStatus(agent))
  handle('claudeUsage', () => claudeUsage())
  handle('claudeLogin', (agent?: Agent) => claudeLogin((e) => send('claude-login', e), agent))
  handle('claudeLoginCode', (code: string, agent?: Agent) => claudeLoginCode(code, agent))
  handle('claudeLogout', (agent?: Agent) => claudeLogout(agent))

  handle('listProjects', () => projects.listProjects())
  handle('createProject', (input: Parameters<typeof projects.createProject>[0]) => projects.createProject(input))
  handle('openProject', (path: string) => {
    writeEpisodeBible(path) // an episode's series.md picks up what the earlier episodes became
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
  handle('pickFolder', async (title?: string, defaultPath?: string) => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'], title: title ?? 'Projects folder', defaultPath })
    return r.filePaths[0] ?? null
  })
  handle('pickPdfs', async () => {
    const r = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
      title: 'PDFs to make the video from',
      filters: [{ name: 'PDF documents', extensions: ['pdf'] }],
    })
    return r.filePaths
  })
  handle('closeProject', () => {
    closeChat()
    stopTtsWorker()
    cancel('preview')
    projects.closeProject()
    refreshMenu()
  })
  handle('forgetProject', (path: string) => setSettings({ recentProjects: getSettings().recentProjects.filter((p) => p !== path) }))
  handle('locateProject', async (from: string) => {
    let near = dirname(from)
    while (!existsSync(near) && dirname(near) !== near) near = dirname(near)
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory'], title: `Where is ${basename(from)} now?`, defaultPath: near })
    const to = r.filePaths[0]
    if (!to) return null
    if (!existsSync(join(to, 'project.json'))) throw new Error('That folder has no project.json, so it is not a Manim Studio project.')
    const { recent, moved } = relocate(getSettings().recentProjects, from, to)
    for (const [, dir] of moved) {
      const folder = movedSeriesFolder(dir)
      if (folder) projects.updateMetaAt(dir, { series: { ...projects.readMeta(dir).series!, folder } })
    }
    setSettings({ recentProjects: recent })
    refreshMenu()
    return { path: to, found: moved.length - 1 }
  })
  handle('reveal', (path: string) => shell.showItemInFolder(normalize(path))) // the renderer joins with /
  handle('saveScene', (source: string) => projects.saveScene(source))
  handle('updateMeta', (patch: Partial<ProjectMeta>) => projects.updateMeta(patch))
  handle('saveScript', (text: string) => projects.saveScript(text))

  handle('render', async (quality: Quality) => {
    await render(quality)
  })
  handle('cancelRender', () => cancel('preview'))
  handle('pauseRender', (on: boolean) => pauseTag('preview', on))
  handle('pauseExport', (id: string, on: boolean) => pauseExport(id, on))
  handle('frame', async (t: number, width?: number) => frame(t, width))
  handle('startQuick', async (req: QuickRequest) => (await startQuick(req)).run)
  handle('quickRun', () => quickRun())
  handle('stopQuick', () => stopQuick())
  let planning: AbortController | null = null
  handle('planSeries', async (req: Parameters<typeof planSeries>[0]) => {
    planning?.abort()
    planning = new AbortController()
    try {
      return await planSeries(req, (p) => send('series-plan', p), planning.signal)
    } finally {
      planning = null
    }
  })
  handle('cancelSeriesPlan', () => planning?.abort())
  handle('startSeries', (start: SeriesStart) => startSeries(start, openInWindow))
  handle('seriesRun', () => seriesRun())
  handle('stopSeries', () => stopSeries())
  handle('dismissSeries', () => dismissSeries())
  handle('continueSeries', () => continueSeries())
  handle('pauseSeries', (paused: boolean) => pauseSeries(paused))
  handle('pauseEpisode', (dir: string, paused: boolean) => pauseEpisode(dir, paused))
  handle('projectUsage', () => projectUsage())
  handle('createExerciseSet', (req: NewExerciseSet) => ex.createExerciseSet(req))
  handle('exerciseSet', (folder: string) => ex.exerciseSet(folder))
  handle('exerciseSets', () => ex.exerciseSets())
  handle('addExercises', (folder: string, input: ExerciseInput) => ex.addExercises(folder, input))
  handle('pickExerciseFiles', async () => {
    const r = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
      title: 'Pictures or PDFs of exercises',
      filters: [{ name: 'Pictures and PDFs', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf'] }],
    })
    return r.filePaths
  })
  handle('savePastedImage', (data: Uint8Array, ext: string) => ex.savePastedImage(data, ext))
  handle('exerciseDetail', (dir: string) => ex.exerciseDetail(dir))
  handle('reviseExercise', (dir: string, request: string) => ex.reviseExercise(dir, request))
  handle('retryExercise', (dir: string) => ex.retryExercise(dir))
  handle('pauseExercises', (folder: string, paused: boolean) => ex.pauseExercises(folder, paused))
  handle('removeExercise', (dir: string) => ex.removeExercise(dir))
  handle('searchExercises', (query: string) => ex.searchExercises(query))
  handle('makeLecture', (folder: string, dirs: string[]) => ex.makeLecture(folder, dirs))
  handle('watchSeries', (folder: string) => watchSeries(folder))
  handle('courseExercises', (series: string) => ex.courseExercises(series))
  handle('watchDetail', (dir: string) => watchDetail(dir))
  handle('requestFollowUp', (dir: string, at: number, request: string) => requestFollowUp(dir, at, request))
  handle('retryFollowUp', (dir: string) => retryFollowUp(dir))
  handle('setWatched', (dir: string, watched: boolean) => setWatched(dir, watched, ex.watchedChanged))
  handle('renderServers', () => listServers())
  handle('videoEncoder', (again?: boolean) => videoEncoder(again))
  handle('addServer', (code: string) => addServer(code))
  handle('removeServer', (id: string) => removeServer(id))
  handle('checkServer', (id: string) => checkServer(id))
  handle('queueExport', (options: ExportOptions) => queueExport(projects.requireProject().path, options).job)
  handle('exportJobs', () => exportJobs())
  handle('cancelExport', (id: string) => cancelExport(id))
  handle('clearExports', () => clearExports())
  handle('listMedia', () => listMedia())
  handle('importMedia', (paths: string[]) => importMedia(paths))
  handle('removeMedia', (name: string) => removeMedia(name))
  handle('listSources', () => listSources())
  handle('importSources', (paths: string[]) => importSources(paths))
  handle('removeSource', (name: string) => removeSource(name))
  handle('sourcePages', (name: string, pages: number[], width: number) => sourcePages(name, pages, width))
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
  handle('elevenLabsDefaultVoice', (language: string) => elevenLabsDefaultVoice(language))
  handle('voicePreview', (url: string) => voicePreview(url))

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
  handle('askMicrophone', async () => (process.platform === 'darwin' ? systemPreferences.askForMediaAccess('microphone') : true))
}

/** Claude Desktop owns .mcpb files and shows its own install (or update) dialog. */
async function installClaudeExtension(): Promise<void> {
  const error = await shell.openPath(paths.mcpb())
  if (error) throw new Error(`Couldn’t open the extension (${error}). Is Claude Desktop installed?`)
}

/** The export, with its progress shown in the window (the dialog, or Claude Desktop's export). */
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
  onExportsChanged((jobs) => send('exports', jobs))
  setupQuick({ send: (run) => send('quick', run), openInWindow })
  setupSeries((run) => send('series', run))
  ex.setupExercises((set) => send('exercises', set))
  setupWatch((series) => send('watch', series))
  onSetupEvent((e) => send('setup', e))
  onWorkerLog((e) => send('setup', e))
  onChatEvent((e) => send('chat', e))
  projects.onSceneChangedOnDisk((source) => send('file-changed', { source, external: true }))
  projects.onScriptChangedOnDisk((text) => send('script', { text }))
  setupUpdater((e) => send('update', e))
  startDesktopEndpoint({
    openInWindow,
    sceneWritten: (source) => send('file-changed', { source, external: true, agent: true }),
    scriptWritten: (text) => send('script', { text }),
    exportVideo: () => queueExport(projects.requireProject().path, { themes: [], languages: [], languageVideos: false }).finished,
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

app.on('before-quit', (e) => {
  // Exports and a series being made live in memory: quitting would stop them, so ask first.
  const making = seriesRun()?.state === 'working'
  if (exportsBusy() || making) {
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      message: making ? 'A series is still being made' : 'Exports are still running',
      detail: making ? 'Quitting stops its agents and exports. The episodes keep what was made so far.' : 'Quitting stops them and drops the ones waiting.',
      buttons: [making ? 'Keep making it' : 'Keep exporting', 'Quit anyway'],
      defaultId: 0,
      cancelId: 0,
    })
    if (choice === 0) {
      e.preventDefault()
      void showWindow()
      return
    }
  }
  resumeAll() // nothing stays stopped behind the app
  stopSeries()
  stopTtsWorker()
  closeChat()
})
