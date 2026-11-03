// Background failures nobody awaits (queues, schedulers): logged, and shown in the app as an error.
let show: (e: { title: string; message: string }) => void = () => {}

export const showErrorsWith = (fn: typeof show): void => {
  show = fn
}

/** `title` is UI copy (translated in the window); stopping on purpose isn't an error. */
export function reportError(title: string, error: unknown): void {
  console.error(`[${title}]`, error)
  const message = error instanceof Error ? error.message : String(error)
  if (message !== 'Stopped' && (error as Error)?.name !== 'AbortError') show({ title, message })
}
