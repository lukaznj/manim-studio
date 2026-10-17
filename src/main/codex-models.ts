import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import pkg from '../../package.json' with { type: 'json' }
import type { Effort, ModelOption, PlanUsage } from '../shared/types'

/** Read-only catalog discovery through the managed CLI. No login token is read by Studio. */
export function listCodexModels(bin: string, env: Record<string, string>): Promise<ModelOption[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['app-server'], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    const lines = createInterface({ input: child.stdout })
    const models: ModelOption[] = []
    let finished = false
    let id = 0
    const cursors = new Set<string>()
    const finish = (error?: Error) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      lines.close()
      child.kill()
      if (error) reject(error)
      else resolve(models)
    }
    const timer = setTimeout(() => finish(new Error('Codex model discovery timed out. Try again from Settings → Accounts.')), 15000)
    const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`)
    child.on('error', finish)
    child.stdin.on('error', finish)
    child.stderr.resume()
    child.on('exit', () => finish(new Error('Codex stopped before returning its model catalog.')))
    lines.on('line', (line) => {
      try {
        const message = JSON.parse(line)
        if (message.id !== id) return
        if (message.error) return finish(new Error(message.error.message || 'Codex could not list models.'))
        if (id === 0) {
          send({ method: 'initialized', params: {} })
        } else {
          for (const model of message.result?.data ?? []) {
            if (model.hidden || !model.model || models.some((m) => m.value === model.model)) continue
            const efforts: Effort[] = (model.supportedReasoningEfforts ?? [])
              .map((e: { reasoningEffort: string }) => e.reasoningEffort)
              .filter((e: string) => ['low', 'medium', 'high', 'xhigh', 'max'].includes(e))
            models.push({ value: model.model, label: model.displayName || model.model, description: model.description || '', efforts })
          }
          const cursor = message.result?.nextCursor
          if (!cursor) return finish()
          if (cursors.has(cursor)) return finish(new Error('Codex returned a repeated model catalog page.'))
          cursors.add(cursor)
        }
        const cursor = id === 0 ? undefined : message.result?.nextCursor
        send({ method: 'model/list', id: ++id, params: { limit: 100, includeHidden: false, ...(cursor ? { cursor } : {}) } })
      } catch {
        // CLI diagnostics are not protocol replies.
      }
    })
    send({ method: 'initialize', id, params: { clientInfo: { name: 'manim_studio', title: 'Manim Studio', version: pkg.version } } })
  })
}

/** Account-wide limits, read through the CLI's own authenticated service. */
export function readCodexRateLimits(bin: string, env: Record<string, string>): Promise<PlanUsage | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['app-server'], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    const lines = createInterface({ input: child.stdout })
    let done = false
    const finish = (result: PlanUsage | null, error?: Error) => {
      if (done) return
      done = true
      clearTimeout(timer)
      lines.close()
      child.kill()
      if (error) reject(error)
      else resolve(result)
    }
    const timer = setTimeout(() => finish(null, new Error('Codex account limit read timed out.')), 10000)
    const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`)
    child.on('error', (e) => finish(null, e))
    child.stdin.on('error', (e) => finish(null, e))
    child.stderr.resume()
    child.on('exit', () => finish(null))
    lines.on('line', (line) => {
      try {
        const message = JSON.parse(line)
        if (message.error) return finish(null)
        if (message.id === 0) {
          send({ method: 'initialized', params: {} })
          send({ method: 'account/rateLimits/read', id: 1 })
        }
        if (message.id === 1) {
          const result = message.result ?? {}
          const buckets = result.rateLimitsByLimitId ? Object.values(result.rateLimitsByLimitId) : result.rateLimits ? [result.rateLimits] : []
          const windows: PlanUsage['windows'] = []
          for (const raw of buckets) {
            const bucket = raw as {
              limitName?: string
              limitId?: string
              primary?: { usedPercent: number; windowDurationMins: number; resetsAt?: number }
              secondary?: { usedPercent: number; windowDurationMins: number; resetsAt?: number }
            }
            for (const window of [bucket.primary, bucket.secondary])
              if (window && Number.isFinite(window.usedPercent)) {
                const minutes = window.windowDurationMins
                windows.push({
                  label: `${bucket.limitName || bucket.limitId || 'Codex'} · ${minutes === 10080 ? 'Weekly limit' : minutes === 300 ? '5-hour limit' : `${minutes} minute window`}`,
                  percent: window.usedPercent,
                  resetsAt: window.resetsAt ? new Date(window.resetsAt * 1000).toISOString() : null,
                })
              }
          }
          finish(windows.length ? { windows, checkedAt: Date.now() } : null)
        }
      } catch {
        /* ignore non-protocol diagnostics */
      }
    })
    send({ method: 'initialize', id: 0, params: { clientInfo: { name: 'manim_studio_metrics', title: 'Manim Studio metrics', version: pkg.version } } })
  })
}
