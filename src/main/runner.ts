// Talks to `python -m studio_runner`: JSON events on stdout behind a prefix, everything
// else (manim's own logging, tracebacks) collected as the log.
import { spawn, type ChildProcess } from 'node:child_process'
import { reportDependencyFailure, spawnPython, type EnvName } from './env'
import { dependencyFailure, REPAIR_MESSAGE } from './dependency-health'

const PREFIX = '@@studio '

export interface RunnerEvent {
  type: string
  [key: string]: unknown
}

/** Python jobs still running, by pid: what each was asked to do (the memory log, memory.ts) and whose they are (pausing). */
export const runningJobs = new Map<number, { what: string; since: string; log: () => string; tag?: string }>()

// --- pausing: a render's processes stopped and continued as a group ('preview', or an export's id) ---

const paused = new Set<string>()
const children = new Map<ChildProcess, Promise<unknown>>()
const starting = new Set<Promise<ChildProcess>>()
let stopping = false

/** Cancel and reap every Python job, including a child whose environment was still starting. */
export async function stopRunners(): Promise<void> {
  stopping = true
  resumeAll()
  for (const child of children.keys()) killJob(child)
  await Promise.allSettled([...starting])
  while (children.size) await Promise.allSettled([...children.values()])
}

/** Pauses or resumes every process of a render, and those it starts while paused. */
export function pauseTag(tag: string, on: boolean): void {
  if (on) paused.add(tag)
  else paused.delete(tag)
  for (const [pid, job] of runningJobs) if (job.tag === tag) suspend(pid, on)
}

export const isPaused = (tag: string): boolean => paused.has(tag)

/** Before quitting: nothing stays stopped behind the app. */
export function resumeAll(): void {
  for (const tag of [...paused]) pauseTag(tag, false)
}

/**
 * macOS and Linux stop and continue a process with signals. Windows has none: its NtSuspendProcess
 * and NtResumeProcess do the same, reached through PowerShell.
 */
function suspend(pid: number, on: boolean): void {
  try {
    if (process.platform !== 'win32') return void process.kill(-pid, on ? 'SIGSTOP' : 'SIGCONT')
    const fn = on ? 'NtSuspendProcess' : 'NtResumeProcess'
    const script = `Add-Type -Name P -Namespace S -MemberDefinition '[DllImport("ntdll.dll")] public static extern int ${fn}(IntPtr h);'; [S.P]::${fn}((Get-Process -Id ${pid}).Handle)`
    spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: 'ignore' })
  } catch {
    // the process ended meanwhile
  }
}

/** Stops a render's process, paused or not (a stopped process ignores SIGTERM until continued). */
export function killJob(child: ChildProcess): void {
  if (child.pid && process.platform !== 'win32') suspend(child.pid, false)
  const terminate = (force: boolean) => {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
      } else process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM')
    } catch { child.kill(force ? 'SIGKILL' : 'SIGTERM') }
  }
  terminate(false)
  const timer = setTimeout(() => terminate(true), 5000)
  timer.unref()
  child.once('close', () => clearTimeout(timer))
}

export interface RunnerJob<T> {
  child: ChildProcess
  done: Promise<T>
  log: () => string
}

export async function runRunner<T = RunnerEvent>(
  env: EnvName,
  args: string[],
  opts: { extraEnv?: Record<string, string>; onEvent?: (e: RunnerEvent) => void; cwd?: string; signal?: AbortSignal; tag?: string } = {},
): Promise<RunnerJob<T>> {
  if (stopping) throw Object.assign(new Error('cancelled'), { cancelled: true })
  const spawn = spawnPython(env, args, opts.extraEnv, opts.cwd)
  starting.add(spawn)
  let child: ChildProcess
  try { child = await spawn } finally { starting.delete(spawn) }
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
  const stop = () => killJob(child)
  opts.signal?.addEventListener('abort', stop)
  if (opts.signal?.aborted) stop()
  child.on('close', () => opts.signal?.removeEventListener('abort', stop))

  const pid = child.pid
  if (pid) runningJobs.set(pid, { what: `${env}: ${args.join(' ')}`.slice(0, 400), since: new Date().toISOString(), log: () => log.join('\n'), tag: opts.tag })
  if (pid && opts.tag && paused.has(opts.tag)) suspend(pid, true) // the next step of a paused render waits too

  const done = new Promise<T>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (pending) onStdout(Buffer.from('\n')) // retain a final event/log line without a trailing newline
      if (pid) runningJobs.delete(pid)
      const event = final as RunnerEvent | null
      const broken = !opts.signal?.aborted && dependencyFailure(`${log.join('\n')}\n${event?.message ?? ''}`, env)
      if (broken) {
        reportDependencyFailure(broken)
        reject(Object.assign(new Error(REPAIR_MESSAGE), { event, log: log.join('\n'), component: broken }))
        return
      }
      if (event?.type === 'done') resolve(event as T)
      else if (event?.type === 'error') reject(Object.assign(new Error(String(event.message)), { event, log: log.join('\n') }))
      else if (signal || opts.signal?.aborted) reject(Object.assign(new Error('cancelled'), { cancelled: true })) // Windows reports a kill as an exit code
      else reject(Object.assign(new Error(`Python exited with code ${code}`), { log: log.join('\n') }))
    })
  })
  children.set(child, done)
  void done.finally(() => children.delete(child)).catch(() => undefined)
  if (stopping) stop()
  return { child, done, log: () => log.join('\n') }
}

function pushLog(log: string[], line: string) {
  log.push(line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, ''))
  if (log.length > 400) log.shift()
}
