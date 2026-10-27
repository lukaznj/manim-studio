import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Settings } from '../shared/types'
import { migrateVoice } from '../shared/voice'
import { CODEX_EXECUTOR, normalizeCodexSettings } from '../shared/codex-selection'
import { resolveUiLanguage } from '../shared/ui-languages'
import { narrationLanguageForUi } from '../shared/narration-languages'
import { interfaceSize, chatTextSize } from '../shared/text-size'
import { normalizeModelOrder } from '../shared/model-fallback'
import { paths } from './paths'
import { readAtomicJson, writeAtomicJson } from './atomic-json'

const defaults = (): Settings => {
  const uiLanguage = resolveUiLanguage(app.getLocale())
  return {
    uiLanguage,
    defaultAspect: '16:9',
    defaultTheme: 'dark',
    defaultTone: 'warm',
    appearance: 'system',
    projectsDir: paths.defaultProjectsDir(),
    recentProjects: [],
    claudeAuth: 'account',
    previewSize: 1080,
    studySize: 1080,
    previewFps: 15,
    tutorialDone: false,
    claudeModel: 'claude-sonnet-5-5', // Sonnet 5.5 at high effort writes scenes well enough, faster and cheaper than Opus
    claudeEffort: 'high',
    agent: 'claude',
    codexModel: CODEX_EXECUTOR,
    codexEffort: 'high',
    antigravityModel: '',
    antigravityEffort: 'medium', // Antigravity's own default for Argon
    seriesAgents: 3,
    autoRender: true,
    hasElevenLabsKey: false,
    hasAnthropicKey: false,
    hasOpenAIKey: false,
    hasGeminiKey: false,
    defaultVoice: { provider: 'elevenlabs', language: narrationLanguageForUi(uiLanguage) ?? 'en' },
    renderServers: [],
    sidebarWidth: 440,
    chatWidth: 380,
    timelineHeight: 248,
  }
}

let cache: Settings | null = null

export function getSettings(): Settings {
  if (!cache) {
    let stored: Partial<Settings> = {}
    try {
      const saved = readAtomicJson(paths.settingsFile(), (value): value is Partial<Settings> => !!value && typeof value === 'object' && !Array.isArray(value))
      if (!saved) throw new Error('No saved settings')
      stored = saved
      // Installs from before 0.11 keep the projects folder they had (Documents), set or not (ADR 0043).
      stored.projectsDir ??= process.env.STUDIO_PROJECTS_DIR ?? paths.legacyProjectsDir()
    } catch {
      // first run, or a corrupt file: fall back to defaults
    }
    if (stored.defaultVoice) stored.defaultVoice = migrateVoice(stored.defaultVoice)
    const base = defaults()
    cache = normalizeCodexSettings({ ...base, ...stored, uiLanguage: resolveUiLanguage(stored.uiLanguage ?? base.uiLanguage), ...secretFlags() })
  }
  if (cache.modelFallback) cache.modelFallback = { enabled: cache.modelFallback.enabled === true, order: normalizeModelOrder(cache.modelFallback.order) }
  cache.interfaceSize = interfaceSize(cache.interfaceSize)
  cache.chatTextSize = chatTextSize(cache.chatTextSize)
  return cache
}

export function setSettings(patch: Partial<Settings>): Settings {
  cache = normalizeCodexSettings({ ...getSettings(), ...patch, ...secretFlags() })
  if (cache.modelFallback) cache.modelFallback = { enabled: cache.modelFallback.enabled === true, order: normalizeModelOrder(cache.modelFallback.order) }
  cache.interfaceSize = interfaceSize(cache.interfaceSize)
  cache.chatTextSize = chatTextSize(cache.chatTextSize)
  cache.uiLanguage = resolveUiLanguage(cache.uiLanguage)
  writeAtomicJson(paths.settingsFile(), cache)
  return cache
}

/** Most recent first. No limit: it's Home's list of projects, and a series adds a dozen at once (Open Recent shows 10). */
export function rememberProject(path: string): void {
  const recent = [path, ...getSettings().recentProjects.filter((p) => p !== path)]
  setSettings({ recentProjects: recent })
}

// --- secrets: encrypted with the OS keychain via safeStorage, never sent to the renderer ---

const secretFlags = () => ({
  hasElevenLabsKey: !!getSecret('elevenlabs'),
  hasAnthropicKey: !!getSecret('anthropic'),
  hasOpenAIKey: !!getSecret('openai'),
  hasGeminiKey: !!getSecret('gemini'),
})

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
