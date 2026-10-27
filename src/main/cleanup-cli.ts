// Bundled as plain CommonJS for Electron's RUN_AS_NODE mode during Windows uninstall.
import { homedir } from 'node:os'
import { join } from 'node:path'
import { cleanupRuntimes } from './runtime-cleanup'

async function main() {
  if (process.platform !== 'win32') throw new Error('This entry point is for the Windows uninstaller only.')
  const userData = join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Manim Studio')
  const renderCache = join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Manim Studio', 'Render cache')
  const result = await cleanupRuntimes({ userData, renderCache }, true)
  if (result.errors.length) throw new Error(result.errors.join('\n'))
  if (result.kept.length) console.log('Preserved folders containing projects or links:', result.kept.join('\n'))
}
void main().catch((error) => { console.error(error); process.exitCode = 1 })
