import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Settings } from '../shared/types'
import { paths } from './paths'

const defaults = (): Settings => ({
  projectsDir: paths.defaultProjectsDir(),
  recentProjects: [],
  claudeModel: '',
  autoRender: true,
  hasElevenLabsKey: false,
  defaultVoice: { provider: 'system', language: 'hr', systemVoice: 'Lana' },
  sidebarWidth: 440,
  chatWidth: 380,
  timelineHeight: 248,
})

let cache: Settings | null = null

export function getSettings(): Settings {
  if (!cache) {
    let stored: Partial<Settings> = {}
    try {
      stored = JSON.parse(readFileSync(paths.settingsFile(), 'utf8'))
    } catch {
      // first run, or a corrupt file: fall back to defaults
    }
    cache = { ...defaults(), ...stored, hasElevenLabsKey: !!getSecret('elevenlabs') }
  }
  return cache
}

export function setSettings(patch: Partial<Settings>): Settings {
  cache = { ...getSettings(), ...patch, hasElevenLabsKey: getSettings().hasElevenLabsKey }
  writeFileSync(paths.settingsFile(), JSON.stringify(cache, null, 2))
  return cache
}

export function rememberProject(path: string): void {
  const recent = [path, ...getSettings().recentProjects.filter((p) => p !== path)].slice(0, 30)
  setSettings({ recentProjects: recent })
}

// --- secrets: encrypted with the OS keychain via safeStorage, never sent to the renderer ---

const secretFile = (name: string) => join(app.getPath('userData'), `${name}.secret`)

export function getSecret(name: string): string {
  const file = secretFile(name)
  if (!existsSync(file) || !safeStorage.isEncryptionAvailable()) return ''
  try {
    return safeStorage.decryptString(readFileSync(file))
  } catch {
    return ''
  }
}

export function setSecret(name: string, value: string): Settings {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Šifriranje nije dostupno na ovom računalu')
  writeFileSync(secretFile(name), value ? safeStorage.encryptString(value) : Buffer.alloc(0))
  cache = { ...getSettings(), hasElevenLabsKey: !!value }
  return cache
}
