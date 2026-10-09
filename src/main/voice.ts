// Recordings, voice listings and the local OmniVoice worker.
import { execFile, type ChildProcess } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { ProjectMeta, SetupEvent, VoiceOption } from '../shared/types'
import { setupStatus } from './env'
import { listRecordings, project, requireProject } from './projects'
import { runRunner } from './runner'
import { getSecret } from './settings'

const exec = promisify(execFile)

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

export async function elevenLabsVoices(): Promise<VoiceOption[]> {
  const key = getSecret('elevenlabs')
  if (!key) throw new Error('Add your ElevenLabs API key first')
  const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } })
  // ElevenLabs explains failures in detail.message, e.g. a key created without the voices_read permission.
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: { message?: string } } | null
    throw new Error(`ElevenLabs: ${body?.detail?.message ?? `HTTP ${res.status}`}`)
  }
  const data = (await res.json()) as { voices: { voice_id: string; name: string; labels?: Record<string, string> }[] }
  return data.voices.map((v) => ({
    id: v.voice_id,
    name: v.name,
    description: Object.values(v.labels ?? {}).join(' · '),
  }))
}

export async function systemVoices(): Promise<VoiceOption[]> {
  if (process.platform !== 'darwin') return []
  const { stdout } = await exec('say', ['-v', '?'])
  const voices = stdout
    .split('\n')
    .map((line) => line.match(/^(.+?)\s+([a-z]{2}_[A-Z]{2})\s+#\s*(.*)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    // Newer voices are listed as "Lana (Croatian (Croatia))"; `say -v` wants just "Lana".
    .map((m) => ({ id: m[1].replace(/\s*\(.*\)$/, '').trim(), name: m[1].trim(), description: `${m[2]} — ${m[3]}` }))
  // The project's language first, then the rest; the list repeats some voices.
  const lang = (project()?.meta.voice.language ?? 'en').split('-')[0] + '_'
  const seen = new Set<string>()
  return [...voices.filter((v) => v.description.startsWith(lang)), ...voices.filter((v) => !v.description.startsWith(lang))].filter(
    (v) => !seen.has(v.id) && seen.add(v.id),
  )
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
