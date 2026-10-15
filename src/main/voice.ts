// Recordings, voice listings and the local OmniVoice worker.
import { type ChildProcess } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElevenLabsCheck, ElevenLabsUsage, ProjectMeta, SetupEvent, VoiceOption } from '../shared/types'
import { DEFAULT_EL_MODEL } from '../shared/voice'
import { setupStatus } from './env'
import { listRecordings, requireProject } from './projects'
import { runRunner } from './runner'
import { getSecret, setSecret } from './settings'

/** STUDIO_VOICE + secrets for a render of the current project. */
export async function voiceEnv(meta: ProjectMeta, dir: string): Promise<Record<string, string>> {
  const voice = structuredClone(meta.voice)
  if (voice.omnivoice?.refAudio) voice.omnivoice.refAudio = join(dir, voice.omnivoice.refAudio)
  const env: Record<string, string> = { STUDIO_VOICE: JSON.stringify(voice) }
  if (voice.provider === 'elevenlabs') env.ELEVENLABS_API_KEY = getSecret('elevenlabs')
  if (voice.provider === 'omnivoice') env.STUDIO_TTS_URL = await ensureTtsWorker().catch(() => '')
  return env
}

export async function saveRecording(key: string, wav: ArrayBuffer, text?: string): Promise<string[]> {
  if (!/^[0-9a-f]{12}$/.test(key)) throw new Error('Invalid recording key')
  const dir = join(requireProject().path, 'voice', 'recordings')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${key}.wav`)
  writeFileSync(file, Buffer.from(wav))
  rmSync(join(dir, `${key}.json`), { force: true })
  // Word timings make bookmarks land on the spoken word; optional component.
  if (text && setupStatus().transcribe === 'ready') {
    const language = requireProject().meta.voice.language
    const job = await runRunner('transcribe', ['align', file, text, join(dir, `${key}.json`), '--language', language])
    await job.done.catch(() => undefined)
  }
  return listRecordings()
}

export function deleteRecording(key: string): string[] {
  if (!/^[0-9a-f]{12}$/.test(key)) throw new Error('Invalid recording key')
  const dir = join(requireProject().path, 'voice', 'recordings')
  rmSync(join(dir, `${key}.wav`), { force: true })
  rmSync(join(dir, `${key}.json`), { force: true })
  return listRecordings()
}

export function saveReference(wav: ArrayBuffer): string {
  const rel = 'voice/reference.wav'
  writeFileSync(join(requireProject().path, rel), Buffer.from(wav))
  return rel
}

/** GET from ElevenLabs; failures come back as ElevenLabs' own explanation (detail.message), e.g. a missing key permission. */
async function elevenLabs<T>(path: string, key: string): Promise<T> {
  const res = await fetch(`https://api.elevenlabs.io${path}`, { headers: key ? { 'xi-api-key': key } : {} })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: { message?: string } } | null
    throw new Error(`ElevenLabs: ${body?.detail?.message ?? `HTTP ${res.status}`}`)
  }
  return (await res.json()) as T
}

/** One ElevenLabs request with `key`; a failure comes back with ElevenLabs' own status ("missing_permissions") and message. */
async function call(key: string, path: string, init: RequestInit = {}): Promise<{ ok: true; res: Response } | { ok: false; status?: string; message: string }> {
  const res = await fetch(`https://api.elevenlabs.io${path}`, { ...init, headers: { 'xi-api-key': key, ...(init.headers ?? {}) } })
  if (res.ok) return { ok: true, res }
  const body = (await res.json().catch(() => null)) as { detail?: { status?: string; message?: string } } | null
  const message = body?.detail?.message ?? `HTTP ${res.status}`
  return { ok: false, status: body?.detail?.status, message: /[.!?]$/.test(message) ? message : `${message}.` } // a sentence, for what follows it
}

const SOME_VOICE = '21m00Tcm4TlvDq8ikWAM' // a premade voice, when the account lists none
let checked: { key: string; result: ElevenLabsCheck } | null = null

/**
 * What a key may do, tried for real: list the voices (Voices: Read), speak one character (Text to
 * Speech; it costs that one character) and read the subscription (User, for the usage meter).
 */
export async function checkElevenLabsKey(key = getSecret('elevenlabs'), again = false): Promise<ElevenLabsCheck> {
  if (!again && checked?.key === key) return checked.result // once per key and session: each check speaks a character
  if (!key) return { voices: false, tts: false, user: false, problem: 'No ElevenLabs key is saved.' }
  const voices = await call(key, '/v1/voices')
  if (!voices.ok && voices.status !== 'missing_permissions') return { voices: false, tts: false, user: false, problem: `ElevenLabs: ${voices.message}` }
  const list = voices.ok ? ((await voices.res.json()) as { voices?: { voice_id: string }[] }) : {}
  const tts = await call(key, `/v1/text-to-speech/${list.voices?.[0]?.voice_id ?? SOME_VOICE}?output_format=mp3_22050_32`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '.', model_id: DEFAULT_EL_MODEL }),
  })
  if (tts.ok) await tts.res.arrayBuffer() // the one character of audio, unused
  const user = await call(key, '/v1/user/subscription')
  const result: ElevenLabsCheck = {
    voices: voices.ok,
    tts: tts.ok || tts.status !== 'missing_permissions',
    user: user.ok,
    // Allowed, but it still can't speak (no characters left, for example).
    problem: !tts.ok && tts.status !== 'missing_permissions' ? `ElevenLabs: ${tts.message}` : undefined,
  }
  checked = { key, result }
  return result
}

/** Saves the key once it can list voices and speak; otherwise says which permissions to switch on. */
export async function saveElevenLabsKey(key: string): Promise<void> {
  key = key.trim()
  if (key) {
    const check = await checkElevenLabsKey(key, true)
    if (check.problem && !check.voices && !check.tts) throw new Error(check.problem)
    const missing = [!check.tts && 'Text to Speech', !check.voices && 'Voices (Read)'].filter(Boolean)
    if (missing.length)
      throw new Error(
        `This key is missing ${missing.join(' and ')}. Edit it at elevenlabs.io → Developers → API keys, switch ${missing.length > 1 ? 'them' : 'it'} on, and save it here again.`,
      )
  }
  setSecret('elevenlabs', key)
}

/** This month's ElevenLabs characters, or null without a key or the key's User permission. */
export async function elevenLabsUsage(): Promise<ElevenLabsUsage | null> {
  const key = getSecret('elevenlabs')
  if (!key) return null
  const r = await call(key, '/v1/user/subscription')
  if (!r.ok) return null
  const s = (await r.res.json()) as { character_count: number; character_limit: number; next_character_count_reset_unix?: number | null; tier: string }
  return {
    used: s.character_count,
    limit: s.character_limit,
    resetsAt: s.next_character_count_reset_unix ? s.next_character_count_reset_unix * 1000 : undefined,
    tier: s.tier,
  }
}

/** The voices in the user's ElevenLabs account: their own, saved ones and ElevenLabs' defaults. */
export async function elevenLabsVoices(): Promise<VoiceOption[]> {
  const key = getSecret('elevenlabs')
  if (!key) throw new Error('Add your ElevenLabs API key first')
  const data = await elevenLabs<{ voices: { voice_id: string; name: string; preview_url?: string; labels?: Record<string, string> }[] }>('/v1/voices', key)
  return data.voices.map((v) => ({
    id: v.voice_id,
    name: v.name,
    description: Object.values(v.labels ?? {}).join(' · '),
    preview: v.preview_url,
  }))
}

interface LibraryVoice {
  voice_id: string
  name: string
  gender?: string
  age?: string
  accent?: string
  descriptive?: string
  use_case?: string
  preview_url?: string
  cloned_by_count?: number
  verified_languages?: { language?: string; preview_url?: string | null }[]
}

/**
 * ElevenLabs' voice library, most used first: the top ten for a language, or the voices matching
 * a search. Library voices work in text to speech without saving them first (not on the free plan).
 * Without a key ElevenLabs shows only three and no search.
 */
export async function elevenLabsLibrary(language: string, search: string): Promise<VoiceOption[]> {
  const key = getSecret('elevenlabs')
  if (!key && search.trim()) throw new Error('Save your ElevenLabs API key to search all voices.')
  const query = new URLSearchParams({ language: language.split('-')[0], sort: 'usage_character_count_1y', page_size: key ? '10' : '3' })
  if (search.trim()) query.set('search', search.trim())
  const data = await elevenLabs<{ voices: LibraryVoice[] }>(`/v1/shared-voices?${query}`, key)
  const lang = language.split('-')[0]
  return data.voices.map((v) => ({
    id: v.voice_id,
    name: v.name,
    description: [v.gender, v.age, v.accent !== 'standard' && v.accent, v.descriptive, v.use_case]
      .filter(Boolean)
      .map((label) => String(label).replace(/_/g, ' ')) // "middle_aged" → "middle aged"
      .join(' · '),
    // The sample in the chosen language when the voice has one: the top-level one is often English.
    preview: v.verified_languages?.find((l) => l.language === lang && l.preview_url)?.preview_url ?? v.preview_url,
    users: v.cloned_by_count,
  }))
}

/** Voices users picked as the best for a language, by the start of their library name. */
const PREFERRED: Record<string, string> = {
  hr: 'Slobodan - Persuasive',
}

/** The voice a language starts with: the preferred one when the library has it, else its most used. */
export async function elevenLabsDefaultVoice(language: string): Promise<VoiceOption | null> {
  const lang = language.split('-')[0]
  const preferred = PREFERRED[lang]
  if (preferred && getSecret('elevenlabs')) {
    const found = (await elevenLabsLibrary(lang, preferred.split(' ')[0]).catch(() => [])).find((v) => v.name.startsWith(preferred))
    if (found) return found
  }
  return (await elevenLabsLibrary(lang, '').catch(() => []))[0] ?? null
}

const previews = new Map<string, Promise<Uint8Array>>()

/**
 * A voice sample's audio, fetched here and played from memory: samples live on several hosts, and
 * the window may load media only from Studio itself. Only ElevenLabs' own hosts are fetched.
 */
export function voicePreview(url: string): Promise<Uint8Array> {
  const host = new URL(url).hostname
  if (!url.startsWith('https://') || !/(^|\.)(elevenlabs\.io|googleapis\.com)$/.test(host)) return Promise.reject(new Error('That sample isn’t from ElevenLabs.'))
  let p = previews.get(url)
  if (!p) {
    p = fetch(url).then(async (res) => {
      if (!res.ok) throw new Error(`The sample didn’t load (HTTP ${res.status}).`)
      return new Uint8Array(await res.arrayBuffer())
    })
    p.catch(() => previews.delete(url))
    previews.set(url, p)
  }
  return p
}

// --- OmniVoice worker ------------------------------------------------------------------

let workerUrl: Promise<string> | null = null
let workerChild: ChildProcess | null = null
let workerLog: (e: SetupEvent) => void = () => {}

export function onWorkerLog(fn: (e: SetupEvent) => void): void {
  workerLog = fn
}

/** Starts the OmniVoice worker once (the model takes a while to load) and returns its URL. */
export function ensureTtsWorker(): Promise<string> {
  if (workerUrl) return workerUrl
  const log = (line: string) => workerLog({ component: 'omnivoice', state: 'ready', line })
  workerUrl = new Promise<string>((resolve, reject) => {
    runRunner('omnivoice', ['tts-worker'], {
      onEvent: (e) => {
        if (e.type === 'loading') log(`Loading OmniVoice (${e.device})…`)
        if (e.type === 'ready') {
          log('OmniVoice is ready.')
          resolve(String(e.url))
        }
      },
    })
      .then((job) => {
        workerChild = job.child
        job.child.stderr?.on('data', (b: Buffer) => {
          const line = b.toString().trim().split('\n').pop()
          if (line) log(line.slice(0, 200))
        })
        job.done
          .then(() => reject(new Error('OmniVoice stopped')))
          .catch(reject)
          .finally(() => {
            workerUrl = null
            workerChild = null
          })
      })
      .catch((e) => {
        workerUrl = null
        reject(e)
      })
  })
  return workerUrl
}

export function stopTtsWorker(): void {
  workerChild?.kill()
  workerChild = null
  workerUrl = null
}
