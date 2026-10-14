// Talks to `python -m studio_runner`: JSON events on stdout behind a prefix, everything
// else (manim's own logging, tracebacks) collected as the log.
import type { ChildProcess } from 'node:child_process'
import { spawnPython, type EnvName } from './env'

const PREFIX = '@@studio '

export interface RunnerEvent {
  type: string
  [key: string]: unknown
}

/** Python jobs still running, by pid: what each was asked to do, for the memory log (memory.ts). */
export const runningJobs = new Map<number, { what: string; since: string; log: () => string }>()

export interface RunnerJob<T> {
  child: ChildProcess
  done: Promise<T>
  log: () => string
}

export async function runRunner<T = RunnerEvent>(
  env: EnvName,
  args: string[],
  opts: { extraEnv?: Record<string, string>; onEvent?: (e: RunnerEvent) => void; cwd?: string; signal?: AbortSignal } = {},
): Promise<RunnerJob<T>> {
  const child = await spawnPython(env, args, opts.extraEnv, opts.cwd)
  const log: string[] = []
  let final: RunnerEvent | null = null
  let pending = ''

  const onStdout = (buf: Buffer) => {
    pending += buf.toString('utf8')
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) {
      if (line.startsWith(PREFIX)) {
        const event = JSON.parse(line.slice(PREFIX.length)) as RunnerEvent
        if (event.type === 'done' || event.type === 'error') final = event
        opts.onEvent?.(event)
      } else if (line.trim()) {
        pushLog(log, line)
      }
    }
  }
  child.stdout?.on('data', onStdout)
  child.stderr?.on('data', (b: Buffer) => b.toString('utf8').split('\n').forEach((l) => l.trim() && pushLog(log, l)))

  // Aborting kills the process; `done` then rejects with { cancelled: true }.
  const stop = () => child.kill()
  opts.signal?.addEventListener('abort', stop)
  if (opts.signal?.aborted) stop()
  child.on('close', () => opts.signal?.removeEventListener('abort', stop))

  const pid = child.pid
  if (pid) runningJobs.set(pid, { what: `${env}: ${args.join(' ')}`.slice(0, 400), since: new Date().toISOString(), log: () => log.join('\n') })

  const done = new Promise<T>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (pid) runningJobs.delete(pid)
      const event = final as RunnerEvent | null
      if (event?.type === 'done') resolve(event as T)
      else if (event?.type === 'error') reject(Object.assign(new Error(String(event.message)), { event, log: log.join('\n') }))
      else if (signal || opts.signal?.aborted) reject(Object.assign(new Error('cancelled'), { cancelled: true })) // Windows reports a kill as an exit code
      else reject(Object.assign(new Error(`Python exited with code ${code}`), { log: log.join('\n') }))
    })
  })
  return { child, done, log: () => log.join('\n') }
}

function pushLog(log: string[], line: string) {
  log.push(line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, ''))
  if (log.length > 400) log.shift()
}
