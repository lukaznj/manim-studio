// Tracks short, non-interruptible setup transactions. Long-running agents use resumable checkpoints.
let closing = false
const critical = new Set<Promise<unknown>>()
export const shutdownRequested = () => closing
export const setShutdownRequested = (value: boolean) => { closing = value }
export const criticalWork = () => critical.size > 0

export async function protectWork<T>(work: () => Promise<T>): Promise<T> {
  if (closing) throw new Error('The app is closing. Try again after reopening it.')
  const pending = Promise.resolve().then(work)
  critical.add(pending)
  try {
    return await pending
  } finally {
    critical.delete(pending)
  }
}

export async function settleCriticalWork(): Promise<void> {
  while (critical.size) await Promise.allSettled([...critical])
}

/** One quit at a time, including a second quit/shutdown while the confirmation is open. */
export class QuitCoordinator {
  private pending: Promise<void> | null = null
  private system = false
  private systemRequested: (() => void) | null = null
  ready = false

  private readonly hooks: {
    settle: () => Promise<void>
    busy: () => boolean
    confirm: () => Promise<boolean>
    prepare: () => Promise<void>
    exit: () => void
    failed: (error: unknown) => void
  }

  constructor(hooks: QuitCoordinator['hooks']) { this.hooks = hooks }

  request(system = false): Promise<void> {
    this.system ||= system
    if (system) this.systemRequested?.()
    if (this.pending) return this.pending
    this.pending = this.run().finally(() => { this.pending = null })
    return this.pending
  }

  private async run(): Promise<void> {
    setShutdownRequested(true)
    try {
      await this.hooks.settle()
      if (!this.system && this.hooks.busy()) {
        const shutdown = new Promise<boolean>((resolve) => { this.systemRequested = () => resolve(true) })
        if (!(await Promise.race([this.hooks.confirm(), shutdown])) && !this.system) return
      }
      await this.hooks.prepare()
      this.ready = true
      this.hooks.exit()
    } catch (error) {
      this.hooks.failed(error)
    } finally {
      if (!this.ready) setShutdownRequested(false)
      this.system = false
      this.systemRequested = null
    }
  }
}
