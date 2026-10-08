// Auto-updates from GitHub Releases (see electron-builder.yml `publish` and
// docs/06-operations/releasing.md). Checks at start and every few hours; downloading
// and restarting are the user's call, from the update pill in the title bar.
import { app } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateEvent } from '../shared/types'

const { autoUpdater } = electronUpdater
export const RELEASES_URL = 'https://github.com/lukaznj/manim-studio-releases/releases/latest'
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000

let send: (e: UpdateEvent) => void = () => {}
// Set once an update is known to exist; only then is a failure worth a manual-download offer.
let available: string | null = null

export function setupUpdater(fn: (e: UpdateEvent) => void): void {
  send = fn
  if (!app.isPackaged) return // dev builds have no app-update.yml
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => {
    available = info.version
    send({ state: 'available', version: info.version, notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined })
  })
  autoUpdater.on('update-not-available', () => send({ state: 'none' }))
  autoUpdater.on('download-progress', (p) => send({ state: 'downloading', percent: p.percent }))
  autoUpdater.on('update-downloaded', (info) => send({ state: 'ready', version: info.version }))
  autoUpdater.on('error', (e) =>
    // An unsigned macOS build can't replace itself: offer the download page, but only when
    // there is something to download (a failed check, e.g. offline, is just reported).
    send({ state: 'error', message: e.message, manualUrl: available ? RELEASES_URL : undefined }),
  )
  setTimeout(() => void checkForUpdates(), 10_000)
  setInterval(() => void checkForUpdates(), CHECK_EVERY_MS)
}

export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) {
    send({ state: 'none' })
    return
  }
  await autoUpdater.checkForUpdates().catch(() => undefined)
}

export async function downloadUpdate(): Promise<void> {
  await autoUpdater.downloadUpdate()
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall()
}
