import { fallbackEnabled } from './model-fallback'
// Exercise sets (ADR 0025): the user hands over exercises (typed, photographed, in PDFs), an agent
// reads them out one per project, and background agents solve each one in writing (solution.md,
// checked with the calculate tool), then make a short video of the solution and export it. The set
// is a folder with exercises.json and one ordinary project per exercise, so the editor, the chat and
// the export all work on an exercise as they do on any video.
//
// Work is handed out from each exercise's state, like a series (ADR 0023): written solutions first,
// so every exercise has its answer quickly, then the videos. Pausing, removing and revising are
// only states the loop reads; opening a set carries on with what's unfinished.
//
// A series can have a set of its own, in <series>/exercises/ (ADR 0030): the course's exercises,
// solved with its bible (course.md) for the notation. Home shows it in the series' card.
import { app, nativeImage, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import {
  INTAKE_FORMAT,
  intakeSetTitle,
  joinVtt,
  parseIntake,
  parseSolution,
  PROBLEM_FILE,
  searchScore,
  snippet,
  SOLUTION_FILE,
  splitTyped,
  vttToSrt,
  type IntakeExercise,
} from '../shared/exercise'
import { DEFAULT_TONE } from '../shared/tone'
import type {
  AgentRoute,
  Aspect,
  ExerciseDetail,
  ExerciseHit,
  ExerciseInput,
  ExerciseItem,
  ExerciseSet,
  NewExerciseSet,
  ProjectMeta,
  Theme,
  Tone,
  VoiceSettings,
} from '../shared/types'
import { configuredAuth, episodeAgent, sameRoute, turnPastLimits, type EpisodeAgent } from './agent'
import { fakeAgents } from './agent-fake'
import { askClaude, claudeStatus, languageName } from './claude'
import { setupStatus } from './env'
import { cancelExport, queueExport } from './exports'
import { createProject, readMeta, readTimeline } from './projects'
import { checkAndFix } from './quick'
import { cancel } from './render'
import { runRunner } from './runner'
import { getSettings, setSettings } from './settings'
import { slugify } from './slug'
import { isWatched } from './watched'

/** exercises.json: the set's settings and its exercises' folders, in order. */
interface SetFile {
  title: string
  level?: string
  createdAt: string
  aspect: Aspect
  theme: Theme
  tone: Tone
  language: string
  voice?: VoiceSettings
  course?: string // the series folder, for a course's own set
  exercises: string[]
}

/** .studio/exercise.json in an exercise: what isn't in its files. */
interface Saved {
  failed?: string
  warnings?: string[]
  video?: string
  subtitles?: string
  revise?: string // what the user asked to have explained better; the video is redone
  from?: { file: string; pages?: string }
}

const IMAGE = /\.(png|jpe?g|gif|webp)$/i
const PDF = /\.pdf$/i
const PLACEHOLDER = 'New exercises'
const COURSE_FILE = 'course.md' // a course's exercise: the series bible, for its notation

const setFile = (folder: string) => join(folder, 'exercises.json')
const savedFile = (dir: string) => join(dir, '.studio', 'exercise.json')
const two = (n: number) => String(n).padStart(2, '0')

const sets = new Map<string, ExerciseSet>() // the sets loaded this session, by folder
const agents = new Map<string, EpisodeAgent>() // by exercise folder
const busy = new Map<string, 'solve' | 'video'>() // exercises whose agent step is running
const exporting = new Map<string, string>() // exercise folder → export job id
const driving = new Set<string>() // set folders whose loop runs
export const exercisesBusy = (): boolean => busy.size > 0 || exporting.size > 0 || [...sets.values()].some((set) => set.intake?.state === 'reading')
let send: (set: ExerciseSet) => void = () => {}

export function setupExercises(sendSet: typeof send): void {
  send = sendSet
}

// --- files ------------------------------------------------------------------------------------

function readSetFile(folder: string): SetFile {
  return JSON.parse(readFileSync(setFile(folder), 'utf8')) as SetFile
}

function writeSetFile(folder: string, f: SetFile): void {
  writeFileSync(setFile(folder), JSON.stringify(f, null, 2))
}

function readSaved(dir: string): Saved {
  try {
    return JSON.parse(readFileSync(savedFile(dir), 'utf8')) as Saved
  } catch {
    return {}
  }
}

function writeSaved(dir: string, patch: Partial<Saved>): void {
  mkdirSync(join(dir, '.studio'), { recursive: true })
  writeFileSync(savedFile(dir), JSON.stringify({ ...readSaved(dir), ...patch }, null, 2))
}

const readText = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8') : null)
const readSolution = (dir: string) => {
  const text = readText(join(dir, SOLUTION_FILE))
  return text ? parseSolution(text) : null
}

function itemFrom(dir: string, number: number): ExerciseItem {
  const saved = readSaved(dir)
  const solution = readSolution(dir)
  const video = saved.video && existsSync(saved.video) ? saved.video : undefined
  return {
    dir,
    number,
    title: readMeta(dir).name,
    state: saved.failed ? 'failed' : video && !saved.revise ? 'done' : solution ? 'solved' : 'waiting',
    error: saved.failed,
    warnings: saved.warnings ?? [],
    topic: solution?.topic,
    answer: solution?.answer,
    video,
    subtitles: saved.subtitles && existsSync(saved.subtitles) ? saved.subtitles : undefined,
    watched: isWatched(dir),
  }
}

function load(folder: string): ExerciseSet {
  const f = readSetFile(folder)
  const items = f.exercises.filter((name) => existsSync(join(folder, name, 'project.json'))).map((name, i) => itemFrom(join(folder, name), i + 1))
  return { folder, title: f.title, level: f.level, createdAt: f.createdAt, items, course: f.course }
}

/** Every set this app knows: the ones it made, and any in the projects folder. */
function setFolders(): string[] {
  const { exerciseSets = [], projectsDir } = getSettings()
  const found = new Set(exerciseSets.filter((f) => existsSync(setFile(f))))
  if (existsSync(projectsDir))
    for (const name of readdirSync(projectsDir)) {
      if (existsSync(setFile(join(projectsDir, name)))) found.add(join(projectsDir, name))
      // A course's own set (ADR 0030): found too, so a folder brought back after a reinstall has its exercises.
      else if (existsSync(setFile(join(projectsDir, name, 'exercises')))) found.add(join(projectsDir, name, 'exercises'))
    }
  return [...found]
}

const loaded = (folder: string): ExerciseSet => {
  let set = sets.get(folder)
  if (!set) sets.set(folder, (set = load(folder)))
  return set
}

const snapshot = (set: ExerciseSet): ExerciseSet => structuredClone(set)

const changed = (set: ExerciseSet) => send(snapshot(set))

function update(set: ExerciseSet, it: ExerciseItem, patch: Partial<ExerciseItem>): void {
  Object.assign(it, patch)
  changed(set)
}

const setOf = (dir: string): ExerciseSet => {
  const folder = readMeta(dir).exercise?.set
  if (!folder || !existsSync(setFile(folder))) throw new Error('This project isn’t part of an exercise set.')
  return loaded(folder)
}

const itemOf = (dir: string): { set: ExerciseSet; it: ExerciseItem } => {
  const set = setOf(dir)
  const it = set.items.find((i) => i.dir === dir)
  if (!it) throw new Error('That exercise isn’t in its set any more.')
  return { set, it }
}

// --- the API ------------------------------------------------------------------------------------

/** The set as its screen shows it; opening it carries on with what's unfinished. */
export function exerciseSet(folder: string): ExerciseSet {
  const set = loaded(folder)
  void drive(set)
  return snapshot(set)
}

/** Every set, for Home. Listing doesn't start any work. */
export function exerciseSets(): ExerciseSet[] {
  return setFolders()
    .map((folder) => {
      try {
        return snapshot(loaded(folder))
      } catch {
        return null // an unreadable exercises.json
      }
    })
    .filter((s): s is ExerciseSet => !!s)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

async function ensureReady(): Promise<void> {
  if (setupStatus().env !== 'ready') throw new Error('The manim environment isn’t installed yet (Settings → Environment).')
  if (!fakeAgents() && !(await claudeStatus()).loggedIn) throw new Error('Sign in to your agent first (Settings → Accounts): it solves the exercises.')
}

/** Throws, saying what to do, when there's nothing to read or a file can't be read. */
function checkInput(input: ExerciseInput): void {
  if (!input.text.trim() && !input.files.length) throw new Error('Add at least one exercise: type it, paste a picture or add a file.')
  const odd = input.files.filter((f) => !IMAGE.test(f) && !PDF.test(f))
  if (odd.length)
    throw new Error(
      `Only pictures (PNG, JPEG, GIF, WebP) and PDFs can be added; ${odd.map((f) => basename(f)).join(', ')} can’t. Take a screenshot of it instead.`,
    )
}

export async function createExerciseSet(req: NewExerciseSet): Promise<string> {
  await ensureReady()
  checkInput(req.input)
  const root = getSettings().projectsDir
  const title = req.title?.trim() || PLACEHOLDER
  const stem = slugify(req.title?.trim() || `exercises-${new Date().toISOString().slice(0, 10)}`)
  let folder = join(root, stem)
  for (let i = 2; existsSync(folder); i++) folder = join(root, `${stem}-${i}`)
  mkdirSync(folder, { recursive: true })
  writeSetFile(folder, {
    title,
    level: req.level?.trim() || undefined,
    createdAt: new Date().toISOString(),
    aspect: req.aspect,
    theme: req.theme,
    tone: req.tone,
    language: req.language,
    voice: req.voice,
    exercises: [],
  })
  setSettings({ exerciseSets: [folder, ...(getSettings().exerciseSets ?? []).filter((f) => f !== folder)] })
  await addExercises(folder, req.input)
  return folder
}

/** The series' own set (<series>/exercises/), made the first time: settings from its first episode. */
export function courseExercises(series: string): string {
  const folder = join(series, 'exercises')
  if (!existsSync(setFile(folder))) {
    const file = join(series, 'series.json')
    if (!existsSync(file)) throw new Error('That folder isn’t a series any more (its series.json is gone).')
    const { plan, episodes } = JSON.parse(readFileSync(file, 'utf8')) as { plan: { title: string }; episodes: string[] }
    const first = episodes.map((name) => join(series, name)).find((d) => existsSync(join(d, 'project.json')))
    if (!first) throw new Error('The series has no episodes yet.')
    const meta = readMeta(first)
    mkdirSync(folder, { recursive: true })
    writeSetFile(folder, {
      title: plan.title,
      createdAt: new Date().toISOString(),
      aspect: meta.aspect,
      theme: meta.theme,
      tone: meta.tone ?? DEFAULT_TONE,
      language: meta.voice.language,
      voice: meta.voice,
      course: series,
      exercises: [],
    })
  }
  if (!(getSettings().exerciseSets ?? []).includes(folder)) setSettings({ exerciseSets: [folder, ...(getSettings().exerciseSets ?? [])] })
  return folder
}

/** Reads the exercises out of the input in the background; each one found is added and solved. */
export async function addExercises(folder: string, input: ExerciseInput): Promise<void> {
  await ensureReady()
  const set = loaded(folder)
  if (set.intake?.state === 'reading') throw new Error('Studio is still reading the last exercises you added. Add these once they show up.')
  checkInput(input)
  set.intake = { state: 'reading', files: input.files.length }
  changed(set)
  void (async () => {
    try {
      const { exercises, title } = await readExercises(readSetFile(folder), input)
      if (!exercises.length) throw new Error('No exercise was found in that. Type it out, or try a sharper picture.')
      const f = readSetFile(folder)
      if (f.title === PLACEHOLDER && title) {
        writeSetFile(folder, { ...f, title })
        set.title = title
      }
      for (const ex of exercises) await addOne(set, ex, input.files)
      set.intake = undefined
      changed(set)
      void drive(set)
    } catch (e) {
      set.intake = { state: 'failed', files: input.files.length, error: (e as Error).message }
      changed(set)
    }
  })()
}

async function addOne(set: ExerciseSet, ex: IntakeExercise, files: string[]): Promise<void> {
  const f = readSetFile(set.folder)
  const number = set.items.length + 1
  const made = await createProject({
    name: ex.title,
    aspect: f.aspect,
    theme: f.theme,
    tone: f.tone,
    language: f.language,
    voice: f.voice,
    exercise: { set: set.folder, title: set.title, number },
    parentDir: set.folder,
  })
  let dir = join(set.folder, `${two(number)}-${basename(made)}`)
  for (let i = 2; existsSync(dir); i++) dir = join(set.folder, `${two(number)}-${basename(made)}-${i}`)
  renameSync(made, dir)
  writeFileSync(join(dir, PROBLEM_FILE), `# ${ex.title}\n\n${ex.statement.trim()}\n`)
  if (f.course && existsSync(join(f.course, 'series.md'))) copyFileSync(join(f.course, 'series.md'), join(dir, COURSE_FILE))
  const src = ex.file ? files.find((p) => basename(p) === ex.file) : undefined
  if (src) {
    const into = IMAGE.test(src) ? 'media' : 'sources'
    mkdirSync(join(dir, into), { recursive: true })
    const name = `exercise${extname(src).toLowerCase()}`
    copyFileSync(src, join(dir, into, name))
    writeSaved(dir, { from: { file: `${into}/${name}`, pages: ex.pages } })
  }
  writeSetFile(set.folder, { ...f, exercises: [...f.exercises, basename(dir)] })
  set.items.push(itemFrom(dir, number))
  changed(set)
}

export async function retryExercise(dir: string): Promise<void> {
  await ensureReady()
  const { set, it } = itemOf(dir)
  writeSaved(dir, { failed: undefined })
  update(set, it, { ...itemFrom(dir, it.number), activity: undefined })
  void drive(set)
}

/** The video is made again, explaining what the user asks about more thoroughly. */
export async function reviseExercise(dir: string, request: string): Promise<void> {
  await ensureReady()
  if (!request.trim()) throw new Error('Say what should be explained better.')
  const { set, it } = itemOf(dir)
  if (busy.has(dir) || exporting.has(dir)) throw new Error('Its agent is still working on this exercise. Ask again once it’s done.')
  if (!readSolution(dir)) throw new Error('This exercise has no written solution yet. Ask once it has one.')
  writeSaved(dir, { revise: request.trim(), failed: undefined })
  update(set, it, { state: 'solved', error: undefined })
  void drive(set)
}

export function pauseExercises(folder: string, paused: boolean): void {
  const set = loaded(folder)
  set.paused = paused
  if (paused) for (const it of set.items) halt(it)
  changed(set)
  if (!paused) void drive(set)
}

/** To the Trash, with its agent and export stopped. */
export async function removeExercise(dir: string): Promise<void> {
  const { set, it } = itemOf(dir)
  set.items = set.items.filter((i) => i !== it)
  halt(it)
  const job = exporting.get(dir)
  if (job) cancelExport(job)
  const f = readSetFile(set.folder)
  writeSetFile(set.folder, { ...f, exercises: f.exercises.filter((name) => name !== basename(dir)) })
  set.items.forEach((i, n) => (i.number = n + 1))
  changed(set)
  await shell.trashItem(dir)
}

/** After a video was marked watched or not: the set's list shows it. */
export function watchedChanged(dir: string, watched: boolean): void {
  const folder = readMeta(dir).exercise?.set
  const set = folder ? sets.get(folder) : undefined
  const it = set?.items.find((i) => i.dir === dir)
  if (set && it) update(set, it, { watched })
}

/** A pasted picture as a file the intake can read, like one added from disk. */
export function savePastedImage(data: Uint8Array, ext: string): string {
  const folder = join(app.getPath('temp'), 'manim-studio-pasted')
  mkdirSync(folder, { recursive: true })
  const file = join(folder, `pasted-${Date.now()}.${/^(png|jpe?g|gif|webp)$/i.test(ext) ? ext.toLowerCase() : 'png'}`)
  writeFileSync(file, data)
  return file
}

export function exerciseDetail(dir: string): ExerciseDetail {
  const { it } = itemOf(dir)
  const problem = (readText(join(dir, PROBLEM_FILE)) ?? '').replace(/^# .*\r?\n+/, '')
  const media = join(dir, 'media')
  const pictures = existsSync(media)
    ? readdirSync(media)
        .filter((n) => IMAGE.test(n))
        .map((n) => join(media, n))
    : []
  const timeline = readTimeline(dir)
  return { item: structuredClone(it), problem, pictures, solution: readSolution(dir), preview: timeline?.video, chapters: timeline?.sections ?? [] }
}

export function searchExercises(query: string): ExerciseHit[] {
  if (!query.trim()) return []
  const hits: (ExerciseHit & { score: number })[] = []
  for (const folder of setFolders()) {
    let f: SetFile
    try {
      f = readSetFile(folder)
    } catch {
      continue
    }
    f.exercises.forEach((name, i) => {
      const dir = join(folder, name)
      if (!existsSync(join(dir, 'project.json'))) return
      const problem = readText(join(dir, PROBLEM_FILE)) ?? ''
      const solutionText = readText(join(dir, SOLUTION_FILE)) ?? ''
      const solution = solutionText ? parseSolution(solutionText) : null
      const title = readMeta(dir).name
      const score = searchScore(query, { title, topic: solution?.topic, tags: solution?.tags ?? [], problem, solution: solutionText })
      if (score)
        hits.push({
          set: folder,
          setTitle: f.title,
          dir,
          number: i + 1,
          title,
          topic: solution?.topic,
          snippet: snippet(query, problem.replace(/^# .*\n/, '')),
          score,
        })
    })
  }
  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
    .map(({ score: _, ...hit }) => hit)
}

/** The finished videos, in the order given, joined into <set>/lecture/, with subtitles and chapters. */
export async function makeLecture(folder: string, dirs: string[]): Promise<void> {
  const set = loaded(folder)
  if (set.lecture?.state === 'making') throw new Error('The lecture video is still being made.')
  const parts = dirs.map((d) => set.items.find((i) => i.dir === d)).filter((i): i is ExerciseItem => !!i?.video)
  if (!parts.length) throw new Error('None of those exercises has a finished video yet.')
  set.lecture = { state: 'making' }
  changed(set)
  try {
    const out = join(folder, 'lecture', `${slugify(set.title) || 'lecture'}.mp4`)
    const { durations } = await (await runRunner<{ durations: number[] }>('default', ['concat', out, ...parts.map((p) => p.video!)])).done
    const starts = durations.map((_, i) => durations.slice(0, i).reduce((a, b) => a + b, 0))
    const vtt = joinVtt(parts.map((p, i) => ({ text: (p.subtitles && readText(p.subtitles)) || '', offset: starts[i] })))
    const base = out.replace(/\.mp4$/, '')
    writeFileSync(`${base}.vtt`, vtt)
    writeFileSync(`${base}.srt`, vttToSrt(vtt))
    const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
    // YouTube's chapter list, for the video's description.
    writeFileSync(`${base}.chapters.txt`, parts.map((p, i) => `${clock(starts[i])} ${p.number}. ${p.title}`).join('\n') + '\n')
    set.lecture = { state: 'done', file: out }
  } catch (e) {
    set.lecture = { state: 'failed', error: (e as Error).message }
  }
  changed(set)
}

// --- the agents' work ---------------------------------------------------------------------------

/** The set's agents carry on with another agent or sign-in; exercises waiting on a usage limit start again at once (ADR 0048). */
export function switchExercisesAgent(folder: string, to: AgentRoute): void {
  const set = sets.get(folder)
  if (!set) throw new Error('That exercise set isn’t open.')
  set.route = to
  changed(set)
}

const halted = (set: ExerciseSet, it: ExerciseItem) => !!set.paused || !set.items.includes(it)

/** Stops an exercise's agent and render; its state stays, so it carries on from there later. */
function halt(it: ExerciseItem): void {
  agents.get(it.dir)?.close()
  cancel('preview', it.dir)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Hands out the work while the set has some: written solutions first, then videos and exports. */
async function drive(set: ExerciseSet): Promise<void> {
  if (driving.has(set.folder)) return
  driving.add(set.folder)
  try {
    while (sets.get(set.folder) === set && !set.paused) {
      for (const it of set.items) if (it.state === 'export' && !exporting.has(it.dir)) exportItem(set, it)
      const free = busy.size < Math.max(1, getSettings().seriesAgents || 3)
      const idle = (it: ExerciseItem) => !busy.has(it.dir)
      const next = set.items.find((it) => it.state === 'waiting' && idle(it)) ?? set.items.find((it) => it.state === 'solved' && idle(it))
      if (free && next) {
        busy.set(next.dir, next.state === 'waiting' ? 'solve' : 'video')
        void (next.state === 'waiting' ? solve(set, next) : video(set, next)).finally(() => busy.delete(next.dir))
        continue
      }
      const pending = set.items.some((it) => busy.has(it.dir) || exporting.has(it.dir) || ['waiting', 'solved', 'export'].includes(it.state))
      if (!pending) return
      await sleep(500)
    }
  } finally {
    driving.delete(set.folder)
  }
}

/** One agent session on an exercise: `work` gets its turns, past usage limits. A failure marks it. */
async function agentStep(
  set: ExerciseSet,
  it: ExerciseItem,
  state: 'solving' | 'video',
  work: (turn: (text: string, step: string) => Promise<void>) => Promise<void>,
): Promise<void> {
  const before = it.state
  const stopIf = () => {
    if (halted(set, it)) throw new Error('Stopped')
  }
  update(set, it, { state, activity: 'Starting', error: undefined })
  let agent: EpisodeAgent | null = null
  // The set's agent: Settings', or the one it switched to at a usage limit (ADR 0048).
  const route = (): AgentRoute => set.route ?? { agent: getSettings().agent, auth: configuredAuth(getSettings().agent) }
  const open = async () => {
    let opened = route()
    const a = await episodeAgent(it.dir, {
      onTool: (summary) => update(set, it, { activity: summary }),
      onUsage: () => undefined,
      ...(set.route ? opened : {}),
      followPriority: true,
      onSelection: (actual) => {
        if (fallbackEnabled()) { set.route = actual; opened = actual; changed(set) }
      },
    })
    agents.set(it.dir, a)
    return { a, opened }
  }
  try {
    let current = await open()
    agent = current.a
    await work(async (text, step) => {
      stopIf()
      let ask = text
      for (;;) {
        const { a, opened } = current
        const result = await turnPastLimits(
          (t) => a.turn(t, step),
          ask,
          (note, until) => update(set, it, { activity: note, limitedUntil: until }),
          stopIf,
          () => !sameRoute(route(), opened),
        )
        stopIf()
        if (result.switched) {
          a.close()
          current = await open()
          agent = current.a
          ask = `Another agent was working on this and was interrupted. Carry on where it stopped, with this task:\n\n${text}`
          continue
        }
        if (!result.ok) throw new Error(result.error ?? 'Claude stopped with an error')
        return
      }
    })
  } catch (e) {
    if (halted(set, it))
      update(set, it, { state: before, activity: undefined }) // paused or removed: it carries on later
    else {
      writeSaved(it.dir, { failed: (e as Error).message })
      update(set, it, { state: 'failed', error: (e as Error).message, activity: undefined })
    }
  } finally {
    if (agent) {
      if (agents.get(it.dir) === agent) agents.delete(it.dir)
      agent.close()
    }
  }
}

async function solve(set: ExerciseSet, it: ExerciseItem): Promise<void> {
  await agentStep(set, it, 'solving', async (turn) => {
    await turn(solvePrompt(it.dir), 'Solution')
    const solution = readSolution(it.dir)
    if (!solution?.steps.length) throw new Error('The agent didn’t write a solution with steps (solution.md). Try again.')
    update(set, it, { state: 'solved', activity: undefined, topic: solution.topic, answer: solution.answer })
  })
}

async function video(set: ExerciseSet, it: ExerciseItem): Promise<void> {
  const revise = readSaved(it.dir).revise
  await agentStep(set, it, 'video', async (turn) => {
    await turn(revise ? revisePrompt(revise) : videoPrompt(), revise ? 'Explaining more' : 'Video')
    update(set, it, { activity: 'Checking the render' })
    const warnings = await checkAndFix(
      it.dir,
      (text) => turn(text, 'Fixing the render'),
      () => {
        if (halted(set, it)) throw new Error('Stopped')
      },
    )
    writeSaved(it.dir, { revise: undefined, warnings })
    const solution = readSolution(it.dir)
    update(set, it, { state: 'export', warnings, activity: undefined, topic: solution?.topic, answer: solution?.answer })
  })
}

function exportItem(set: ExerciseSet, it: ExerciseItem): void {
  const { job, finished } = queueExport(it.dir, { themes: [], languages: [], languageVideos: false })
  exporting.set(it.dir, job.id)
  update(set, it, { activity: 'Exporting the video' })
  finished
    .then(
      (r) => {
        const video = r.files.find((f) => f.endsWith('.mp4'))
        const subtitles = r.files.find((f) => f.endsWith('.vtt'))
        writeSaved(it.dir, { video, subtitles })
        update(set, it, { state: 'done', video, subtitles, activity: undefined })
      },
      (e: Error) => {
        if (halted(set, it)) return update(set, it, { activity: undefined }) // it exports again when the set carries on
        writeSaved(it.dir, { failed: `The export failed: ${e.message}` })
        update(set, it, { state: 'failed', error: `The export failed: ${e.message}`, activity: undefined })
      },
    )
    .finally(() => exporting.delete(it.dir))
}

// --- reading the exercises out of what the user gave ------------------------------------------------

/** Per PDF, at most this much text goes to the intake. */
const MAX_TEXT = 30_000
/** Scanned PDFs are looked at as pictures, up to this many pages. */
const MAX_PAGES = 8

/** Claude takes pictures up to about 5 MB: a phone photo is scaled down to a size it reads well at. */
function picture(file: string): { mediaType: string; data: string } {
  const bytes = readFileSync(file)
  const ext = extname(file).slice(1).toLowerCase().replace('jpg', 'jpeg')
  const img = nativeImage.createFromBuffer(bytes)
  const { width, height } = img.getSize()
  if (bytes.length < 1_500_000 && Math.max(width, height) <= 2000) return { mediaType: `image/${ext}`, data: bytes.toString('base64') }
  const scaled =
    width >= height ? img.resize({ width: Math.min(width, 2000), quality: 'best' }) : img.resize({ height: Math.min(height, 2000), quality: 'best' })
  return { mediaType: 'image/jpeg', data: scaled.toJPEG(85).toString('base64') }
}

async function readExercises(f: SetFile, input: ExerciseInput): Promise<{ exercises: IntakeExercise[]; title?: string }> {
  const names = input.files.map((p) => basename(p))
  if (fakeAgents()) {
    // Driving the app in tests: typed exercises split as written, one per file.
    const typed = splitTyped(input.text).map((statement, i) => ({ title: statement.split(/[.!?\n]/)[0].slice(0, 50) || `Exercise ${i + 1}`, statement }))
    return {
      exercises: [...typed, ...names.map((file) => ({ title: basename(file, extname(file)), statement: 'The exercise is in the picture.', file }))],
      title: 'Practice set',
    }
  }
  const images: { name: string; mediaType: string; data: string }[] = []
  const material: string[] = []
  const work = join(tmpdir(), 'manim-studio-intake', randomUUID())
  try {
    for (const [i, file] of input.files.entries()) {
      const name = basename(file)
      if (IMAGE.test(file)) {
        images.push({ name, ...picture(file) })
        continue
      }
      const out = join(work, String(i))
      const { info } = await (await runRunner<{ info: { pages: number } }>('default', ['pdf-index', file, out])).done
      const text = readFileSync(join(out, 'text.txt'), 'utf8')
      material.push(`=== FILE: ${name} (${info.pages} pages) ===\n${text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n[… the rest is cut here]` : text}`)
      // Little text per page: a scan. Its pages go along as pictures.
      if (text.replace(/=== Page \d+ ===/g, '').trim().length < 80 * info.pages) {
        const pages = Array.from({ length: Math.min(info.pages, MAX_PAGES) }, (_, k) => k + 1)
        const { paths } = await (
          await runRunner<{ paths: string[] }>('default', ['pdf-pages', file, join(out, 'pages'), '--pages', pages.join(','), '--width', '1100'])
        ).done
        paths.forEach((p, k) => images.push({ name: `${name}, page ${k + 1}`, mediaType: 'image/png', data: readFileSync(p).toString('base64') }))
      }
    }
    const prompt = [
      `Read the exercises in what the user gave and write each one out, in ${languageName(f.language)} as given (don't translate).`,
      'One exercise per block. Sub-questions of one exercise (a, b, c…) stay in one block. Skip text that isn’t an exercise (headers, page numbers, answers printed at the back).',
      f.level ? `The exercises are for: ${f.level}.` : '',
      'Before the first block, one line "set: <a short title for all of them together>".',
      INTAKE_FORMAT,
      '',
      input.text.trim() ? `=== TYPED BY THE USER ===\n${input.text.trim()}` : '',
      ...material,
      images.length ? `Pictures attached: ${images.map((i) => i.name).join('; ')}. For a page of a scanned PDF, the file is the PDF's name.` : '',
    ]
      .filter(Boolean)
      .join('\n')
    const answer = await askClaude('You read maths and physics exercises out of text, photos and scans, exactly as written.', prompt, 'read the exercises', {
      images,
    })
    return { exercises: parseIntake(answer, names), title: intakeSetTitle(answer) }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

// --- what the agents are told ---------------------------------------------------------------------

const SOLUTION_FORMAT = `solution.md looks like this:

---
topic: the topic in a few words (e.g. "Integration by parts", "Projectile motion")
tags: [3 to 6 words someone would search for, in the exercise's language]
answer: the final answer, short, with maths in $…$
---
# The exercise's title

One or two sentences: what is asked, and the plan.

## A step's title
What is done in this step and why, in full sentences, with maths in $…$ (inline) and $$…$$ (display). One idea per step; usually 2 to 6 steps.

## Answer
The result, and a quick check that it makes sense (units, sign, size, a substitution).`

/** For one exercise: told in every turn, the chat's too (claude.ts). */
export function exerciseBrief(meta: ProjectMeta): string {
  const e = meta.exercise
  if (!e || !existsSync(setFile(e.set))) return ''
  const f = readSetFile(e.set)
  return [
    `This project is an exercise of the exercise set "${f.title}"${f.level ? `, for ${f.level}` : ''}. problem.md is the exercise as the user gave it; the original picture or PDF, when there is one, is in media/ or sources/. solution.md is the worked solution: its ## sections are the steps, and the video's sections are named after them.`,
    'The user is studying with it. When they ask a question, answer it in the chat: clearly, step by step, with maths in $…$ and $$…$$. Change files only when they ask for a change to the solution or the video.',
    'Check every computation with the calculate tool before you rely on it.',
    f.course
      ? 'These are the exercises of a course, the series in the folder above this set. course.md is its bible: use its notation and visual vocabulary, and point to the episode that teaches a method where it helps ("as in episode 3").'
      : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function solvePrompt(dir: string): string {
  const from = readSaved(dir).from
  return [
    'Solve the exercise in problem.md.',
    from
      ? `The original is ${from.file}${from.pages ? `, pages ${from.pages}` : ''}: look at it to check that problem.md says the same (numbers, figure, sub-questions).`
      : '',
    `Write solution.md: a worked solution a student can follow, in the project's language. ${SOLUTION_FORMAT}`,
    'Before writing a result down, check it with the calculate tool: recompute it, substitute the answer back, or compare numerically. If the statement is ambiguous or seems wrong, say so in the opening sentences and solve the most likely intended version.',
    'Only the written solution for now: don’t write script.md or scene.py yet.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

function videoPrompt(): string {
  return [
    'solution.md is checked. Now make the video of it: a short walkthrough of this one exercise, typically 1 to 3 minutes.',
    '- Open with the exercise: show what is given and asked (rebuilt with MathTex, or the original picture with image() or pdf_page()) while the narration says what is asked. No other introduction.',
    '- Then one section per ## step of solution.md, named exactly like the step (self.next_section("<the step’s title>")), in the same order, so the app can link each step to its part of the video. The first section is "Exercise".',
    '- Narrate the reasoning, not only the algebra: why each step is the natural next move. Keep it brisk; end on the answer and its check.',
    'Write script.md the same way (approve it yourself), then scene.py, render it and look at the frames.',
  ].join('\n')
}

function revisePrompt(request: string): string {
  return [
    `The user watched the video and says: "${request}"`,
    'Explain that more thoroughly: in solution.md and in the video, expand the step or steps it concerns (the intermediate steps, why it works, a picture where it helps). Keep the other steps as they are, and keep the video’s section names matching the steps of solution.md.',
    'Update script.md and scene.py, render and look at the frames.',
  ].join('\n')
}
