/** A cancellable, stable priority queue. Lower numbers run first; capacity 0 is unlimited. */
export class WorkSlots {
  private active = 0
  private waiting: { priority: number; resolve: (release: () => void) => void; reject: (error: Error) => void; signal?: AbortSignal; abort: () => void }[] = []
  private capacity: number
  constructor(capacity = 0) { this.capacity = capacity }

  setCapacity(capacity: number): void { this.capacity = capacity; this.pump() }
  acquire(signal?: AbortSignal, priority = 0, onWait?: () => void): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(Object.assign(new Error('Stopped'), { cancelled: true }))
    return new Promise((resolve, reject) => {
      const entry = { priority, resolve, reject, signal, abort: () => {
        this.waiting = this.waiting.filter((job) => job !== entry)
        signal?.removeEventListener('abort', entry.abort)
        reject(Object.assign(new Error('Stopped'), { cancelled: true }))
      } }
      this.waiting.push(entry)
      signal?.addEventListener('abort', entry.abort, { once: true })
      this.pump()
      if (this.waiting.includes(entry)) onWait?.()
    })
  }
  private pump(): void {
    this.waiting.sort((a, b) => a.priority - b.priority)
    while (this.waiting.length && (!this.capacity || this.active < this.capacity)) {
      const job = this.waiting.shift()!
      job.signal?.removeEventListener('abort', job.abort)
      this.active++
      let released = false
      job.resolve(() => { if (released) return; released = true; this.active--; this.pump() })
    }
  }
}

export const agentConcurrency = (value: unknown): number => typeof value === 'number' && Number.isSafeInteger(Math.round(value)) && value > 0 ? Math.max(1, Math.round(value)) : 0
