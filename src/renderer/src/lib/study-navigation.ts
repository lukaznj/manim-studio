import type { StudySelection } from '../../../shared/study-navigation'

const key = (folder: string) => `study:selection:${folder}`
export function readStudySelection(folder: string): unknown {
  try { return JSON.parse(localStorage.getItem(key(folder)) ?? 'null') } catch { return null }
}
export function rememberStudySelection(folder: string, value: StudySelection): void {
  try { localStorage.setItem(key(folder), JSON.stringify(value)) } catch { /* Navigation remains usable without optional local storage. */ }
}
