import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Settings } from '../shared/types'
import { migrateVoice } from '../shared/voice'
import { paths } from './paths'

const defaults = (): Settings => ({
  appearance: 'system',
  projectsDir: paths.defaultProjectsDir(),
  recentProjects: [],
  claudeAuth: 'account',
  previewSize: 480,
  previewFps: 15,
  tutorialDone: false,
  claudeModel: 'claude-sonnet-5-5', // Sonnet 5.5 at high effort writes scenes well enough, faster and cheaper than Opus
  claudeEffort: 'high',
  agent: 'claude',
  codexModel: '',
  codexEffort: 'high',
  antigravityModel: '',
  antigravityEffort: 'medium', // Antigravity's own default for Argon
  seriesAgents: 3,
  autoRender: true,
  hasElevenLabsKey: false,
  hasAnthropicKey: false,
  hasOpenAIKey: false,
  hasGeminiKey: false,
  defaultVoice: { provider: 'elevenlabs', language: 'en' },
  renderServers: [],
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
    if (stored.defaultVoice) stored.defaultVoice = migrateVoice(stored.defaultVoice)
    cache = { ...defaults(), ...stored, ...secretFlags() }
  }
  return cache
}

export function setSettings(patch: Partial<Settings>): Settings {
  cache = { ...getSettings(), ...patch, ...secretFlags() }
  writeFileSync(paths.settingsFile(), JSON.stringify(cache, null, 2))
  return cache
}

/** Most recent first. No limit: it's Home's list of projects, and a series adds a dozen at once (Open Recent shows 10). */
export function rememberProject(path: string): void {
  const recent = [path, ...getSettings().recentProjects.filter((p) => p !== path)]
  setSettings({ recentProjects: recent })
}

// --- secrets: encrypted with the OS keychain via safeStorage, never sent to the renderer ---

const secretFlags = () => ({ hasElevenLabsKey: !!getSecret('elevenlabs'), hasAnthropicKey: !!getSecret('anthropic'), hasOpenAIKey: !!getSecret('openai'), hasGeminiKey: !!getSecret('gemini') })

const secretFile = (name: string) => join(app.getPath('userData'), `${name}.secret`)

// Automated runs (scripts/drive.mjs) keep secrets as plain files in their isolated data folder: the
// unsigned dev build would otherwise block on a keychain prompt. Never on without STUDIO_USER_DATA.
const plain = () => !!process.env.STUDIO_PLAIN_SECRETS && !!process.env.STUDIO_USER_DATA

export function getSecret(name: string): string {
  const file = secretFile(name)
  if (plain()) return existsSync(file) ? readFileSync(file, 'utf8') : ''
  if (!existsSync(file) || !safeStorage.isEncryptionAvailable()) return ''
  try {
    return safeStorage.decryptString(readFileSync(file))
  } catch {
    return ''
  }
}

export function setSecret(name: string, value: string): Settings {
  if (plain()) {
    writeFileSync(secretFile(name), value)
    cache = { ...getSettings(), ...secretFlags() }
    return cache
  }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is not available on this computer')
  writeFileSync(secretFile(name), value ? safeStorage.encryptString(value) : Buffer.alloc(0))
  cache = { ...getSettings(), ...secretFlags() }
  return cache
}
