// Types shared by the main process, the preload bridge and the renderer.
// Timeline shapes mirror what python/studio_runner/render.py emits.

import type { UsageEntry } from './usage'
import type { DeveloperMetricsOptions } from './episode-metrics'
import type { UiLanguage } from './ui-languages'

export type Aspect = '16:9' | '9:16'
export type Theme = 'dark' | 'light'
export type VoiceProvider = 'elevenlabs' | 'omnivoice'
export type Quality = 'preview' | 'final'
/** How the narration talks: src/shared/tone.ts. */
export type Tone = 'professional' | 'warm' | 'playful'

export interface VoiceSettings {
  provider: VoiceProvider
  language: string
  elevenlabs?: { voiceId: string; voiceName?: string; modelId: string }
  omnivoice?: { refAudio?: string; refText?: string }
}

/** The video's background: a custom colour per theme (unset: the theme's own), and/or a picture from media/. */
export interface Background {
  dark?: string
  light?: string
  image?: string
}

export interface ProjectMeta {
  name: string
  aspect: Aspect
  theme: Theme
  background?: Background
  export?: ExportOptions // the last export's choices, offered again
  fps: number
  scene?: string
  createdAt: string
  voice: VoiceSettings
  tone?: Tone // unset: warm
  series?: SeriesRef // an episode of a series
  exercise?: ExerciseRef // an exercise in an exercise set (ADR 0025)
  extra?: { of: string; at: number; request: string } // a follow-up video to an episode (its folder name), asked for while watching (ADR 0028)
  captionBand?: boolean // keeps text out of the bottom band, where viewers' subtitles go (ADR 0027); projects made since 0.6
  scriptFirst?: boolean // Legacy metadata. Scripting is always part of generation (ADR 0016).
  claudeSessionId?: string
  codexThreadId?: string // the project's Codex conversation, resumed after a restart
  antigravityConversationId?: string // the project's Antigravity conversation, resumed the same way
}

export interface ProjectSummary {
  path: string
  name: string
  aspect: Aspect
  theme: Theme
  updatedAt: number
  duration?: number
  thumbnail?: string
  missing?: boolean
  series?: SeriesRef
  exercise?: ExerciseRef
  extra?: boolean // a follow-up video: listed under its episode on the Watch screen, not on Home
}

/** Where an episode sits in its series (src/main/series.ts). */
export interface SeriesRef {
  title: string
  folder: string // the series folder, holding series.md, series.json and the episodes
  episode: number // 1-based
  of: number
  brief: string // what this episode covers and which source pages it uses
}

export interface SeriesEpisode {
  title: string
  summary: string // what it covers, and its one central idea
  sources: { file: string; pages?: string }[] // file names as given; pages like "3-9"
  buildsOn?: number[] // 1-based episode numbers
  assignment?: AgentSelection // developer comparison: this agent makes the whole episode
}

/** What an ElevenLabs key may do (src/main/voice.ts checkElevenLabsKey). */
export interface ElevenLabsCheck {
  voices: boolean // Voices: Read
  tts: boolean // Text to Speech
  user: boolean // User: for the usage meter
  problem?: string // it's allowed, but something else stops it (an invalid key, no characters left)
}

/** What an Anthropic, OpenAI or Gemini key may do (src/main/keys.ts), tried for real. */
export interface KeyCheck {
  items: { label: string; ok: boolean; why?: string }[]
  problem?: string // something stops it: an invalid key, no credit left
  rejected?: boolean // the key itself isn't accepted
}

export interface ElevenLabsUsage {
  used: number // characters this period
  limit: number
  resetsAt?: number
  tier: string
}

// --- exercise sets (src/main/exercises.ts, ADR 0025) ----------------------------------------------

/** Where an exercise sits in its set. */
export interface ExerciseRef {
  set: string // the set's folder, holding exercises.json and one project per exercise
  title: string // the set's title
  number: number // 1-based
}

/** What the user hands over: typed exercises and files (pictures, PDFs), one or many exercises in each. */
export interface ExerciseInput {
  text: string
  files: string[]
}

export interface NewExerciseSet {
  title?: string // unset: from the first exercises
  level?: string // who it's for, e.g. "Croatian matura" or "first-year university"
  language: string
  aspect: Aspect
  theme: Theme
  tone: Tone
  voice?: VoiceSettings
  input: ExerciseInput
}

/**
 * One exercise's progress: waiting → solving → solved (the written solution is there) → video →
 * export → done. Videos wait until every exercise has its written solution.
 */
export type ExerciseState = 'waiting' | 'solving' | 'solved' | 'video' | 'export' | 'done' | 'failed'

export interface ExerciseItem {
  dir: string
  number: number
  title: string
  state: ExerciseState
  activity?: string // what its agent is doing right now
  limitedUntil?: number // waiting for the plan's usage limit to reset, until then (ms); another agent can take over
  error?: string
  warnings: string[]
  topic?: string // from solution.md
  answer?: string
  video?: string // the exported mp4, once there is one
  subtitles?: string // its .vtt
  watched?: boolean // its video was watched (src/main/watched.ts)
}

export interface ExerciseSet {
  folder: string
  title: string
  level?: string
  createdAt: string
  /** Reading new exercises out of what the user gave (files: how many pictures and PDFs). */
  intake?: { state: 'reading' | 'failed'; files: number; error?: string }
  paused?: boolean // its agents are stopped until it's resumed
  route?: AgentRoute // the agent it switched to at a usage limit (ADR 0048); unset: Settings
  items: ExerciseItem[]
  lecture?: { state: 'making' | 'done' | 'failed'; file?: string; error?: string }
  /** The series this set is the exercises of (<series>/exercises/, ADR 0030); none for a set on its own. */
  course?: string
}

/** solution.md, read for the screen: the steps are its ## sections. */
export interface ExerciseSolution {
  topic?: string
  tags: string[]
  answer?: string
  intro: string // anything before the first step
  steps: { title: string; body: string }[]
}

export interface ExerciseDetail {
  item: ExerciseItem
  problem: string // problem.md, Markdown with $…$ maths
  pictures: string[] // the original pictures, in media/
  solution: ExerciseSolution | null
  preview?: string // the preview render, until the export is there
  chapters: Section[] // the video's sections, one per step
}

export interface ExerciseHit {
  set: string
  setTitle: string
  dir: string
  number: number
  title: string
  topic?: string
  snippet: string
}

// --- watching a series (src/main/watch.ts, ADR 0028) -------------------------------------------------

/** A follow-up video the viewer asked for, explaining part of an episode further. */
export interface FollowUp {
  dir: string
  title: string
  at: number // where in the episode it was asked
  request: string
  state: 'making' | 'done' | 'failed'
  activity?: string
  error?: string
  video?: string
  watched?: boolean
}

export interface WatchEpisode {
  dir: string
  number: number
  title: string
  video?: string // the exported video, else none (the preview plays meanwhile)
  watched?: boolean
  followUps: FollowUp[]
  state?: 'making' | 'failed'
  activity?: string
  error?: string
}

export interface WatchSeries {
  folder: string
  title: string
  episodes: WatchEpisode[]
  production?: SeriesRun // persisted production history, including when a different series is active
  /** The course's exercise set (<series>/exercises/), once exercises were added to it (ADR 0030). */
  exercises?: string
}

/** One video on the Watch screen: what plays, its chapters and its words. */
export interface WatchDetail {
  video?: string // exported
  vtt?: string
  preview?: string
  chapters: Section[]
  subtitles: Subtitle[]
}

/** What series planning is doing, step by step (src/main/series.ts planSeries). */
export interface SeriesPlanProgress {
  stage: 'reading' | 'planning' | 'bible'
  total: number // PDFs (0 when planned from a topic)
  file?: string // the PDF being read
  index?: number // 1-based
  read: { file: string; pages: number }[] // PDFs read so far
  episodes: string[] // episode titles planned so far
  startedAt: number
}

/** One episode of a series being made (src/main/series.ts runSeries). */
export interface EpisodeRun {
  dir: string
  title: string
  assignment?: AgentSelection
  assignmentAuth?: ClaudeAuth // explicit takeover of a comparison episode; otherwise its configured sign-in
  report?: string // standalone developer HTML report
  elapsedMs?: number
  // waiting → script (its turn in the first pass) → scripted → scene → check → export → done
  state: 'waiting' | 'script' | 'scripted' | 'scene' | 'check' | 'export' | 'done' | 'failed' | 'stopped'
  failedAt?: 'script' | 'scene' | 'check' | 'export' // resume the failed phase without discarding earlier work
  activity?: string // what its agent is doing right now
  limitedUntil?: number // waiting for the plan's usage limit to reset, until then (ms); another agent can take over
  exportJob?: string
  error?: string
  warnings: string[]
  held?: boolean // paused by the user: its agent stops, and it waits until resumed
  tried?: boolean // its current step was started before and interrupted: it carries on from there
  costUSD?: number // what its agent turns cost so far, at API prices (.studio/usage.json has the detail)
}

/**
 * A series being made unattended: first every script, one after another (each episode builds on the
 * ones before), then the videos, `agents` at a time, each exported when it's done.
 */
export interface SeriesRun {
  title: string
  folder: string
  agents: number
  agent?: Agent // captured at creation; changing Settings does not reroute a running series
  metrics?: DeveloperMetricsOptions // measured episodes run serially, including export
  report?: string // combined developer report
  model?: string // the series' own model and effort; otherwise the chat's
  effort?: Effort
  auth?: ClaudeAuth // how its agent signs in; another agent or the key can take over at a limit (ADR 0048)
  // paused: its agents stop until resumed; stopped: also its exports, and it carries on with Continue,
  // even after a restart (the app keeps the run in the series folder)
  state: 'working' | 'paused' | 'stopped' | 'done'
  episodes: EpisodeRun[]
  planningCostUSD?: number
}

/** Claude's proposal for a series, which the user edits and accepts. */
export interface SeriesPlan {
  title: string
  bible: string // series.md: audience, arc, notation, visual vocabulary
  episodes: SeriesEpisode[]
  usage?: UsageEntry // what planning used (src/shared/usage.ts)
  instructions?: string // the user's own, for the whole series ("keep it intuitive, skip the derivations")
}

export interface SeriesDraft {
  request: { pdfs: string[]; topic?: string; instructions?: string; language: string; tone: Tone }
  plan?: SeriesPlan
}

export interface SeriesStart {
  plan: SeriesPlan
  pdfs: string[] // paths on this computer; episodes refer to them by file name
  aspect: Aspect
  theme: Theme
  tone: Tone
  language: string
  voice?: VoiceSettings
  export: ExportOptions
  unattended: boolean // make every episode now in quick mode; else open the first to make by hand
}

export interface NewProjectInput {
  name: string
  aspect: Aspect
  theme: Theme
  /** Narration and on-screen language, a BCP 47 code like "en" or "hr". */
  language: string
  /** The project's voice; unset takes Settings → Voice's default (with `language`). */
  voice?: VoiceSettings
  tone?: Tone
  series?: SeriesRef
  exercise?: ExerciseRef
  parentDir?: string
}

// --- timeline -----------------------------------------------------------------------

export interface EditSpan {
  line: number
  col: number // 0-based characters
  endLine: number
  endCol: number
  value: number | null // null: nothing there yet, insert `prefix + value`
  prefix: string
}

export interface Clip {
  start: number
  end: number
  line: number | null
  kind: 'play' | 'wait'
  anims: { name: string; target: string | null }[]
  edit?: EditSpan
  locked?: string
  repeat?: number
}

export interface Section {
  name: string
  start: number
  end: number
  line: number | null
}

export type VoiceSource = 'recording' | 'elevenlabs' | 'omnivoice' | 'silence' | 'unknown'

export interface VoiceBlock {
  start: number
  end: number
  line: number | null
  text: string
  key: string
  source: VoiceSource
  audio: string
  bookmarks: { mark: string; t: number }[]
}

/** studio_runner encoders: the first hardware encoder that worked, and what each one tried said (ADR 0034). */
export interface VideoEncoderInfo {
  encoder: string | null // h264_videotoolbox, h264_nvenc or h264_mf
  label?: string // "NVIDIA NVENC"
  tried: { encoder: string; error: string | null }[]
  waiting?: boolean // the Python environment isn't installed yet
  error?: string // the check itself failed
}

/** A folder projects could live in (folders.ts, ADR 0043). */
export interface FolderInfo {
  path: string
  cloud: string | null // "iCloud Drive", "OneDrive", "Dropbox"…: it's synced
  exists: boolean
  found: { videos: number; courses: number; exerciseSets: number } | null // Manim Studio projects already in it
}

export interface ProjectsFolders {
  local: FolderInfo // ~/Manim Studio: not synced
  documents: FolderInfo // Documents/Manim Studio: the default before 0.11, often synced
  current: string
}

export interface Subtitle {
  start: number
  end: number
  text: string
}

export interface LayoutWarning {
  kind: 'offscreen' | 'overlap'
  message: string
  start: number
  end: number
  line: number | null
}

export interface Timeline {
  video: string
  quality: Quality
  duration: number
  width: number
  height: number
  fps: number
  sourceHash: string
  renderedAt: number
  renderSeconds: number
  sections: Section[]
  /** Where the scene called self.thumbnail("hook"): the moment showing its core idea. */
  thumbnail?: { t: number; text: string | null; line: number | null } | null
  clips: Clip[]
  voice: VoiceBlock[]
  subtitles: Subtitle[]
  warnings: LayoutWarning[]
  voiceWarnings: string[]
  /** The voice the render spoke with (project.json's at the time); unset in timelines from before 0.2. */
  voiceSettings?: VoiceSettings
}

export interface RenderError {
  message: string
  line: number | null
  traceback: string
  log: string
}

export type RenderEvent = { id: number; quality: Quality } & (
  | { type: 'start'; expectedClips: number }
  | { type: 'progress'; clips: number; t: number }
  | { type: 'done'; timeline: Timeline }
  | { type: 'error'; error: RenderError }
  | { type: 'cancelled' }
)

// --- setup ----------------------------------------------------------------------------

export type ComponentState = 'missing' | 'installing' | 'ready' | 'outdated' | 'unsupported' | 'error'
export type Component = 'env' | 'latex' | 'omnivoice' | 'transcribe' | 'codex' | 'antigravity'

export interface SetupStatus {
  env: ComponentState
  latex: ComponentState
  omnivoice: ComponentState
  transcribe: ComponentState
  codex: ComponentState // the Codex CLI, installed when Codex is chosen (ADR 0022)
  antigravity: ComponentState // the Antigravity CLI, installed when Antigravity is chosen (ADR 0031)
  pixi: boolean
  errors: Partial<Record<Component, string>>
}

export interface SetupEvent {
  component: Component
  state: ComponentState
  line?: string
  progress?: number
}

/** The chosen agent's sign-in (Claude's, or Codex's when Settings → Agent says so). */
export interface ClaudeStatus {
  agent?: Agent
  loggedIn: boolean
  email?: string
  subscription?: string
  method?: string
  error?: string
}

/** The agent that writes the scenes: Claude (the Agent SDK), Codex (OpenAI's CLI) or Antigravity (Google's CLI, ADR 0031). */
export type Agent = 'claude' | 'codex' | 'antigravity'

/** A series' two jobs: planning the episodes, and making them (scripts, videos, fixes). */
export type SeriesRole = 'plan' | 'make'

export interface AgentSelection {
  agent: Agent
  model: string
  effort?: Effort
}

/** How Studio's Claude authenticates: the Claude Code account sign-in, or the user's own API key. */
export type ClaudeAuth = 'account' | 'api-key'

/** An agent and how it signs in: what a series or exercise set can carry on with past a usage limit (ADR 0048). */
export interface AgentRoute {
  agent: Agent
  auth: ClaudeAuth
}

/** One plan limit window, e.g. the 5-hour or the weekly limit. */
export interface UsageWindow {
  label: string
  percent: number // 0–100 used
  resetsAt: string | null // ISO time
}

/** Provider-reported account-wide plan usage, shared with other apps. */
export interface PlanUsage {
  agent?: Agent
  windows: UsageWindow[]
  checkedAt: number
}

/** The video's short side in pixels: 1080 is 1920 × 1080 (or 1080 × 1920 in portrait), 720 is 1280 × 720, 1440 is 2560 × 1440. */
export type ExportSize = 720 | 1080 | 1440
export type ExportFps = 30 | 60

export interface ExportOptions {
  themes: Theme[] // render a version per theme
  languages: string[] // extra narration languages (ISO 639-1), voiced and subtitled
  languageVideos: boolean // also a full video per extra language, for sites without audio tracks
  size?: ExportSize // unset: 1080 (exports saved before the choice existed)
  fps?: ExportFps // unset: the project's fps
  folder?: string // where the export's own <name>/ folder goes; unset: the project's exports/
  server?: string // a paired render server's id: render there (ADR 0021); unset: this computer
}

/** A render worker this app is paired with (src/main/remote.ts). */
export interface RenderServer {
  id: string
  name: string
  url: string
  cores?: number
}

/** What a render worker says about itself (GET /info). */
export interface WorkerInfo {
  version: string
  cores: number
  slices: number
  busy: boolean
  waiting: number
}

export interface ExportResult {
  folder: string
  files: string[]
  warnings: string[]
}

/** Quick mode (src/main/quick.ts): describe a video, attach PDFs, and Studio makes and exports it unattended. */
export interface QuickRequest {
  prompt: string // what the video should show
  sources: string[] // PDFs to make it from (paths on this computer)
  name?: string // the title; unset: taken from the prompt
  aspect: Aspect
  theme: Theme
  tone: Tone
  language: string
  voice?: VoiceSettings // unset: Settings → Voice's default
  export: ExportOptions
}

export type QuickStep = 'setup' | 'sources' | 'script' | 'scene' | 'check' | 'export' | 'done'

export interface QuickRun {
  id: string
  project: string
  name: string
  state: 'working' | 'done' | 'failed' | 'stopped'
  step: QuickStep
  activity?: string // what Claude is doing right now
  exportJob?: string // the ExportJob id once it's queued
  result?: ExportResult
  error?: string
  warnings: string[] // what couldn't be fixed (e.g. a voice problem); the video was still made
  series?: { title: string; episode: number; of: number; episodes?: { title: string; state: 'done' | 'failed' | 'now' | 'todo' }[] }
}

/**
 * One export in the queue (src/main/exports.ts). It works on its own copy of the project, so the
 * project can be edited, closed or swapped for another while it runs.
 */
export interface ExportJob {
  id: string
  project: string // the project's folder
  name: string // its title when the export was queued
  options: ExportOptions
  state: 'waiting' | 'running' | 'done' | 'failed' | 'cancelled'
  stage?: string // what it's doing now, e.g. "Rendering the dark version"
  phase?: 'rendering' | 'assembling' // distinguishes the two local-render progress passes
  percent?: number // 0–1 for the current stage, when known
  paused?: boolean
  result?: ExportResult
  error?: string
  queuedAt: number
  finishedAt?: number
}

export interface MediaItem {
  name: string // file name in the project's media/ folder
  kind: 'image' | 'video'
  size: number // bytes
  thumb?: string // path of a preview picture
}

/** A PDF in the project's sources/ folder (ADR 0014): material a video is made from. */
export interface SourceItem {
  name: string // file name in sources/
  size: number // bytes
  pages?: number // unset until indexed, or when it couldn't be read
  title?: string // from the PDF's metadata
  noText?: number[] // pages without a text layer (scans, pictures)
  thumb?: string // path of page 1's picture
  error?: string // why it couldn't be read
}

export interface SourceImport {
  items: SourceItem[] // everything in sources/ afterwards
  added: string[] // the names the imported files have in sources/ (an identical file already there counts)
}

/** A PDF attached to a chat message, whole or some of its pages (1-based). */
export interface SourceRef {
  name: string
  pages?: number[]
}

export interface ClaudeDesktopStatus {
  installed: boolean
  enabled: boolean
  version: string | null // of the installed extension
  current: string // the version this app ships
}

/** Commands from the macOS menu bar, carried out in the window. */
export type MenuAction =
  | 'settings'
  | 'claude-settings'
  | 'new-project'
  | 'open-project'
  | 'open-recent'
  | 'save'
  | 'render'
  | 'play'
  | 'booth'
  | 'history'
  | 'export'
  | 'quick'
  | 'series'
  | 'exercises'
  | 'close-project'
  | 'new-conversation'
  | 'appearance'
  | 'tutorial'

export interface ClaudeLoginEvent {
  line?: string
  diagnostic?: string // redacted Antigravity startup/terminal details, retained after failure
  url?: string
  needsCode?: boolean
  needsConsent?: boolean // Antigravity's first-run terms and optional interaction sharing
  done?: boolean
}

// --- settings -------------------------------------------------------------------------

export type Appearance = 'system' | 'light' | 'dark'

/** Who the app is for (ADR 0029): Learn hides the editor everywhere; Create is the full studio; Both has a tab for each on Home. */
export type AppMode = 'learn' | 'create' | 'both'

export interface Settings {
  studyModels?: Partial<Record<Agent, { model: string; effort: Effort }>> // tutor chat and notes, independent of video creation
  studyAutoplay?: boolean // advance to the next ready course lesson; unset: off
  studyPlaybackRate?: number // preferred study player speed; unset: 1
  studyVolume?: number // preferred study player volume, 0–1; unset: 1
  studyMuted?: boolean // mute independently of the preferred volume; unset: off
  studyCaptions?: boolean // show subtitles when available; unset: on
  developerMode?: boolean
  developerEpisodeModels?: boolean
  developerUsageMetrics?: boolean
  developerTimingMetrics?: boolean
  developerResourceMetrics?: boolean
  codexFallbackModel?: string // opt-in, same-account fallback for capacity failures only
  uiLanguage?: UiLanguage
  onboardingDone?: boolean
  defaultAspect?: Aspect
  defaultTheme?: Theme
  defaultTone?: Tone
  defaultBackground?: Background
  mode?: AppMode // unset until chosen at first launch
  homeTab?: 'learn' | 'create' // Both: the Home tab last shown (unset: Create)
  appearance: Appearance // 'system' follows the OS
  projectsDir: string
  recentProjects: string[]
  claudeAuth: ClaudeAuth
  codexAuth?: ClaudeAuth // ChatGPT sign-in or an OpenAI key (Settings → Accounts); unset: the key if one is saved
  antigravityAuth?: ClaudeAuth // Google sign-in or a Gemini key; unset: the key if one is saved
  previewSize: 480 | ExportSize // short side of the preview render, in pixels
  previewFps: 15 | 24 | 30
  tutorialDone: boolean // the first-run tour of the editor was finished or skipped
  toursSeen?: ('home' | 'study')[] // the app's guided tours already shown (ADR 0047)
  claudeModel: string // '' = Claude Code's default for the account
  claudeEffort: Effort | '' // '' (older settings) reads as 'medium'
  agent: Agent // who writes the scenes (ADR 0022)
  codexModel: string // GPT-6.1 Sol by default; GPT-6 Astra is the other supported choice
  codexEffort: Effort | ''
  antigravityModel: string // '' = Gemini 4 Argon
  antigravityEffort: Effort | ''
  exerciseSets?: string[] // exercise set folders (Home lists them; search looks in them)
  seriesRun?: string // the series folder whose run Home shows (and can continue) until it's dismissed
  seriesAgents: number // episodes a series makes at once, one Claude agent each (ADR 0023)
  seriesModels?: Partial<Record<Agent, Partial<Record<SeriesRole, { model: string; effort: Effort }>>>> // per agent; unset make inherits the creation model, plan uses SERIES_PLANNERS (ADR 0045)
  autoRender: boolean
  sounds?: boolean // app sounds (ADR 0046); unset: on
  soundVolume?: number // 0–100, 0.3 dB a step; unset: 50 (−15 dB)
  hasElevenLabsKey: boolean
  hasAnthropicKey: boolean
  hasOpenAIKey: boolean
  hasGeminiKey: boolean
  defaultVoice: VoiceSettings
  renderServers: RenderServer[] // paired render workers (ADR 0021); their tokens are secrets
  gpuEncoding?: 'auto' | 'off' // exports encode on the GPU when one works (ADR 0034); unset: auto
  studySize?: ExportSize // default export size in every mode; unset: 1080 (ADR 0035)
  sidebarWidth: number
  chatWidth: number
  timelineHeight: number
}

// --- chat -----------------------------------------------------------------------------

export interface ChatContext {
  start: number
  end: number
  lines: number[]
  labels: string[]
}

export interface ChatRequest {
  text: string
  context?: ChatContext
  frameAt?: number
  watchingAt?: number // the moment of the finished video the viewer asks about (Watch and exercise screens)
  source?: SourceRef
  study?: boolean
  studyAction?: 'video' | 'exercises'
  frameRegion?: FrameRegion
  frameImage?: string // PNG data URL captured from the actual paused video, validated in main
  confirmVideo?: string // id of the assistant's saved offer; retains its request and moment
}

/** Normalized coordinates in the actual video frame, excluding letterboxing. */
export interface FrameRegion { x: number; y: number; width: number; height: number }

export interface StudyVideoOffer {
  request: string
  at: number
  title: string
  region?: FrameRegion
  frame?: string // validated PNG retained with an offer so Create anyway survives reopening
  state: 'offered' | 'created'
  dir?: string
}

export type ChatPart = { kind: 'text'; text: string } | { kind: 'tool'; id: string; name: string; summary: string; status: 'running' | 'ok' | 'error' }

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'error'
  parts: ChatPart[]
  context?: ChatContext
  frame?: string // data URL thumbnail sent with the message
  source?: SourceRef
  videoOffer?: StudyVideoOffer
  studyAction?: 'video' | 'exercises'
  exerciseFolder?: string
  auto?: boolean // a background agent's turn (series, exercises), not the user's conversation
  at: number
}

export type ChatEvent =
  | { type: 'message'; message: ChatMessage }
  | { type: 'delta'; messageId: string; text: string }
  | { type: 'part'; messageId: string; part: ChatPart }
  | { type: 'tool-status'; messageId: string; toolId: string; status: 'ok' | 'error' }
  | { type: 'busy'; busy: boolean }
  | { type: 'done'; ok: boolean; error?: string; costUsd?: number }
  | { type: 'reset' }

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface ModelOption {
  value: string
  label: string
  description: string
  efforts: Effort[] // empty: the model has no effort setting
}

// --- history / updates ------------------------------------------------------------------

export interface Commit {
  oid: string
  message: string
  author: string
  at: number
}

export type UpdateEvent =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string; notes?: string }
  | { state: 'downloading'; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'none' }
  | { state: 'error'; message: string; manualUrl?: string }

export interface OpenProject {
  path: string
  meta: ProjectMeta
  source: string
  script: string | null // script.md, when the project has one
  timeline: Timeline | null
  chat: ChatMessage[]
  recordings: string[]
}

export interface AppInfo {
  version: string
  platform: string
  arch: string
  projectsDir: string
  releasesUrl: string
}

export interface VoiceOption {
  id: string
  name: string
  description?: string
  preview?: string // a sample to play (ElevenLabs)
  users?: number // how many people saved it (ElevenLabs' library)
}

export interface AgentLimitEvent {
  agent: Agent
  until: number // reset time in milliseconds, or 0 when the provider does not report it
}

export type EventChannel =
  | 'usage-limit'
  | 'projects-changed'
  | 'render'
  | 'setup'
  | 'claude-login'
  | 'chat'
  | 'file-changed'
  | 'update'
  | 'exports'
  | 'script'
  | 'quick'
  | 'series-plan'
  | 'series'
  | 'exercises'
  | 'watch'
  | 'open-project'
  | 'menu'

export interface StudioApi {
  appInfo(): Promise<AppInfo>
  mediaUrl(path: string): string

  setupStatus(): Promise<SetupStatus>
  install(component: Component): Promise<void>

  getSettings(): Promise<Settings>
  desktopConnection(): Promise<{ command: string; args: string[]; env: Record<string, string>; config: string; codexCommand: string }>
  showDesktopPlugin(): Promise<void>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  /** Saves the key once it can list voices and speak (one character); throws which permissions are missing. */
  setElevenLabsKey(key: string): Promise<Settings>
  /** What the saved key may do, tried for real (once per session unless `again`: each try speaks a character). */
  checkElevenLabsKey(again?: boolean): Promise<ElevenLabsCheck>
  /** This month's characters, or null without a key or its User permission. */
  elevenLabsUsage(): Promise<ElevenLabsUsage | null>
  /** Saves the key once it's accepted and may send messages; throws what to change otherwise. */
  setAnthropicKey(key: string): Promise<Settings>
  checkAnthropicKey(again?: boolean): Promise<KeyCheck>
  /** Codex uses an OpenAI API key instead of the ChatGPT sign-in while one is saved. */
  setOpenAIKey(key: string): Promise<Settings>
  checkOpenAIKey(again?: boolean): Promise<KeyCheck>
  /** Antigravity uses a Gemini API key instead of the Google sign-in while one is saved. */
  setGeminiKey(key: string): Promise<Settings>
  checkGeminiKey(again?: boolean): Promise<KeyCheck>

  /** The chosen agent's sign-in, or `agent`'s (Settings → Accounts). */
  claudeStatus(agent?: Agent): Promise<ClaudeStatus>
  /** Plan limits used, or null with an API key or when Claude Code can't tell. */
  claudeUsage(): Promise<PlanUsage | null>
  agentPlanUsage(agent?: Agent, auth?: ClaudeAuth): Promise<PlanUsage | null>
  claudeLogin(agent?: Agent): Promise<ClaudeStatus>
  claudeLoginCode(code: string, agent?: Agent): Promise<void>
  antigravityLoginConsent(shareData: boolean): Promise<void>
  claudeLogout(agent?: Agent): Promise<ClaudeStatus>

  listProjects(): Promise<ProjectSummary[]>
  createProject(input: NewProjectInput): Promise<string>
  openProject(path: string): Promise<OpenProject>
  pickProject(): Promise<string | null>
  /** A folder from the system dialog, or null if cancelled. */
  pickFolder(title?: string, defaultPath?: string): Promise<string | null>
  /** Opens the configured projects directory in the system file manager. */
  openProjectsFolder(): Promise<void>
  /** PDFs from the system dialog; empty if cancelled. */
  pickPdfs(): Promise<string[]>
  closeProject(): Promise<void>
  forgetProject(path: string): Promise<void>
  /** Asks where a missing project went; null when the picker was closed. `found`: others found again next to it. */
  locateProject(path: string): Promise<{ path: string; found: number } | null>
  reveal(path: string): Promise<void>
  saveScene(source: string): Promise<void>
  updateMeta(patch: Partial<ProjectMeta>): Promise<ProjectMeta>
  /** Writes the open project's script.md. */
  saveScript(text: string): Promise<void>

  render(quality: Quality): Promise<void>
  cancelRender(): Promise<void>
  frame(t: number, width?: number): Promise<string>
  /** Starts quick mode: creates the project, opens it, and Claude makes and exports the video. */
  startQuick(request: QuickRequest): Promise<QuickRun>
  quickRun(): Promise<QuickRun | null>
  stopQuick(): Promise<void>
  /** Reads the PDFs and asks Claude for a series plan (a minute or two). */
  /** Plans a series from PDFs, or from `topic` (what the user wants to learn) when there are none. */
  planSeries(request: { pdfs: string[]; topic?: string; instructions?: string; language: string; tone: Tone }): Promise<SeriesPlan>
  seriesDraft(): Promise<SeriesDraft | null>
  saveSeriesDraft(draft: SeriesDraft | null): Promise<void>
  /** Stops series planning (reading the PDFs or the agent's answer). */
  cancelSeriesPlan(): Promise<void>
  /** Who can take over past a usage limit: each signed-in agent, and a saved Claude or OpenAI key (ADR 0048). */
  agentRoutes(): Promise<AgentRoute[]>
  /** The running series carries on with this agent; episodes waiting on a limit start again at once. */
  switchSeriesAgent(route: AgentRoute): Promise<void>
  /** The same for an exercise set's agents. */
  switchExercisesAgent(folder: string, route: AgentRoute): Promise<void>
  /** Renames a series on Home (its episodes' project.json and series.json); folders keep their names. */
  renameSeries(folder: string, title: string): Promise<void>
  /** Creates the series' projects; unattended, makes them one after another in quick mode. */
  startSeries(start: SeriesStart): Promise<void>
  /** The series being made unattended, or the last one until it's dismissed. */
  seriesRun(): Promise<SeriesRun | null>
  /** Stops the agents and exports; Continue (continueSeries) carries on later, even after a restart. */
  stopSeries(): Promise<void>
  continueSeries(folder?: string): Promise<void>
  retrySeriesEpisode(dir: string): Promise<void>
  /** Pauses or resumes the whole series (its agents), or one episode. */
  pauseSeries(paused: boolean): Promise<void>
  pauseEpisode(dir: string, paused: boolean): Promise<void>
  /** What the open project's agent turns used, one entry per turn. */
  projectUsage(): Promise<UsageEntry[]>
  dismissSeries(): Promise<void>

  /** Creates an exercise set from the first exercises and starts solving them; returns its folder. */
  createExerciseSet(request: NewExerciseSet): Promise<string>
  exerciseSet(folder: string): Promise<ExerciseSet>
  exerciseSets(): Promise<ExerciseSet[]>
  /** Reads the exercises out of the text and files, adds them to the set and solves them. */
  addExercises(folder: string, input: ExerciseInput): Promise<void>
  /** Pictures or PDFs of exercises, from the system dialog. */
  pickExerciseFiles(): Promise<string[]>
  /** A pasted picture, saved where the next addExercises can take it; returns its path. */
  savePastedImage(data: Uint8Array, ext: string): Promise<string>
  exerciseDetail(dir: string): Promise<ExerciseDetail>
  /** Has the video redone, explaining what the user asks about more thoroughly. */
  reviseExercise(dir: string, request: string): Promise<void>
  retryExercise(dir: string): Promise<void>
  /** Stops the set's agents, or lets them carry on. */
  pauseExercises(folder: string, paused: boolean): Promise<void>
  /** Takes the exercise out of its set, to the Trash. */
  removeExercise(dir: string): Promise<void>
  searchExercises(query: string): Promise<ExerciseHit[]>
  /** Joins the exercises' videos, in order, into one lecture video in the set's folder. */
  makeLecture(folder: string, dirs: string[]): Promise<void>

  /** A series as its Watch screen shows it: episodes with their videos and follow-ups. */
  watchSeries(folder: string): Promise<WatchSeries>
  /** The series' own exercise set, made on first use: returns its folder (ADR 0030). */
  courseExercises(series: string): Promise<string>
  watchDetail(dir: string): Promise<WatchDetail>
  /** Per-video notes and a reviewed, read-only AI revision. */
  studyNotes(dir: string): Promise<string>
  saveStudyNotes(dir: string, text: string): Promise<void>
  refineStudyNotes(dir: string, text: string): Promise<string>
  addCourseLesson(folder: string, request: { title: string; prompt: string; sources: string[] }): Promise<string>
  retryCourseLesson(dir: string): Promise<void>
  retryFollowUp(dir: string): Promise<void>
  /** Marks a video (an episode, follow-up or exercise) watched or not; its list updates. */
  setWatched(dir: string, watched: boolean): Promise<void>
  renderServers(): Promise<RenderServer[]>
  /** Where projects can go (ADR 0043): a local folder, Documents and whether a cloud drive syncs it, the one in use. */
  projectsFolders(): Promise<ProjectsFolders>
  /** What a folder holds (a returning user's projects) and whether it's synced. */
  inspectFolder(dir: string): Promise<FolderInfo>
  useProjectsFolder(dir: string): Promise<Settings>
  /** The render cache's size and place (ADR 0043); clearing it makes renders draw everything again. */
  renderCacheInfo(): Promise<{ path: string; bytes: number }>
  clearRenderCache(): Promise<void>
  /** The GPU video encoder exports use on this computer, if any; `again` tests it anew. */
  videoEncoder(again?: boolean): Promise<VideoEncoderInfo>
  /** Pairs with a render worker from the code it printed; checks that it answers first. */
  addServer(code: string): Promise<RenderServer[]>
  removeServer(id: string): Promise<RenderServer[]>
  checkServer(id: string): Promise<WorkerInfo>
  /** Queues an export of the open project; it runs in the background, one at a time. */
  queueExport(options: ExportOptions): Promise<ExportJob>
  exportJobs(): Promise<ExportJob[]>
  /** Pauses or resumes a running export on this computer. */
  pauseExport(id: string, paused: boolean): Promise<void>
  /** Pauses or resumes the preview render in progress. */
  pauseRender(paused: boolean): Promise<void>
  /** Stops a waiting or running export, or removes a finished one from the list. */
  cancelExport(id: string): Promise<void>
  clearExports(): Promise<void>
  listMedia(): Promise<MediaItem[]>
  /** Copies files (from a drop, or a dialog when `paths` is empty) into the project's media/. */
  importMedia(paths: string[]): Promise<MediaItem[]>
  removeMedia(name: string): Promise<MediaItem[]>
  /** The PDFs in sources/, indexed on first sight (page count, text, thumbnail). */
  listSources(): Promise<SourceItem[]>
  /** Copies PDFs (from a drop, or a dialog when `paths` is empty) into the project's sources/. */
  importSources(paths: string[]): Promise<SourceImport>
  removeSource(name: string): Promise<SourceItem[]>
  /** Paths of page pictures `width` pixels wide (pages are 1-based). */
  sourcePages(name: string, pages: number[], width: number): Promise<string[]>
  /** A dropped File's path on disk (Electron's webUtils). */
  pathForFile(file: File): string

  saveRecording(key: string, wav: ArrayBuffer): Promise<string[]>
  deleteRecording(key: string): Promise<string[]>
  saveVoiceReference(wav: ArrayBuffer, text: string): Promise<ProjectMeta>
  askMicrophone(): Promise<boolean>
  elevenLabsVoices(): Promise<VoiceOption[]>
  elevenLabsLibrary(language: string, search: string): Promise<VoiceOption[]>
  /** The voice a language starts with: a preferred one (Croatian: Slobodan), else the library's most used. */
  elevenLabsDefaultVoice(language: string): Promise<VoiceOption | null>
  /** A voice sample's audio, to play from memory. */
  voicePreview(url: string): Promise<Uint8Array>

  chatSend(request: ChatRequest): Promise<void>
  chatInterrupt(): Promise<void>
  chatReset(): Promise<void>
  chatModels(agent?: Agent): Promise<ModelOption[]>
  openEpisodeReport(dir: string): Promise<void>
  /** Opens the bundled Claude Desktop extension, which Claude Desktop offers to install. */
  installClaudeExtension(): Promise<void>
  claudeDesktopStatus(): Promise<ClaudeDesktopStatus>

  history(): Promise<Commit[]>
  restore(oid: string): Promise<void>

  checkForUpdates(): Promise<void>
  downloadUpdate(): Promise<void>
  installUpdate(): Promise<void>
  openExternal(url: string): Promise<void>

  on(channel: 'render', cb: (e: RenderEvent) => void): () => void
  on(channel: 'projects-changed', cb: () => void): () => void
  on(channel: 'setup', cb: (e: SetupEvent) => void): () => void
  on(channel: 'claude-login', cb: (e: ClaudeLoginEvent) => void): () => void
  on(channel: 'chat', cb: (e: ChatEvent) => void): () => void
  on(channel: 'usage-limit', cb: (e: AgentLimitEvent) => void): () => void
  /** `agent`: Claude Desktop wrote it and renders through its own tool. */
  on(channel: 'file-changed', cb: (e: { source: string; external: boolean; agent?: boolean }) => void): () => void
  /** Claude Desktop asked for this project (see src/main/mcp.ts). */
  on(channel: 'open-project', cb: (e: { path: string }) => void): () => void
  on(channel: 'menu', cb: (e: { action: MenuAction; path?: string; value?: string }) => void): () => void
  on(channel: 'update', cb: (e: UpdateEvent) => void): () => void
  on(channel: 'exports', cb: (jobs: ExportJob[]) => void): () => void
  on(channel: 'quick', cb: (run: QuickRun | null) => void): () => void
  on(channel: 'series-plan', cb: (p: SeriesPlanProgress) => void): () => void
  on(channel: 'series', cb: (run: SeriesRun | null) => void): () => void
  on(channel: 'exercises', cb: (set: ExerciseSet) => void): () => void
  on(channel: 'watch', cb: (series: WatchSeries) => void): () => void
  /** script.md changed on disk (Claude wrote it), or was removed (null). */
  on(channel: 'script', cb: (e: { text: string | null }) => void): () => void
}
