/** Authoring is estimated by completed sections, never by tokens or elapsed time. */
export type ProductionPhase = 'script' | 'scene' | 'check'
export interface PhaseProgress {
  completed: number
  total: number
  done?: boolean
  detail?: string
}
export type ProductionProgress = Partial<Record<ProductionPhase, PhaseProgress>> & { preview?: PhaseProgress }

export function phasePercent(progress?: PhaseProgress): number | undefined {
  if (progress?.done) return 100
  if (!progress || !Number.isFinite(progress.total) || progress.total <= 0 || !Number.isFinite(progress.completed)) return undefined
  // Only the coordinator may finish a phase; an agent's estimate cannot claim completion.
  return Math.min(99, Math.max(0, Math.floor(progress.completed / progress.total * 100)))
}

/** Fallback for agents that omit progress calls; a heading by itself is not written content. */
export function artifactProgress(script: string, scene: string): ProductionProgress {
  const sections = [...script.matchAll(/^## (.+)\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)]
  if (!sections.length) return {}
  const ready = sections.filter((section) => !/\[pending\]/i.test(section[2]) && section[2].trim().length > 60).length
  const blocks = [...scene.matchAll(/^[\t ]*self\.next_section\(\s*(["'])(.+?)\1[^\n]*\n([\s\S]*?)(?=^[\t ]*self\.next_section\(|$(?![\s\S]))/gm)]
  // Declaring all chapter names up front does not mean their animation code is written.
  const names = new Set(blocks.filter((m) => /\bself\.(?:play|wait|add)\(/.test(m[3].replace(/^\s*#.*$/gm, ''))).map((m) => m[2].trim()))
  const implemented = sections.filter((section) => names.has(section[1].trim())).length
  return { script: { completed: ready, total: sections.length }, scene: { completed: implemented, total: sections.length } }
}
