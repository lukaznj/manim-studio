import { create } from 'zustand'
import type {
  AppInfo,
  ChatEvent,
  ChatMessage,
  ClaudeStatus,
  Component,
  MenuAction,
  ModelOption,
  PlanUsage,
  OpenProject,
  ProjectMeta,
  ProjectSummary,
  Quality,
  RenderError,
  RenderEvent,
  SetupStatus,
  Settings,
  SourceRef,
  Timeline,
  UpdateEvent,
} from '../../shared/types'
import { api } from './lib/api'
import { editorBridge } from './lib/editor-bridge'
import { playback } from './lib/playback'
import { sha1 } from './lib/time'

export interface Toast {
  id: number
  kind: 'ok' | 'error' | 'info'
  text: string
}

export interface RenderState {
  status: 'idle' | 'rendering' | 'error'
  id?: number
  clips?: number
  expected?: number
  t?: number
  error?: RenderError
  startedAt?: number
}

export type Dialog =
  | { kind: 'new-project' }
  | { kind: 'settings'; tab?: 'account' | 'voice' | 'video' | 'env' | 'about' }
  | { kind: 'booth'; key?: string }
  | { kind: 'export' }
  | null

interface State {
  screen: 'home' | 'editor'
  app: AppInfo | null
  settings: Settings | null
  setup: SetupStatus | null
  setupLog: Partial<Record<Component, string[]>>
  setupProgress: Partial<Record<Component, number>>
  claude: ClaudeStatus | null
  models: ModelOption[] // what the signed-in account (or API key) can use
  usage: PlanUsage | null // the Claude plan's limits, when signed in with an account
  historyOpen: boolean
  chatDraft: string | null // text put into the chat box from elsewhere (the Media and Sources panels)
  tour: boolean // the editor tutorial is showing
  leftTab: 'code' | 'media' | 'sources'
  chatSource: SourceRef | null // a PDF (or some of its pages) attached to the next chat message
  projects: ProjectSummary[]

  project: { path: string; meta: ProjectMeta } | null
  savedSource: string
  dirty: boolean
  stale: boolean
  conflict: string | null
  timeline: Timeline | null
  render: RenderState
  finalRender: RenderState
  exportState: { stage: string; percent?: number } | null
  selection: number[] // clip indices
  recordings: string[]

  chat: ChatMessage[]
  chatBusy: boolean
  streaming: Record<string, string>

  update: UpdateEvent
  dialog: Dialog
  toasts: Toast[]
}

export const useStore = create<State>(() => ({
  screen: 'home',
  app: null,
  settings: null,
  setup: null,
  setupLog: {},
  setupProgress: {},
  claude: null,
  models: [],
  usage: null,
  historyOpen: false,
  chatDraft: null,
  tour: false,
  leftTab: 'code',
  chatSource: null,
  projects: [],
  project: null,
  savedSource: '',
  dirty: false,
  stale: false,
  conflict: null,
  timeline: null,
  render: { status: 'idle' },
  finalRender: { status: 'idle' },
  exportState: null,
  selection: [],
  recordings: [],
  chat: [],
  chatBusy: false,
  streaming: {},
  update: { state: 'idle' },
  dialog: null,
  toasts: [],
}))

const set = useStore.setState
const get = useStore.getState

// --- small helpers ----------------------------------------------------------------------

let toastId = 1
export function toast(text: string, kind: Toast['kind'] = 'info'): void {
  const id = toastId++
  set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }))
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 7000 : 3800)
}

export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

async function guard<T>(p: Promise<T>): Promise<T | undefined> {
  try {
    return await p
  } catch (e) {
    toast(errorText(e), 'error')
    return undefined
  }
}

function withTransition(update: () => void): void {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
  if (doc.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) doc.startViewTransition(update)
  else update()
}

export const openDialog = (dialog: Dialog) => set({ dialog })
export const closeDialog = () => set({ dialog: null })

// --- boot ---------------------------------------------------------------------------------

export async function boot(): Promise<void> {
  const [app, settings, setup] = await Promise.all([api.appInfo(), api.getSettings(), api.setupStatus()])
  set({ app, settings, setup })
  void refreshProjects()
  void refreshClaude()

  api.on('render', onRender)
  api.on('chat', onChat)
  api.on('update', (update) => set({ update }))
  api.on('setup', (e) => {
    set((s) => ({
      setupLog: e.line ? { ...s.setupLog, [e.component]: [...(s.setupLog[e.component] ?? []), e.line].slice(-80) } : s.setupLog,
      setupProgress: e.progress !== undefined ? { ...s.setupProgress, [e.component]: e.progress } : s.setupProgress,
    }))
    if (e.state !== 'installing') void api.setupStatus().then((setup) => set({ setup }))
    else set((s) => (s.setup ? { setup: { ...s.setup, [e.component]: 'installing' } } : {}))
  })
  api.on('file-changed', ({ source, agent }) => onExternalChange(source, agent))
  api.on('menu', onMenu)
  // Plan usage moves while you work elsewhere too (claude.ai, Claude Desktop), so look again on return.
  window.addEventListener('focus', () => void refreshUsage())
  api.on('open-project', ({ path }) => {
    if (get().project?.path === path) return
    void openProject(path).then(() => toast('Claude Desktop opened this project'))
  })
  api.on('export', (e) => set({ exportState: e }))
}

export async function refreshProjects(): Promise<void> {
  set({ projects: await api.listProjects() })
}

let modelsFor = '' // the account the model list belongs to

export async function refreshClaude(): Promise<void> {
  const claude = await api.claudeStatus()
  set({ claude })
  void refreshUsage(true) // gone with an API key or after signing out
  const who = claude.loggedIn ? `${claude.method}:${claude.email ?? ''}` : ''
  if (who === modelsFor) return
  if (!who) {
    modelsFor = ''
    set({ models: [] })
    return
  }
  const models = await api.chatModels().catch(() => null)
  if (models) {
    modelsFor = who
    set({ models })
  }
}

let usageAt = 0

/** At most once a minute unless forced (after a sign-in or a chat turn): each check starts Claude Code. */
export async function refreshUsage(force = false): Promise<void> {
  if (!get().claude?.loggedIn) return set({ usage: null })
  if (!force && Date.now() - usageAt < 60_000) return
  usageAt = Date.now()
  set({ usage: await api.claudeUsage().catch(() => null) })
}

/** The editor tutorial (Tour.tsx): shown once on the first project, again from Help or Settings → General. */
export function startTour(): void {
  if (!get().project) return toast('Open a project to see the tutorial: it walks through the editor.', 'info')
  closeDialog()
  set({ tour: true })
}

export function endTour(): void {
  set({ tour: false })
  if (!get().settings?.tutorialDone) void updateSettings({ tutorialDone: true })
}

/** Open a project folder chosen in the system dialog. */
export async function pickAndOpenProject(): Promise<void> {
  try {
    const dir = await api.pickProject()
    if (dir) await openProject(dir)
  } catch (e) {
    toast(errorText(e), 'error')
  }
}

/** The macOS menu bar's commands (src/main/menu.ts), doing what the matching buttons and keys do. */
function onMenu({ action, path, value }: { action: MenuAction; path?: string; value?: string }): void {
  const { project, dialog } = get()
  switch (action) {
    case 'settings':
      return openDialog({ kind: 'settings' })
    case 'claude-settings':
      return openDialog({ kind: 'settings', tab: 'account' })
    case 'new-project':
      return openDialog({ kind: 'new-project' })
    case 'open-project':
      return void pickAndOpenProject()
    case 'open-recent':
      return void (path && openProject(path))
    case 'appearance':
      return void updateSettings({ appearance: value as Settings['appearance'] })
    case 'tutorial':
      return startTour()
  }
  if (!project || dialog) return // the rest work on the open project, like their keys
  switch (action) {
    case 'save':
      return void saveScene({ render: true })
    case 'render':
      return void renderNow()
    case 'play':
      return playback.toggle()
    case 'booth':
      return openDialog({ kind: 'booth' })
    case 'export':
      return openDialog({ kind: 'export' })
    case 'history':
      return set((s) => ({ historyOpen: !s.historyOpen }))
    case 'close-project':
      return void closeProject()
    case 'new-conversation':
      if (get().chat.length && confirm('Start a new conversation? Claude forgets the context of this project’s current one.')) void api.chatReset()
  }
}

export async function refreshSetup(): Promise<void> {
  set({ setup: await api.setupStatus() })
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  set({ settings: await api.setSettings(patch) })
}

export async function installComponent(c: Component): Promise<void> {
  set((s) => ({ setupLog: { ...s.setupLog, [c]: [] }, setupProgress: { ...s.setupProgress, [c]: undefined } }))
  await guard(api.install(c))
  await refreshSetup()
}

// --- projects -------------------------------------------------------------------------------

export async function openProject(path: string): Promise<void> {
  const opened = await guard(api.openProject(path))
  if (!opened) return
  withTransition(() => applyOpened(opened))
  firstRunTour()
  playback.restore(0)
  if (!opened.timeline && get().setup?.env === 'ready') void renderNow()
}

function applyOpened(o: OpenProject): void {
  set({
    screen: 'editor',
    project: { path: o.path, meta: o.meta },
    savedSource: o.source,
    dirty: false,
    stale: false,
    conflict: null,
    timeline: o.timeline,
    render: { status: 'idle' },
    finalRender: { status: 'idle' },
    selection: [],
    recordings: o.recordings,
    chat: o.chat,
    chatBusy: false,
    streaming: {},
  })
}

export async function createProject(input: Parameters<typeof api.createProject>[0]): Promise<void> {
  const path = await guard(api.createProject(input))
  if (!path) return
  closeDialog()
  await openProject(path)
  void refreshProjects()
}

/** The first project opened shows the tutorial, once the editor has laid itself out. */
function firstRunTour(): void {
  if (get().settings?.tutorialDone === false) setTimeout(() => get().project && !get().dialog && set({ tour: true }), 700)
}

export async function closeProject(): Promise<void> {
  if (get().dirty) await saveScene()
  await api.closeProject()
  withTransition(() => set({ screen: 'home', project: null, timeline: null, chat: [], selection: [], historyOpen: false, chatSource: null }))
  void refreshProjects()
}

export async function updateMeta(patch: Partial<ProjectMeta>): Promise<void> {
  const meta = await guard(api.updateMeta(patch))
  if (meta) set((s) => ({ project: s.project ? { ...s.project, meta } : null }))
}

// --- editing and rendering ------------------------------------------------------------------------

export function markEdited(source: string): void {
  set({ dirty: source !== get().savedSource })
  void checkStale(source)
}

async function checkStale(source: string): Promise<void> {
  const t = get().timeline
  // Python reads scene.py with universal newlines, so a CRLF file (Windows) hashes as LF there.
  set({ stale: !!t && (await sha1(source.replace(/\r\n?/g, '\n'))) !== t.sourceHash })
}

export async function saveScene(opts: { render?: boolean } = {}): Promise<void> {
  const source = editorBridge.getValue()
  if (source === null) return
  await api.saveScene(source)
  set({ savedSource: source, dirty: false, conflict: null })
  if (opts.render ?? get().settings?.autoRender ?? true) void renderNow()
}

export async function renderNow(quality: Quality = 'preview'): Promise<void> {
  if (get().setup?.env !== 'ready') {
    toast('The manim environment isn’t installed yet (Settings → Environment)', 'error')
    return
  }
  await guard(api.render(quality))
}

function onRender(e: RenderEvent): void {
  const key = e.quality === 'final' ? 'finalRender' : 'render'
  const current = get()[key]
  if (e.type === 'start') {
    set({ [key]: { status: 'rendering', id: e.id, clips: 0, expected: e.expectedClips, startedAt: Date.now() } } as Partial<State>)
    return
  }
  if (current.id !== undefined && e.id !== current.id) return // a superseded render
  if (e.type === 'progress') set({ [key]: { ...current, clips: e.clips, t: e.t } } as Partial<State>)
  if (e.type === 'cancelled') set({ [key]: { status: 'idle' } } as Partial<State>)
  if (e.type === 'error') {
    set({ [key]: { status: 'error', error: e.error } } as Partial<State>)
    if (e.quality === 'preview') editorBridge.showError(e.error)
  }
  if (e.type === 'done') {
    set({ [key]: { status: 'idle' } } as Partial<State>)
    if (e.quality === 'preview') {
      const t = playback.time
      editorBridge.showError(null)
      set({ timeline: e.timeline, selection: get().selection.filter((i) => i < e.timeline.clips.length) })
      void checkStale(editorBridge.getValue() ?? get().savedSource)
      requestAnimationFrame(() => playback.restore(Math.min(t, e.timeline.duration)))
      if (e.timeline.voiceWarnings.length) toast(`Voice: ${e.timeline.voiceWarnings[0]}`, 'error')
    }
  }
}

function onExternalChange(source: string, agent = false): void {
  if (get().dirty) {
    set({ conflict: source })
    return
  }
  editorBridge.setValue(source)
  set({ savedSource: source, dirty: false })
  // Claude (in the chat or in Claude Desktop) renders through its own tool; for anything else
  // (an external editor), render here.
  if (!agent && !get().chatBusy && get().settings?.autoRender) void renderNow()
}

export function resolveConflict(take: 'theirs' | 'mine'): void {
  const theirs = get().conflict
  if (theirs === null) return
  if (take === 'theirs') {
    editorBridge.setValue(theirs)
    set({ savedSource: theirs, dirty: false, conflict: null })
    void renderNow()
  } else {
    set({ conflict: null })
    void saveScene()
  }
}

export function selectClips(indices: number[]): void {
  set({ selection: indices })
}

// --- chat -------------------------------------------------------------------------------------------

function onChat(e: ChatEvent): void {
  if (e.type === 'message') set((s) => ({ chat: [...s.chat.filter((m) => m.id !== e.message.id), e.message] }))
  if (e.type === 'delta') set((s) => ({ streaming: { ...s.streaming, [e.messageId]: (s.streaming[e.messageId] ?? '') + e.text } }))
  if (e.type === 'part')
    set((s) => ({
      streaming: { ...s.streaming, [e.messageId]: '' },
      chat: s.chat.map((m) => (m.id === e.messageId ? { ...m, parts: [...m.parts, e.part] } : m)),
    }))
  if (e.type === 'tool-status')
    set((s) => ({
      chat: s.chat.map((m) =>
        m.id === e.messageId ? { ...m, parts: m.parts.map((p) => (p.kind === 'tool' && p.id === e.toolId ? { ...p, status: e.status } : p)) } : m,
      ),
    }))
  if (e.type === 'busy') {
    set({ chatBusy: e.busy })
    editorBridge.setReadOnly(e.busy)
  }
  if (e.type === 'done') {
    // An expired or revoked sign-in shows up as a failed turn; re-check so the sign-in card returns.
    if (!e.ok) void refreshClaude()
    else void refreshUsage(true)
    set((s) => ({
      streaming: {},
      chat: e.ok
        ? s.chat.map((m) => ({ ...m, parts: m.parts.map((p) => (p.kind === 'tool' && p.status === 'running' ? { ...p, status: 'ok' as const } : p)) }))
        : [...s.chat, { id: crypto.randomUUID(), role: 'error', parts: [{ kind: 'text', text: e.error || 'Claude stopped with an error.' }], at: Date.now() }],
    }))
  }
  if (e.type === 'reset') set({ chat: [], streaming: {}, chatBusy: false })
}

export async function sendChat(text: string, withFrame: boolean): Promise<boolean> {
  const { timeline, selection, dirty } = get()
  if (dirty) await saveScene({ render: false })
  const clips = timeline ? selection.map((i) => timeline.clips[i]).filter(Boolean) : []
  const context = clips.length
    ? {
        start: Math.min(...clips.map((c) => c.start)),
        end: Math.max(...clips.map((c) => c.end)),
        lines: clips.map((c) => c.line).filter((l): l is number => l !== null),
        labels: clips.map((c) => c.anims.map((a) => (a.target ? `${a.name} ${a.target}` : a.name)).join(' + ')),
      }
    : undefined
  try {
    await api.chatSend({ text, context, frameAt: withFrame && timeline ? playback.time : undefined, source: get().chatSource ?? undefined })
    set({ chatSource: null })
    return true
  } catch (e) {
    toast(errorText(e), 'error')
    return false
  }
}
