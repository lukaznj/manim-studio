// Series mode's plan, as Claude answers it (src/main/series.ts), checked before the user sees it.
import type { SeriesPlan } from './types'

/** Claude's JSON, checked: at least one episode, and only files that were given. */
export function parsePlan(answer: string, files: string[], title?: string): SeriesPlan {
  let plan: SeriesPlan
  try {
    plan = JSON.parse(answer.slice(answer.indexOf('{'), answer.lastIndexOf('}') + 1)) as SeriesPlan
  } catch {
    throw new Error('Claude’s plan wasn’t readable. Try again.')
  }
  const episodes = (Array.isArray(plan.episodes) ? plan.episodes : [])
    .filter((e) => e && typeof e.title === 'string' && e.title.trim())
    .map((e) => ({
      title: e.title.trim(),
      summary: String(e.summary ?? '').trim(),
      sources: (Array.isArray(e.sources) ? e.sources : []).filter((s) => files.includes(s?.file)).map((s) => ({ file: s.file, pages: s.pages ? String(s.pages) : undefined })),
      buildsOn: Array.isArray(e.buildsOn) ? e.buildsOn.filter((n) => Number.isInteger(n)) : [],
    }))
  if (!episodes.length) throw new Error('Claude didn’t propose any episodes. Try again, or with fewer PDFs.')
  return { title: (title || String(plan.title ?? '')).trim() || 'Untitled series', bible: String(plan.bible ?? '').trim(), episodes }
}
