import { execFile } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { cpus, freemem, totalmem } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { ResourceSample } from '../shared/episode-metrics'

const exec = promisify(execFile)
interface ProcessPoint {
  pid: number
  parent: number
  ram: number
  cpu: number
}
const cpuTotals = () =>
  cpus().reduce((sum, c) => ({ idle: sum.idle + c.times.idle, total: sum.total + Object.values(c.times).reduce((a, b) => a + b, 0) }), { idle: 0, total: 0 })

export function descendantProcesses(all: ProcessPoint[], root: number): ProcessPoint[] {
  const ids = new Set([root])
  for (let grew = true; grew; ) {
    grew = false
    for (const p of all)
      if (!ids.has(p.pid) && ids.has(p.parent)) {
        ids.add(p.pid)
        grew = true
      }
  }
  return all.filter((p) => ids.has(p.pid))
}

export function cpuTimeSeconds(value: string): number {
  const [days, clock] = value.includes('-') ? value.split('-') : ['0', value]
  return Number(days) * 86400 + clock.split(':').reduce((sum, part) => sum * 60 + Number(part), 0)
}

/** Sampled process-tree RSS and CPU, plus device-wide CPU/GPU. Never asks for administrator access. */
export function resourceSampler(root = process.pid) {
  let beforeCpu = cpuTotals()
  let beforeAt = Date.now()
  let beforeProcesses = new Map<number, number>()
  return async (): Promise<ResourceSample> => {
    const point: ResourceSample = { at: Date.now(), systemRamMb: (totalmem() - freemem()) / 2 ** 20, unavailable: [] }
    const nowCpu = cpuTotals()
    const total = nowCpu.total - beforeCpu.total
    if (total > 0) point.systemCpuPercent = Math.max(0, Math.min(100, 100 * (1 - (nowCpu.idle - beforeCpu.idle) / total)))
    beforeCpu = nowCpu
    try {
      let all: ProcessPoint[]
      if (process.platform === 'win32') {
        const script = `$metricProcs = @(Get-CimInstance Win32_Process | Where-Object ProcessId -ne $PID | ForEach-Object { @{pid=[int]$_.ProcessId;parent=[int]$_.ParentProcessId;ram=[double]$_.WorkingSetSize;cpu=([double]$_.UserModeTime+[double]$_.KernelModeTime)/10000000} }); $metricGpu = $null; try { $metricGpu = (Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction Stop | Measure-Object UtilizationPercentage -Maximum).Maximum } catch {}; @{processes=$metricProcs;gpu=$metricGpu} | ConvertTo-Json -Depth 4 -Compress`
        const { stdout } = await exec(
          join(process.env.SystemRoot ?? 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
          ['-NoProfile', '-NonInteractive', '-Command', script],
          { windowsHide: true, timeout: 4500, maxBuffer: 8 << 20 },
        )
        const data = JSON.parse(stdout)
        all = data.processes
        if (data.gpu != null) {
          point.gpuPercent = Math.max(0, Math.min(100, Number(data.gpu)))
          point.gpuSource = 'Windows device-wide busiest GPU engine'
        }
      } else {
        const { stdout } = await exec('/bin/ps', ['-axo', 'pid=,ppid=,rss=,time='], { timeout: 4000, maxBuffer: 8 << 20 })
        all = stdout.split('\n').flatMap((line) => {
          const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+([\d:.-]+)$/)
          return m ? [{ pid: +m[1], parent: +m[2], ram: +m[3] * 1024, cpu: cpuTimeSeconds(m[4]) }] : []
        })
      }
      const ours = descendantProcesses(all, root)
      if (!ours.length) throw new Error('Process tree unavailable')
      point.appRamMb = ours.reduce((n, p) => n + p.ram / 2 ** 20, 0)
      const elapsed = (point.at - beforeAt) / 1000
      if (beforeProcesses.size && elapsed > 0)
        point.appCpuPercent = Math.max(
          0,
          Math.min(
            100,
            (100 * ours.reduce((n, p) => n + (beforeProcesses.has(p.pid) ? Math.max(0, p.cpu - beforeProcesses.get(p.pid)!) : 0), 0)) /
              elapsed /
              Math.max(1, cpus().length),
          ),
        )
      beforeProcesses = new Map(ours.map((p) => [p.pid, p.cpu]))
      beforeAt = point.at
    } catch {
      point.unavailable!.push('App process-tree CPU/RAM counters unavailable for this sample.')
    }
    // NVIDIA provides device-wide utilization and VRAM without elevated permissions.
    const nvidia = (
      process.platform === 'win32'
        ? [join(process.env.SystemRoot ?? 'C:/Windows', 'System32/nvidia-smi.exe'), 'C:/Program Files/NVIDIA Corporation/NVSMI/nvidia-smi.exe']
        : ['/usr/bin/nvidia-smi']
    ).find(existsSync)
    if (nvidia) {
      try {
        const { stdout } = await exec(nvidia, ['--query-gpu=utilization.gpu,memory.used', '--format=csv,noheader,nounits'], {
          windowsHide: true,
          timeout: 2500,
        })
        const rows = stdout
          .trim()
          .split('\n')
          .map((line) => line.split(',').map(Number))
          .filter((r) => r.every(Number.isFinite))
        if (rows.length) {
          point.gpuPercent = Math.max(...rows.map((r) => r[0]))
          point.gpuMemoryMb = rows.reduce((n, r) => n + r[1], 0)
          point.gpuSource = 'NVIDIA device-wide utilization (busiest device), total VRAM'
        }
      } catch {
        /* retain OS counters when available */
      }
    } else if (process.platform === 'linux') {
      try {
        const devices = readdirSync('/sys/class/drm')
          .filter((name) => /^card\d+$/.test(name))
          .map((name) => `/sys/class/drm/${name}/device`)
        const busy = devices
          .filter((d) => existsSync(join(d, 'gpu_busy_percent')))
          .map((d) => Number(readFileSync(join(d, 'gpu_busy_percent'), 'utf8')))
          .filter(Number.isFinite)
        if (busy.length) {
          point.gpuPercent = Math.max(...busy)
          point.gpuSource = 'Linux device-wide gpu_busy_percent (busiest device)'
        }
      } catch {
        /* no supported sysfs counters */
      }
    }
    if (point.gpuPercent === undefined)
      point.unavailable!.push('GPU utilization unavailable: no supported unprivileged device counter. No zero or estimate was substituted.')
    return point
  }
}
