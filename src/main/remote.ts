// Render servers (ADR 0021): exports rendered on another machine by the render worker
// (python/studio_worker, run in Docker from the manim-studio-renderer repository). The app pairs with
// one through the code it prints (address + token); the token is kept like the API keys.
import { createReadStream, createWriteStream, statSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { randomUUID } from 'node:crypto'
import { parsePairingCode } from '../shared/pairing'
import type { RenderServer, WorkerInfo } from '../shared/types'
import { getSecret, getSettings, setSecret, setSettings } from './settings'

const tokenOf = (id: string) => getSecret(`server-${id}`)

export function listServers(): RenderServer[] {
  return getSettings().renderServers
}

/** Pairs with a worker: checks the code against it, then keeps it. */
export async function addServer(code: string): Promise<RenderServer[]> {
  const { url, token } = parsePairingCode(code)
  const info = await workerInfo(url, token)
  const host = new URL(url).hostname
  // "acer.tail.razem.cc" → acer; an IP address stays whole.
  const server: RenderServer = { id: randomUUID(), name: /^[\d.]+$|:/.test(host) ? host : host.split('.')[0], url, cores: info.cores }
  setSecret(`server-${server.id}`, token)
  setSettings({ renderServers: [...listServers().filter((s) => s.url !== url), server] })
  return listServers()
}

export function removeServer(id: string): RenderServer[] {
  setSecret(`server-${id}`, '')
  setSettings({ renderServers: listServers().filter((s) => s.id !== id) })
  return listServers()
}

export async function checkServer(id: string): Promise<WorkerInfo> {
  const server = find(id)
  return workerInfo(server.url, tokenOf(id))
}

function find(id: string): RenderServer {
  const server = listServers().find((s) => s.id === id)
  if (!server) throw new Error('That render server isn’t paired any more (Settings → General → Render servers).')
  return server
}

async function workerInfo(url: string, token: string): Promise<WorkerInfo> {
  return call<WorkerInfo>(url, token, 'GET', '/info')
}

async function call<T>(url: string, token: string, method: string, path: string, signal?: AbortSignal): Promise<T> {
  let res: Response
  try {
    res = await fetch(new URL(path, url), { method, headers: { Authorization: `Bearer ${token}` }, signal: signal ?? AbortSignal.timeout(15_000) })
  } catch (e) {
    if (signal?.aborted) throw e
    throw new Error(`Couldn’t reach the render server at ${url}. Is it running, and is this computer on its network (Tailscale)?`)
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `The render server answered ${res.status}`)
  return body
}

interface RemoteJob {
  id: string
  state: 'waiting' | 'running' | 'done' | 'failed' | 'cancelled'
  stage: string
  percent: number | null
  error: string
  files: string[]
}

/** What the worker needs besides the project: the export's choices and enough to show progress. */
export interface RemoteOptions {
  themes: string[]
  size: number
  fps: number
  slug: string
  voice: unknown // STUDIO_VOICE without secrets: the worker only reads narration that's there
  animations: number
  duration?: number
  cacheKey: string
}

/**
 * Sends a packed project (tar.gz) to the server, follows the render, and downloads the files into
 * `folder`. Returns their file names. Stopping deletes the job on the server.
 */
export async function renderRemote(
  serverId: string,
  archive: string,
  options: RemoteOptions,
  folder: string,
  progress: (e: { stage: string; percent?: number }) => void,
  signal?: AbortSignal,
): Promise<string[]> {
  const server = find(serverId)
  const token = tokenOf(serverId)
  const job = await upload(server, token, archive, options, (p) => progress({ stage: `Sending the project to ${server.name}`, percent: p }), signal)
  try {
    for (let state = job; ; ) {
      if (state.state === 'failed') throw new Error(`On ${server.name}: ${state.error}`)
      if (state.state === 'cancelled') throw new Error(`The export was stopped on ${server.name}`)
      if (state.state === 'done') {
        for (const [i, name] of state.files.entries()) {
          progress({ stage: `Downloading from ${server.name}`, percent: i / state.files.length })
          await download(server, token, job.id, name, join(folder, name), signal)
        }
        return state.files
      }
      progress(state.state === 'waiting' ? { stage: `Queued on ${server.name}` } : { stage: `On ${server.name}: ${state.stage}`, percent: state.percent ?? undefined })
      await new Promise((r) => setTimeout(r, 2000))
      if (signal?.aborted) throw Object.assign(new Error('cancelled'), { cancelled: true })
      state = await call<RemoteJob>(server.url, token, 'GET', `/jobs/${job.id}`)
    }
  } finally {
    // Done or not, the server needn't keep it: the files are here, or nobody wants them.
    void call(server.url, token, 'DELETE', `/jobs/${job.id}`).catch(() => undefined)
  }
}

/** Streams the archive with its length (the worker's http.server reads no chunked bodies). */
function upload(server: RenderServer, token: string, archive: string, options: RemoteOptions, onProgress: (p: number) => void, signal?: AbortSignal): Promise<RemoteJob> {
  const url = new URL('/jobs', server.url)
  const size = statSync(archive).size
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/gzip',
        'Content-Length': size,
        'X-Studio-Job': Buffer.from(JSON.stringify(options)).toString('base64'),
      },
    })
    req.on('response', (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (text += c))
      res.on('end', () => {
        let body: RemoteJob & { error?: string }
        try {
          body = JSON.parse(text)
        } catch {
          return reject(new Error(`${server.name} sent an answer Studio didn’t understand`))
        }
        if (res.statusCode !== 200) reject(new Error(`${server.name}: ${body.error ?? `HTTP ${res.statusCode}`}`))
        else resolve(body)
      })
    })
    req.on('error', (e) => reject(signal?.aborted ? Object.assign(new Error('cancelled'), { cancelled: true }) : new Error(`Couldn’t send the project to ${server.name}: ${e.message}`)))
    let sent = 0
    const file = createReadStream(archive)
    file.on('data', (chunk) => onProgress((sent += chunk.length) / size))
    file.pipe(req)
  })
}

async function download(server: RenderServer, token: string, jobId: string, name: string, to: string, signal?: AbortSignal): Promise<void> {
  const res = await fetch(new URL(`/jobs/${jobId}/files/${encodeURIComponent(name)}`, server.url), { headers: { Authorization: `Bearer ${token}` }, signal })
  if (!res.ok || !res.body) throw new Error(`Couldn’t download ${name} from ${server.name} (HTTP ${res.status})`)
  await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), createWriteStream(to))
}
