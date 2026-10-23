import { setLanguage } from './lib/i18n'
import { create } from 'zustand'
import type {
  AppInfo,
  AppMode,
  ChatEvent,
  ChatMessage,
  ClaudeStatus,
  Component,
  ExportJob,
  MenuAction,
  ModelOption,
  PlanUsage,
  OpenProject,
  ProjectMeta,
  ProjectSummary,
  Quality,
  QuickRun,
  ElevenLabsCheck,
  ExerciseSet,
  SeriesRun,
  WatchSeries,
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
  paused?: boolean // the preview render's processes are stopped (TitleBar's pause)
}

/**
 * A render's progress in words. Manim draws one animation (self.play) at a time; the last render's
 * count is the only estimate of the total, so it gives a percentage only while it still fits.
 */
export function renderProgress(r: RenderState): { label: string; detail: string; title: string; fraction?: number } {
  const clips = r.clips ?? 0
  const fits = !!r.expected && clips <= r.expected
  const fraction = fits ? clips / r.expected! : undefined
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  return {
    label: r.paused ? 'Preview paused' : 'Rendering preview',
    detail: fraction !== undefined ? `${Math.round(fraction * 100)}%` : r.t ? `${clock(r.t)} so far` : '',
    title: [
      `Manim draws the video one animation at a time: ${clips} done`,
      fits ? `, of about ${r.expected} (as many as the last render had)` : '',
      r.t ? `, ${clock(r.t)} of video` : '',
      '.',
    ].join(''),
    fraction,
  }
}

export type Dialog =
  | { kind: 'new-project' }
  | { kind: 'settings'; tab?: 'account' | 'accounts' | 'voice' | 'video' | 'env' | 'about' }
  | { kind: 'booth'; key?: string }
  | { kind: 'export' }
  | { kind: 'quick' }
  | { kind: 'series' }
  | { kind: 'usage' }
  | { kind: 'exercises' } // a new exercise set
  | { kind: 'add-exercises' } // more exercises for the open set
  | { kind: 'lecture' }
  | null

interface State {
  screen: 'home' | 'editor' | 'study'
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
  leftTab: 'code' | 'script' | 'media' | 'sources'
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
  exports: ExportJob[] // the export queue, newest last (src/main/exports.ts)
  script: string | null // the open project's script.md (ScriptPane.tsx)
  quick: QuickRun | null // quick mode's run (QuickView.tsx)
  quickEditor: boolean // show the editor instead of quick mode's progress
  series: SeriesRun | null // a series being made unattended (SeriesPanel.tsx on Home)
  homeSeries: string | null // the series folder Home has open, or null for all projects
  exerciseSets: ExerciseSet[] // Home's cards
  // The study screen (StudyView.tsx, ADR 0030) shows a course: its lessons, its exercises, or both.
  exerciseSet: ExerciseSet | null // its exercises
  watchSeries: WatchSeries | null // its lessons (a series, or a single video)
  studyTab: 'transcript' | 'chat' // the study screen's right column (ADR 0032)
  watchTime: number | null // where the study player is, for the chat; null without a video
  studyAutoplayPath: string | null // only an automatic lesson handoff starts playback
  elevenLabsCheck: ElevenLabsCheck | null // the saved key's permissions, once checked this session
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
  exports: [],
  script: null,
  quick: null,
  quickEditor: false,
  series: null,
  homeSeries: null,
  exerciseSets: [],
  exerciseSet: null,
  watchSeries: null,
  studyTab: 'transcript',
  watchTime: null,
  studyAutoplayPath: null,
  elevenLabsCheck: null,
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
  setLanguage(settings.uiLanguage ?? 'en')
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
    // Quick mode opens its project the same way, with its own screen; only Claude Desktop needs saying.
    void openProject(path).then(() => get().quick?.project !== path && toast('Claude Desktop opened this project'))
  })
  api.on('exports', (exports) => set({ exports }))
  api.on('projects-changed', () => void refreshProjects())
  api.on('quick', (quick) => set((s) => ({ quick, quickEditor: quick?.id === s.quick?.id ? s.quickEditor : false })))
  void api.quickRun().then((quick) => set({ quick }))
  api.on('series', (series) => set({ series }))
  api.on('watch', (w) => set((st) => (st.watchSeries?.folder === w.folder ? { watchSeries: w } : {})))
  api.on('exercises', (s) => {
    set((st) => ({
      // A course's own set, just made by adding the first exercises to it, shows up too.
      exerciseSet: st.exerciseSet?.folder === s.folder || (s.course && st.watchSeries?.folder === s.course) ? s : st.exerciseSet,
      exerciseSets: st.exerciseSets.some((x) => x.folder === s.folder) ? st.exerciseSets.map((x) => (x.folder === s.folder ? s : x)) : [s, ...st.exerciseSets],
    }))
    // The first exercises of a new set are in: show the first one (a course stays on its lesson).
    const st = get()
    if (st.screen === 'study' && !st.watchSeries && st.exerciseSet?.folder === s.folder && s.items.length && st.project?.meta.exercise?.set !== s.folder)
      void selectStudied(s.items[0].dir)
  })
  void api.seriesRun().then((series) => set({ series }))
  // Claude wrote the script: show it, unless you're in the middle of something else.
  api.on('script', ({ text }) => set((s) => ({ script: text, leftTab: text && s.leftTab === 'code' && !s.dirty ? 'script' : s.leftTab })))
  void api.exportJobs().then((exports) => set({ exports }))
}

export async function refreshProjects(): Promise<void> {
  const [projects, exerciseSets] = await Promise.all([api.listProjects(), api.exerciseSets()])
  set({ projects, exerciseSets })
}

// --- the study screen (StudyView.tsx, ADR 0030): a course's lessons and exercises ------------------------

/** An exercise set; a course's own set comes with the course's lessons. With `dir`, that exercise, else the first. */
export async function openExerciseSet(folder: string, dir?: string): Promise<void> {
  const exerciseSet = await guard(api.exerciseSet(folder))
  if (!exerciseSet) return
  const watchSeries = exerciseSet.course ? await api.watchSeries(exerciseSet.course).catch(() => null) : null
  withTransition(() => set({ screen: 'study', exerciseSet, watchSeries }))
  const pick = dir ?? (get().project?.meta.exercise?.set === folder ? get().project!.path : exerciseSet.items[0]?.dir)
  if (pick) await selectStudied(pick)
}

/** A series (or a single video) with its exercises, if it has some. With `dir`, that video, else the first episode. */
export async function openWatch(folder: string, dir?: string): Promise<void> {
  const watchSeries = await guard(api.watchSeries(folder))
  if (!watchSeries) return
  const exerciseSet = watchSeries.exercises ? await api.exerciseSet(watchSeries.exercises).catch(() => null) : null
  withTransition(() => set({ screen: 'study', watchSeries, exerciseSet }))
  const pick = dir ?? (get().project?.meta.series?.folder === folder ? get().project!.path : watchSeries.episodes[0]?.dir)
  if (pick) await selectStudied(pick)
}

/** Opens a video of the course as the project (for the chat), staying on the study screen. */
export async function selectStudied(dir: string, autoplay = false): Promise<void> {
  if (get().project?.path === dir) return
  if (get().dirty) await saveScene()
  const opened = await guard(api.openProject(dir))
  if (opened) applyOpened(opened, 'study', autoplay)
}

/** A question about what's being studied: into the chat's box, with the chat shown. */
export function askInChat(text: string): void {
  set({ chatDraft: text, studyTab: 'chat' })
}

/** "Add exercises" on a course: its own set is made the first time, then the usual dialog. */
export async function addCourseExercises(): Promise<void> {
  const { exerciseSet, watchSeries } = get()
  if (!exerciseSet && watchSeries) {
    const folder = await guard(api.courseExercises(watchSeries.folder))
    if (!folder) return
    const made = await guard(api.exerciseSet(folder))
    if (!made) return
    set((s) => ({ exerciseSet: made, watchSeries: s.watchSeries && { ...s.watchSeries, exercises: folder } }))
  }
  openDialog({ kind: 'add-exercises' })
}

export async function createExerciseSet(req: Parameters<typeof api.createExerciseSet>[0]): Promise<boolean> {
  const folder = await guard(api.createExerciseSet(req))
  if (!folder) return false
  closeDialog()
  await openExerciseSet(folder)
  return true
}

/** Asks where a missing project went; the others that moved with it come back too. */
export async function locateProject(path: string): Promise<void> {
  try {
    const r = await api.locateProject(path)
    if (!r) return
    await refreshProjects()
    toast(r.found ? `Found it, and ${r.found === 1 ? '1 more project' : `${r.found} more projects`} next to it` : 'Found it')
  } catch (e) {
    toast(errorText(e), 'error')
  }
}

let modelsFor = '' // the account the model list belongs to
let agentRefresh = 0

export async function refreshClaude(): Promise<void> {
  const agent = get().settings?.agent ?? 'claude'
  const request = ++agentRefresh
  const current = () => request === agentRefresh && get().settings?.agent === agent
  const claude = await api.claudeStatus(agent)
  if (!current()) return
  set({ claude })
  void refreshUsage(true) // gone with an API key or after signing out
  const who = claude.loggedIn ? `${claude.agent}:${claude.method}:${claude.email ?? ''}` : ''
  if (who === modelsFor) return
  modelsFor = ''
  set({ models: [] })
  if (!who) {
    return
  }
  const models = await api.chatModels(agent).catch(() => null)
  if (current() && models) {
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
    case 'quick':
      return openDialog({ kind: 'quick' })
    case 'series':
      return openDialog({ kind: 'series' })
    case 'exercises':
      return openDialog({ kind: 'exercises' })
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
  const settings = await api.setSettings(patch)
  const changedAgent = settings.agent !== get().settings?.agent
  if (changedAgent) {
    ++agentRefresh // discard status/catalog requests from the previous provider
    modelsFor = ''
  }
  setLanguage(settings.uiLanguage ?? 'en')
  const next = { settings, ...(changedAgent ? { models: [], claude: null, usage: null } : {}) }
  if (patch.homeTab) withTransition(() => set(next))
  else set(next)
}

export async function installComponent(c: Component): Promise<void> {
  set((s) => ({ setupLog: { ...s.setupLog, [c]: [] }, setupProgress: { ...s.setupProgress, [c]: undefined } }))
  await guard(api.install(c))
  await refreshSetup()
}

// --- projects -------------------------------------------------------------------------------

/** Whether the editor exists for this user: not in Learn mode (ADR 0029). Every way into it asks here. */
export const canEdit = (s: Pick<State, 'settings'> = get()): boolean => s.settings?.mode !== 'learn'

/** Whether Home is the library, where everything opens on the study screen: Learn, or Both on its Learn tab. */
export const studying = (s: Pick<State, 'settings'> = get()): boolean =>
  s.settings?.mode === 'learn' || (s.settings?.mode === 'both' && s.settings.homeTab === 'learn')

export async function openProject(path: string): Promise<void> {
  // Quick mode's progress screen isn't the editor: it opens the same way, and its video is watched after.
  if (studying() && get().quick?.project !== path) return studyProject(path)
  const opened = await guard(api.openProject(path))
  if (!opened) return
  withTransition(() => applyOpened(opened))
  firstRunTour()
  playback.restore(0)
  if (!opened.timeline && get().setup?.env === 'ready') void renderNow()
}

/** Switches Learn and Create; leaving Create from the editor moves to the study screen of what's open. */
export async function switchMode(mode: AppMode): Promise<void> {
  await updateSettings({ mode })
  const { screen, project } = get()
  if (mode === 'learn' && screen === 'editor' && project) await studyProject(project.path)
}

/** Learn mode never shows the editor: whatever got there (a menu, an old path) goes to the study screen. */
export async function leaveEditor(): Promise<void> {
  const project = get().project
  if (project) await studyProject(project.path)
  else set({ screen: 'home' })
}

/** Learn mode's way to open anything: on the study screen, with its course. */
async function studyProject(path: string): Promise<void> {
  let summary = get().projects.find((p) => p.path === path)
  if (!summary) {
    const opened = await guard(api.openProject(path))
    if (!opened) return
    summary = {
      path,
      name: opened.meta.name,
      aspect: opened.meta.aspect,
      theme: opened.meta.theme,
      updatedAt: 0,
      series: opened.meta.series,
      exercise: opened.meta.exercise,
    }
  }
  if (summary.exercise) return openExerciseSet(summary.exercise.set, path)
  return openWatch(summary.series?.folder ?? path, path)
}

function applyOpened(o: OpenProject, screen: State['screen'] = 'editor', autoplay = false): void {
  set({
    screen,
    watchTime: null,
    studyAutoplayPath: autoplay ? o.path : null,
    project: { path: o.path, meta: o.meta },
    savedSource: o.source,
    // An episode made by hand starts with its request ready in the chat; Claude's brief has the rest.
    ...(screen === 'editor' && o.meta.series && !o.meta.extra && !o.chat.length && get().quick?.project !== o.path ? { chatDraft: 'Make this episode.' } : {}),
    script: o.script,
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
  withTransition(() =>
    set({
      screen: 'home',
      exerciseSet: null,
      watchSeries: null,
      watchTime: null,
      project: null,
      timeline: null,
      chat: [],
      selection: [],
      historyOpen: false,
      chatSource: null,
    }),
  )
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

/** Pauses or resumes the preview render in progress. */
export async function pausePreview(paused: boolean): Promise<void> {
  await api.pauseRender(paused)
  set((s) => (s.render.status === 'rendering' ? { render: { ...s.render, paused } } : {}))
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
    const { screen, watchTime } = get()
    const studying = screen === 'study'
    await api.chatSend({
      text,
      context: studying ? undefined : context,
      frameAt: !studying && withFrame && timeline ? playback.time : undefined,
      watchingAt: studying && watchTime !== null ? watchTime : undefined,
      source: get().chatSource ?? undefined,
    })
    set({ chatSource: null })
    return true
  } catch (e) {
    toast(errorText(e), 'error')
    return false
  }
}
