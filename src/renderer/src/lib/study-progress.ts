import { useSyncExternalStore } from 'react'
import { readStudyProgress, type StudyProgress } from '../../../shared/study-playback'

const key = (dir: string) => `watch:project:${dir}`
const listeners = new Map<string, Set<() => void>>()
const read = (dir: string): string | null => { try { return localStorage.getItem(key(dir)) } catch { return null } }

/** The player publishes at most once a second; only this video's sidebar row subscribes. */
export function saveStudyProgress(dir: string, progress: StudyProgress): void {
  const value = JSON.stringify({ position: progress.position, duration: progress.duration, completed: progress.completed })
  try {
    if (read(dir) === value) return
    localStorage.setItem(key(dir), value)
    listeners.get(dir)?.forEach((notify) => notify())
  } catch { /* Playback remains usable without optional local history. */ }
}

export function useStudyProgress(dir: string): StudyProgress | null {
  const raw = useSyncExternalStore((notify) => {
    let list = listeners.get(dir)
    if (!list) listeners.set(dir, list = new Set())
    list.add(notify)
    const stored = (event: StorageEvent) => { if (event.key === key(dir) || event.key === null) notify() }
    window.addEventListener('storage', stored)
    return () => {
      list.delete(notify)
      if (!list.size) listeners.delete(dir)
      window.removeEventListener('storage', stored)
    }
  }, () => read(dir), () => null)
  return readStudyProgress(raw)
}
