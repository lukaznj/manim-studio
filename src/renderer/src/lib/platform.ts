// Labels that differ by OS. The shortcut handlers accept Cmd and Ctrl alike.
const mac = navigator.userAgent.includes('Mac')

/** `shortcut('S')` is ⌘S on macOS and Ctrl+S elsewhere; `shift` adds ⇧ / Shift+. */
export function shortcut(key: string, shift = false): string {
  return mac ? `⌘${shift ? '⇧' : ''}${key}` : `Ctrl+${shift ? 'Shift+' : ''}${key}`
}

/** The modifier alone, for "⌘ + scroll" style hints. */
export const modKey = mac ? '⌘' : 'Ctrl'

/** What the OS calls revealing a file in its file manager. */
export const revealLabel = mac ? 'Show in Finder' : 'Show in Explorer'
