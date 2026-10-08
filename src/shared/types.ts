// Types shared by the main process, the preload bridge and the renderer.
// Timeline shapes mirror what python/studio_runner/render.py emits.

export type Aspect = '16:9' | '9:16'
export type Theme = 'dark' | 'light'
export type VoiceProvider = 'system' | 'elevenlabs' | 'omnivoice'
export type Quality = 'preview' | 'final'

export interface VoiceSettings {
  provider: VoiceProvider
  language: string
  systemVoice?: string
  elevenlabs?: { voiceId: string; voiceName?: string; modelId: string }
  omnivoice?: { refAudio?: string; refText?: string }
}

export interface ProjectMeta {
  name: string
  aspect: Aspect
  theme: Theme
  fps: number
  scene?: string
  createdAt: string
  voice: VoiceSettings
  claudeSessionId?: string
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
}

export interface NewProjectInput {
  name: string
  aspect: Aspect
  theme: Theme
  /** Narration and on-screen language, a BCP 47 code like "en" or "hr". */
  language: string
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

export type VoiceSource = 'recording' | 'system' | 'elevenlabs' | 'omnivoice' | 'silence' | 'unknown'

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
  clips: Clip[]
  voice: VoiceBlock[]
  subtitles: Subtitle[]
  warnings: LayoutWarning[]
  voiceWarnings: string[]
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
export type Component = 'env' | 'latex' | 'omnivoice' | 'transcribe'

export interface SetupStatus {
  env: ComponentState
  latex: ComponentState
  omnivoice: ComponentState
  transcribe: ComponentState
  pixi: boolean
  errors: Partial<Record<Component, string>>
}

export interface SetupEvent {
  component: Component
  state: ComponentState
  line?: string
  progress?: number
}

export interface ClaudeStatus {
  loggedIn: boolean
  email?: string
  subscription?: string
  method?: string
  error?: string
}

export interface ClaudeLoginEvent {
  line?: string
  url?: string
  needsCode?: boolean
  done?: boolean
}

// --- settings -------------------------------------------------------------------------

export type Appearance = 'system' | 'light' | 'dark'

export interface Settings {
  appearance: Appearance // 'system' follows the OS
  projectsDir: string
  recentProjects: string[]
  claudeModel: string // '' = Claude Code's default for the account
  claudeEffort: Effort | '' // '' = the model's default
  autoRender: boolean
  hasElevenLabsKey: boolean
  hasAnthropicKey: boolean
  defaultVoice: VoiceSettings
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
}

export type ChatPart =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; id: string; name: string; summary: string; status: 'running' | 'ok' | 'error' }

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'error'
  parts: ChatPart[]
  context?: ChatContext
  frame?: string // data URL thumbnail sent with the message
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
}

export type EventChannel = 'render' | 'setup' | 'claude-login' | 'chat' | 'file-changed' | 'update' | 'export' | 'open-project'

export interface StudioApi {
  appInfo(): Promise<AppInfo>
  mediaUrl(path: string): string

  setupStatus(): Promise<SetupStatus>
  install(component: Component): Promise<void>

  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  setElevenLabsKey(key: string): Promise<Settings>
  setAnthropicKey(key: string): Promise<Settings>

  claudeStatus(): Promise<ClaudeStatus>
  claudeLogin(): Promise<ClaudeStatus>
  claudeLoginCode(code: string): Promise<void>
  claudeLogout(): Promise<ClaudeStatus>

  listProjects(): Promise<ProjectSummary[]>
  createProject(input: NewProjectInput): Promise<string>
  openProject(path: string): Promise<OpenProject>
  pickProject(): Promise<string | null>
  pickFolder(): Promise<string | null>
  closeProject(): Promise<void>
  forgetProject(path: string): Promise<void>
  reveal(path: string): Promise<void>
  saveScene(source: string): Promise<void>
  updateMeta(patch: Partial<ProjectMeta>): Promise<ProjectMeta>

  render(quality: Quality): Promise<void>
  cancelRender(): Promise<void>
  frame(t: number, width?: number): Promise<string>
  exportVideo(): Promise<string>

  saveRecording(key: string, wav: ArrayBuffer): Promise<string[]>
  deleteRecording(key: string): Promise<string[]>
  saveVoiceReference(wav: ArrayBuffer, text: string): Promise<ProjectMeta>
  askMicrophone(): Promise<boolean>
  elevenLabsVoices(): Promise<VoiceOption[]>
  systemVoices(): Promise<VoiceOption[]>

  chatSend(request: ChatRequest): Promise<void>
  chatInterrupt(): Promise<void>
  chatReset(): Promise<void>
  chatModels(): Promise<ModelOption[]>
  /** Opens the bundled Claude Desktop extension, which Claude Desktop offers to install. */
  installClaudeExtension(): Promise<void>

  history(): Promise<Commit[]>
  restore(oid: string): Promise<void>

  checkForUpdates(): Promise<void>
  downloadUpdate(): Promise<void>
  installUpdate(): Promise<void>
  openExternal(url: string): Promise<void>

  on(channel: 'render', cb: (e: RenderEvent) => void): () => void
  on(channel: 'setup', cb: (e: SetupEvent) => void): () => void
  on(channel: 'claude-login', cb: (e: ClaudeLoginEvent) => void): () => void
  on(channel: 'chat', cb: (e: ChatEvent) => void): () => void
  /** `agent`: Claude Desktop wrote it and renders through its own tool. */
  on(channel: 'file-changed', cb: (e: { source: string; external: boolean; agent?: boolean }) => void): () => void
  /** Claude Desktop asked for this project (see src/main/mcp.ts). */
  on(channel: 'open-project', cb: (e: { path: string }) => void): () => void
  on(channel: 'update', cb: (e: UpdateEvent) => void): () => void
  on(channel: 'export', cb: (e: { stage: string; percent?: number; path?: string; error?: string }) => void): () => void
}
