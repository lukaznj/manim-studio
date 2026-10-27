import { app, dialog, shell, session } from 'electron'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { translateUi } from '../shared/i18n'
import { getSettings } from './settings'
import { paths } from './paths'
import { maintainRuntimes } from './env'
import { cleanupRuntimes, uninstallTarget } from './runtime-cleanup'
import { stopTtsWorkerAndWait } from './voice'

const target = () => uninstallTarget(app.isPackaged, process.platform, app.getPath('exe'), process.env.APPIMAGE)
export const canUninstall = () => !!target()
let pending = false
export const cleanupPending = () => pending

/** Every destructive action is confirmed in main, with a fresh preflight after the dialog. */
export async function removeDownloadedTools(uninstall: boolean, busy: () => boolean, quit: () => void): Promise<boolean> {
  if (pending || busy()) throw new Error('Stop video creation before removing tools.')
  const installation = uninstall ? target() : null
  if (uninstall && (!installation || !existsSync(installation.path))) throw new Error('This installation cannot uninstall itself. Remove downloaded tools here, then uninstall the app normally.')
  pending = true
  const t = (text: string) => translateUi(getSettings().uiLanguage ?? 'en', text)
  try {
    const roots = { userData: paths.userData(), renderCache: paths.renderCache() }
    const preview = await cleanupRuntimes(roots)
    if (preview.errors.length) throw new Error(preview.errors.join('\n'))
    const response = await dialog.showMessageBox({
      type: 'warning',
      title: 'Manim Studio',
      message: t(uninstall ? 'Uninstall Manim Studio…' : 'Remove downloaded tools…'),
      detail: t('Removes Studio’s downloaded tools and caches. Projects, recordings, settings and sign-ins are kept.')
        + `\n\n${(preview.bytes / 1e9).toFixed(2)} GB\n${preview.removed.join('\n')}`
        + (installation ? `\n\n${installation.path}` : ''),
      buttons: [t('Cancel'), t(uninstall ? 'Uninstall Manim Studio…' : 'Remove downloaded tools…')], defaultId: 0, cancelId: 0, noLink: true,
    })
    if (response.response !== 1) return false
    if (busy()) throw new Error('Stop video creation before removing tools.')
    await stopTtsWorkerAndWait()
    await maintainRuntimes(async () => {
      if (busy()) throw new Error('Stop video creation before removing tools.')
      const result = await cleanupRuntimes(roots, true)
      if (result.errors.length) throw new Error(result.errors.join('\n'))
      if (result.kept.length) await dialog.showMessageBox({ type: 'info', title: 'Manim Studio', message: t('Some folders were kept because they contain projects or link outside Studio’s storage.'), detail: result.kept.join('\n') })
      if (!installation) return
      await session.defaultSession.clearCache()
      if (installation.kind === 'trash') await shell.trashItem(installation.path)
      else await new Promise<void>((resolve, reject) => {
        // The normal NSIS uninstaller owns shortcuts and registry entries. It also runs cleanup.
        const child = spawn(installation.path, [], { detached: true, stdio: 'ignore', windowsHide: true })
        child.once('error', reject)
        child.once('spawn', () => { child.unref(); resolve() })
      })
    })
    if (installation) quit()
    return true
  } finally { pending = false }
}
