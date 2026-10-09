import { contextBridge, ipcRenderer } from 'electron'
import type { StudioApi } from '../shared/types'

const invoke =
  (name: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(name, ...args)

const methods = [
  'appInfo', 'setupStatus', 'install', 'getSettings', 'setSettings', 'setElevenLabsKey', 'setAnthropicKey',
  'claudeStatus', 'claudeUsage', 'claudeLogin', 'claudeLoginCode', 'claudeLogout', 'claudeDesktopStatus',
  'listProjects', 'createProject', 'openProject', 'pickProject', 'pickFolder', 'closeProject', 'forgetProject', 'reveal',
  'saveScene', 'updateMeta', 'render', 'cancelRender', 'frame', 'exportVideo',
  'saveRecording', 'deleteRecording', 'saveVoiceReference', 'askMicrophone', 'elevenLabsVoices', 'systemVoices',
  'chatSend', 'chatInterrupt', 'chatReset', 'chatModels', 'installClaudeExtension', 'history', 'restore',
  'checkForUpdates', 'downloadUpdate', 'installUpdate', 'openExternal',
] as const

const api = Object.fromEntries(methods.map((m) => [m, invoke(m)])) as unknown as StudioApi

api.mediaUrl = (path: string) => `studio-media://local/${encodeURIComponent(path)}`
api.on = ((channel: string, cb: (payload: unknown) => void) => {
  const listener = (_e: Electron.IpcRendererEvent, payload: unknown) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}) as StudioApi['on']

contextBridge.exposeInMainWorld('studio', api)
