/**
 * Resolves with the first value `settled` accepts, checking now and on each `subscribe` callback,
 * or with the latest value when `ms` runs out.
 */
export function waitUntil<T>(read: () => T, settled: (value: T) => boolean, subscribe: (changed: () => void) => () => void, ms: number): Promise<T> {
  return new Promise((resolve) => {
    const first = read()
    if (settled(first)) return resolve(first)
    const finish = () => { clearTimeout(timer); stop(); resolve(read()) }
    const stop = subscribe(() => { if (settled(read())) finish() })
    const timer = setTimeout(finish, ms)
  })
}
