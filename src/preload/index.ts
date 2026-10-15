import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { StudioApi } from '../shared/types'

const invoke =
  (name: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(name, ...args)

const methods = [
  'appInfo', 'setupStatus', 'install', 'getSettings', 'setSettings', 'setElevenLabsKey', 'setAnthropicKey', 'setOpenAIKey',
  'claudeStatus', 'claudeUsage', 'claudeLogin', 'claudeLoginCode', 'claudeLogout', 'claudeDesktopStatus',
  'listProjects', 'createProject', 'openProject', 'pickProject', 'pickFolder', 'pickPdfs', 'closeProject', 'forgetProject', 'reveal',
  'saveScene', 'updateMeta', 'saveScript', 'render', 'cancelRender', 'frame', 'startQuick', 'quickRun', 'stopQuick', 'planSeries', 'cancelSeriesPlan', 'startSeries', 'seriesRun', 'stopSeries', 'continueSeries', 'pauseSeries', 'pauseEpisode', 'projectUsage', 'dismissSeries', 'renderServers', 'addServer', 'removeServer', 'checkServer', 'queueExport', 'exportJobs', 'cancelExport', 'pauseExport', 'pauseRender', 'clearExports', 'listMedia', 'importMedia', 'removeMedia',
  'listSources', 'importSources', 'removeSource', 'sourcePages',
  'saveRecording', 'deleteRecording', 'saveVoiceReference', 'askMicrophone', 'elevenLabsVoices', 'elevenLabsLibrary',
  'chatSend', 'chatInterrupt', 'chatReset', 'chatModels', 'installClaudeExtension', 'history', 'restore',
  'checkForUpdates', 'downloadUpdate', 'installUpdate', 'openExternal',
] as const

const api = Object.fromEntries(methods.map((m) => [m, invoke(m)])) as unknown as StudioApi

api.pathForFile = (file: File) => webUtils.getPathForFile(file)
api.mediaUrl = (path: string) => `studio-media://local/${encodeURIComponent(path)}`
api.on = ((channel: string, cb: (payload: unknown) => void) => {
  const listener = (_e: Electron.IpcRendererEvent, payload: unknown) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}) as StudioApi['on']

contextBridge.exposeInMainWorld('studio', api)
