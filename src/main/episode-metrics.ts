import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentSelection } from '../shared/types'
import type { DeveloperMetricsOptions, EpisodeMetrics, VoiceUsageSample } from '../shared/episode-metrics'
import { renderMetricsReport, type ReportEpisode } from '../shared/metrics-report'
import { claudeUsage } from './claude'
import { codexPlanUsage } from './codex'
import { bindVoiceMetrics } from './metrics-state'
import { readMeta } from './projects'
import { resourceSampler } from './resource-metrics'
import { getSettings } from './settings'
import { readUsage } from './usage'
import { elevenLabsUsage } from './voice'
import { fakeAgents } from './agent-fake'

const file = (dir: string) => join(dir, '.studio', 'episode-metrics.json')
const active = new Map<
  string,
  { metrics: EpisodeMetrics; selection: AgentSelection; timer: ReturnType<typeof setInterval>; sample: (final?: boolean) => Promise<void>; pending: Promise<void> | null }
>()
const save = (dir: string, metrics: EpisodeMetrics) => {
  mkdirSync(join(dir, '.studio'), { recursive: true })
  writeFileSync(file(dir), JSON.stringify(metrics))
}

export async function beginEpisodeMetrics(dir: string, selection: AgentSelection, options?: DeveloperMetricsOptions): Promise<void> {
  if (!options || active.has(dir)) return
  let previous: EpisodeMetrics | undefined
  try {
    previous = JSON.parse(readFileSync(file(dir), 'utf8'))
  } catch {
    /* first attempt */
  }
  const metrics: EpisodeMetrics = previous ?? {
    version: 1,
    title: readMeta(dir).name,
    selection,
    options,
    startedAt: Date.now(),
    phases: [],
    resources: [],
    accounts: [],
    notes: [],
  }
  if (previous?.finishedAt) metrics.phases.push({ at: previous.finishedAt, name: 'Stopped' })
  else if (previous) {
    const last = Math.max(metrics.phases.at(-1)?.at ?? metrics.startedAt, metrics.resources.at(-1)?.at ?? 0, metrics.accounts.at(-1)?.at ?? 0)
    metrics.phases.push({ at: last, name: 'Stopped' })
    metrics.notes.push(
      'A previous app session ended without final counters. Offline time is excluded after the last recorded timestamp; end-of-session usage may be missing.',
    )
  }
  metrics.finishedAt = undefined
  metrics.outcome = undefined
  metrics.phases.push({ at: Date.now(), name: 'Metrics setup' })
  const resource = resourceSampler()
  let accountAt = 0
  const tracker = {
    metrics,
    selection: metrics.selection,
    timer: null as unknown as ReturnType<typeof setInterval>,
    sample: async (_final = false) => {},
    pending: null as Promise<void> | null,
  }
  tracker.sample = async (final = false) => {
    if (tracker.pending) {
      if (!final) return
      await tracker.pending
    }
    tracker.pending = (async () => {
      if (options.resources) {
        try {
          metrics.resources.push(await resource())
        } catch {
          metrics.notes.push('Hardware counters unavailable for a sample.')
        }
      }
      if (options.usage && (final || Date.now() - accountAt >= 60000)) {
        accountAt = Date.now()
        if (!fakeAgents()) {
          const provider = tracker.selection.agent
          const [usage, voice] = await Promise.all([
            provider === 'claude' ? claudeUsage(true) : provider === 'codex' ? codexPlanUsage() : null,
            elevenLabsUsage().catch(() => null),
          ])
          metrics.accounts.push({ at: Date.now(), provider, usage, elevenLabsCharacters: voice?.used })
        } else if (!metrics.notes.includes('Synthetic agent test run; token counts and timings are not a live model benchmark.'))
          metrics.notes.push('Synthetic agent test run; token counts and timings are not a live model benchmark.')
      }
      save(dir, metrics)
    })().finally(() => {
      tracker.pending = null
    })
    await tracker.pending
  }
  active.set(dir, tracker)
  episodeMetricsSelection(dir, selection)
  if (options.usage) bindVoiceMetrics(readMeta(dir), join(dir, '.studio', 'voice-usage.jsonl'))
  save(dir, metrics)
  await tracker.sample()
  if (active.get(dir) !== tracker) return
  tracker.timer = setInterval(() => void tracker.sample().catch(() => undefined), 5000)
  tracker.timer.unref()
}

/** Preserve the initial benchmark identity and explicitly record mixed-provider work. */
export function episodeMetricsSelection(dir: string, selection: AgentSelection): void {
  const tracker = active.get(dir)
  if (!tracker || JSON.stringify(tracker.selection) === JSON.stringify(selection)) return
  const describe = (s: AgentSelection) => `${s.agent} / ${s.model} / ${s.effort ?? 'default effort'}`
  tracker.metrics.notes.push(`Agent changed from ${describe(tracker.selection)} to ${describe(selection)}. This episode includes work from multiple selections.`)
  tracker.selection = { ...selection }
  episodeMetricsPhase(dir, `Agent changed to ${describe(selection)}`)
}

export function episodeMetricsPhase(dir: string, name: string): void {
  const metrics = active.get(dir)?.metrics
  if (!metrics || metrics.phases.at(-1)?.name === name) return
  metrics.phases.push({ at: Date.now(), name })
  save(dir, metrics)
}

export function readEpisodeReport(dir: string): ReportEpisode | undefined {
  try {
    const metrics = JSON.parse(readFileSync(file(dir), 'utf8')) as EpisodeMetrics
    const voice: VoiceUsageSample[] = []
    const voiceFile = join(dir, '.studio', 'voice-usage.jsonl')
    if (existsSync(voiceFile))
      for (const line of readFileSync(voiceFile, 'utf8').split('\n')) {
        try {
          if (line.trim()) voice.push(JSON.parse(line))
        } catch {
          /* interrupted append */
        }
      }
    return { metrics, usage: readUsage(dir).filter((u) => u.at >= metrics.startedAt), voice }
  } catch {
    return undefined
  }
}

export async function finishEpisodeMetrics(
  dir: string,
  outcome: string,
  course: { title: string; folder: string; dirs: string[] },
): Promise<{ report: string; elapsedMs: number; seriesReport: string } | undefined> {
  const tracker = active.get(dir)
  if (!tracker) return undefined
  episodeMetricsPhase(dir, 'Metrics finalization')
  // Remove from the map immediately so failure/stop callbacks cannot finalize the same tracker twice.
  active.delete(dir)
  clearInterval(tracker.timer)
  try {
    await tracker.sample(true)
  } catch {
    tracker.metrics.notes.push('Final account or hardware snapshot was unavailable.')
  }
  tracker.metrics.finishedAt = Date.now()
  tracker.metrics.outcome = outcome
  save(dir, tracker.metrics)
  bindVoiceMetrics(readMeta(dir))
  const language = getSettings().uiLanguage ?? 'en'
  const report = join(dir, '.studio', 'episode-report.html')
  writeFileSync(report, renderMetricsReport([readEpisodeReport(dir)!], tracker.metrics.title, language))
  const seriesReport = join(course.folder, 'developer-report.html')
  const finished = course.dirs.flatMap((d) => {
    const report = readEpisodeReport(d)
    return report?.metrics.finishedAt ? [report] : []
  })
  writeFileSync(seriesReport, renderMetricsReport(finished, course.title, language))
  return { report, elapsedMs: tracker.metrics.finishedAt - tracker.metrics.startedAt, seriesReport }
}

/** Re-render saved measurements on opening, so older HTML follows the current presentation rules. */
export function refreshMetricsReport(root: string): string {
  const language = getSettings().uiLanguage ?? 'en'
  if (existsSync(join(root, 'project.json'))) {
    const episode = readEpisodeReport(root)
    if (!episode) throw new Error('The saved measurement data for this report could not be read.')
    const report = join(root, '.studio', 'episode-report.html')
    writeFileSync(report, renderMetricsReport([episode], episode.metrics.title, language))
    return report
  }
  const source = JSON.parse(readFileSync(join(root, 'series.json'), 'utf8')) as { plan: { title: string }; episodes: string[] }
  const episodes = source.episodes.flatMap((name) => {
    const episode = readEpisodeReport(join(root, name))
    return episode?.metrics.finishedAt ? [episode] : []
  })
  if (!episodes.length) throw new Error('No saved episode measurements could be read for this report.')
  const report = join(root, 'developer-report.html')
  writeFileSync(report, renderMetricsReport(episodes, source.plan.title, language))
  return report
}
