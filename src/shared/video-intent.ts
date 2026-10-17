import type { AppMode } from './types'

/** Both defaults chat requests to a study video; publishing must be explicit. */
export function videoIntent(mode: AppMode | undefined, intent?: 'learn' | 'create'): 'learn' | 'create' {
  if (mode === 'learn') return 'learn'
  if (mode === 'create') return 'create'
  return intent ?? 'learn'
}
