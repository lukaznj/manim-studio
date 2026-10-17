import type { AgentSelection, PlanUsage } from './types'

export interface DeveloperMetricsOptions {
  usage: boolean
  timing: boolean
  resources: boolean
}
export interface ResourceSample {
  at: number
  systemCpuPercent?: number
  appCpuPercent?: number
  appRamMb?: number
  systemRamMb: number
  gpuPercent?: number
  gpuMemoryMb?: number
  gpuSource?: string
  unavailable?: string[]
}
export interface VoiceUsageSample {
  at: number
  model: string
  characters: number
  billedCharacters: number | null
  cached?: boolean
  success: boolean
}
export interface EpisodeMetrics {
  version: 1
  title: string
  selection: AgentSelection
  options: DeveloperMetricsOptions
  startedAt: number
  finishedAt?: number
  outcome?: string
  phases: { at: number; name: string }[]
  resources: ResourceSample[]
  accounts: { at: number; provider: string; usage?: PlanUsage | null; elevenLabsCharacters?: number }[]
  notes: string[]
}
