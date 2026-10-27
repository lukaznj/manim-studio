import { useSyncExternalStore } from 'react'

const subscribe = (changed: () => void) => {
  document.addEventListener('fullscreenchange', changed)
  return () => document.removeEventListener('fullscreenchange', changed)
}

/** Fullscreen owns the player and its existing assistant, preserving drafts and playback. */
export function useStudyFullscreen(): boolean {
  return useSyncExternalStore(subscribe, () => !!document.fullscreenElement?.matches('.study-view'))
}
