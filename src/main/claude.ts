// Claude inside the app, through the Agent SDK and each user's own Claude login.
//
// Sign-in runs the unmodified Claude Code binary's own `auth login` (browser OAuth);
// the app never sees or stores a token. Usage counts against the signed-in user's
// plan, or against their own Anthropic API key if they set one in Settings.
// See docs/04-decisions/0004-claude-via-agent-sdk.md.
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { Options, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { pageRanges } from '../shared/pages'
import { sceneTools } from '../shared/studio-tools'
import type {
  Agent,
  ChatEvent,
  ChatMessage,
  ChatPart,
  ChatRequest,
  ClaudeLoginEvent,
  ClaudeStatus,
  Effort,
  ModelOption,
  PlanUsage,
  UsageWindow,
  ClaudeAuth,
} from '../shared/types'
import { agentBusy, configuredAuth } from './agent'
import { reportAgentOutcome } from './agent-limit-notifications'
import {
  antigravityLogin,
  antigravityLoginCode,
  antigravityLogout,
  antigravityModels,
  antigravityStatus,
  antigravityTurn,
  askAntigravity,
  closeAntigravity,
  interruptAntigravity,
} from './antigravity'
import { askCodex, closeCodex, codexLogin, codexLogout, codexModels, codexStatus, codexTurn, interruptCodex } from './codex'
import { cleanEnv, pythonExe } from './env'
import { commitAll } from './git'
import { paths } from './paths'
import { mediaNames, project, readChat, readMeta, readTimeline, requireProject, updateMeta, writeChat } from './projects'
import { frameBase64, pauseCommits } from './render'
import { calculate, getTimeline, readSource, renderPreview, viewFrames, viewSourcePages } from './scene-tools'
import { getSecret, getSettings } from './settings'
import { sourcesNote } from './sources'
import { scriptBrief } from '../shared/script'
import { styleBrief } from '../shared/tone'
import { limitFrom, limitFromText, limitText, usageLimitFromError, type Limit } from '../shared/usage-limit'
import type { UsageEntry } from '../shared/usage'
import { entryFrom, readUsage, recordTurn } from './usage'
import { seriesBrief } from './series'
import { exerciseBrief } from './exercises'
import { momentNote } from '../shared/moment'
import { studyReply } from './study-assistant'

type Sdk = typeof import('@anthropic-ai/claude-agent-sdk')
let sdkPromise: Promise<Sdk> | null = null
export const sdk = () => (sdkPromise ??= import('@anthropic-ai/claude-agent-sdk'))

/** Settings → Agent (Claude) chooses between the Claude account sign-in and the user's own API key. */
const usingApiKey = () => getSettings().claudeAuth === 'api-key'

/** Settings → Agent: Codex instead of Claude (ADR 0022). The chat, quick mode and translation follow it. */
export const codexChosen = () => getSettings().agent === 'codex'
/** Settings → Agent: Google's Antigravity CLI (ADR 0031), routed like Codex. */
export const antigravityChosen = () => getSettings().agent === 'antigravity'
/** Codex or Antigravity: no Claude plan usage to show. */
export const claudeNotChosen = () => codexChosen() || antigravityChosen()

/** cleanEnv() strips inherited ANTHROPIC_* variables; the key saved in Settings goes back only when it's the chosen method. */
const claudeEnv = (auth?: ClaudeAuth): NodeJS.ProcessEnv => {
  // `auth`: a series that carries on past the account's limit with the key (ADR 0048); otherwise Settings.
  const apiKey = (auth ? auth === 'api-key' : usingApiKey()) ? getSecret('anthropic') : ''
  return { ...cleanEnv(), CLAUDE_AGENT_SDK_CLIENT_APP: `manim-studio/${app.getVersion()}`, ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}) }
}

export const languageName = (code: string) => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

// --- sign-in ----------------------------------------------------------------------------

function runClaude(args: string[]): Promise<{ code: number | null; out: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(paths.claude(), args, { env: claudeEnv(), windowsHide: true })
    let out = ''
    child.stdout.on('data', (b) => (out += b))
    child.stderr.on('data', (b) => (out += b))
    child.on('error', reject)
    child.on('close', (code) => resolvePromise({ code, out }))
  })
}

/** The chosen agent, or `agent` (Settings → Accounts manages every agent's sign-in, chosen or not). */
const agentOr = (agent?: Agent): Agent => agent ?? getSettings().agent

export async function claudeStatus(agent?: Agent): Promise<ClaudeStatus> {
  const a = agentOr(agent)
  if (a === 'codex') return { ...(await codexStatus()), agent: 'codex' }
  if (a === 'antigravity') return { ...(await antigravityStatus()), agent: 'antigravity' }
  return { ...(await claudeOnlyStatus()), agent: 'claude' }
}

async function claudeOnlyStatus(): Promise<ClaudeStatus> {
  if (usingApiKey()) return { loggedIn: !!getSecret('anthropic'), method: 'api-key', subscription: 'API key' }
  try {
    const { out } = await runClaude(['auth', 'status'])
    const json = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1))
    return {
      loggedIn: !!json.loggedIn,
      email: json.email ?? json.account?.email,
      subscription: json.subscriptionType ?? json.subscription ?? json.plan,
      method: json.authMethod,
    }
  } catch (e) {
    return { loggedIn: false, error: (e as Error).message }
  }
}

let loginChild: ChildProcess | null = null

export function claudeLogin(onEvent: (e: ClaudeLoginEvent) => void, agent?: Agent): Promise<ClaudeStatus> {
  const a = agentOr(agent)
  if (a === 'codex') return codexLogin(onEvent).then((st) => ({ ...st, agent: 'codex' }))
  if (a === 'antigravity') return antigravityLogin(onEvent).then((st) => ({ ...st, agent: 'antigravity' }))
  loginChild?.kill()
  return new Promise((resolvePromise) => {
    const child = spawn(paths.claude(), ['auth', 'login', '--claudeai'], { env: claudeEnv(), windowsHide: true })
    loginChild = child
    const onData = (b: Buffer) => {
      for (const line of b
        .toString()
        .split('\n')
        .map((l) => l.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim())) {
        if (!line) continue
        const url = line.match(/https:\/\/\S+/)?.[0]
        onEvent({ line, url, needsCode: /paste|code/i.test(line) && !url })
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('close', async () => {
      loginChild = null
      onEvent({ done: true })
      resolvePromise(await claudeStatus('claude'))
    })
  })
}

export function claudeLoginCode(code: string, agent?: Agent): void {
  if (agentOr(agent) === 'antigravity') return antigravityLoginCode(code)
  loginChild?.stdin?.write(code.trim() + '\n')
}

export async function claudeLogout(agent?: Agent): Promise<ClaudeStatus> {
  const a = agentOr(agent)
  if (a === 'codex') return { ...(await codexLogout()), agent: 'codex' }
  if (a === 'antigravity') return { ...(await antigravityLogout()), agent: 'antigravity' }
  await runClaude(['auth', 'logout'])
  return claudeStatus('claude')
}

// --- chat -------------------------------------------------------------------------------

export class Inbox implements AsyncIterable<SDKUserMessage> {
  private items: SDKUserMessage[] = []
  private wake: (() => void) | null = null
  private closed = false
  push(m: SDKUserMessage) {
    this.items.push(m)
    this.wake?.()
  }
  close() {
    this.closed = true
    this.wake?.()
  }
  async *[Symbol.asyncIterator]() {
    while (!this.closed) {
      const next = this.items.shift()
      if (next) yield next
      else await new Promise<void>((r) => (this.wake = r))
      this.wake = null
    }
  }
}

interface Session {
  dir: string
  query: Query
  inbox: Inbox
}

let session: Session | null = null
let studyAbort: AbortController | null = null
let messages: ChatMessage[] = []
let turn: { message: ChatMessage; prompt: string; step: string; tools: Record<string, number>; started: number; agent: Agent; auth: 'account' | 'api-key' } | null = null
let emit: (e: ChatEvent) => void = () => {}

const observers = new Set<(e: ChatEvent) => void>()

export function onChatEvent(fn: (e: ChatEvent) => void): void {
  emit = (e) => {
    fn(e)
    observers.forEach((o) => o(e))
  }
}

/** Also tells `fn` what the chat does (quick mode follows Claude's progress); returns the unsubscribe. */
export function observeChat(fn: (e: ChatEvent) => void): () => void {
  observers.add(fn)
  return () => observers.delete(fn)
}

// Quick and series mode: Claude works unattended, approves its own script and never stops to ask.
let autopilot = false
export function setAutopilot(on: boolean): void {
  if (autopilot === on) return
  autopilot = on
  closeChat() // the next turn starts a session with the matching brief
}

let turnDone: ((r: TurnResult) => void) | null = null
export type TurnResult = { ok: boolean; error?: string; limitedUntil?: number; switched?: boolean }

/** The plan's usage limit while Claude refuses for it (claude.ai sign-in only; API keys have none). */
let limit: Limit | null = null
const activeLimit = () => (limit && (!limit.until || limit.until > Date.now()) ? limit : null)

function noteLimit(msg: SDKMessage): void {
  if (msg.type === 'rate_limit_event') limit = limitFrom(msg.rate_limit_info)
  else if (msg.type === 'result' && msg.subtype === 'success' && msg.is_error) limit = limitFromText(msg.result) ?? limit
}

/** Sends a message as the user and waits until Claude's turn ends. */
/** Sends a message and waits for Claude's turn to end. `limitedUntil` says a usage limit ended it. */
export async function chatAndWait(text: string, step = 'Chat'): Promise<TurnResult> {
  const done = new Promise<TurnResult>((resolve) => (turnDone = resolve))
  await chatSend({ text }, step)
  return done
}

export function loadChat(dir: string): void {
  closeChat()
  messages = readChat(dir)
}

export function closeChat(): void {
  studyAbort?.abort()
  studyAbort = null
  closeCodex()
  closeAntigravity()
  session?.inbox.close()
  session?.query.close()
  session = null
  turn = null
  pauseCommits(false)
}

/** `step` labels the turn in the project's usage log (quick mode says which step it is). */
export async function chatSend(req: ChatRequest, step = 'Chat'): Promise<void> {
  const p = requireProject()
  if (turn) throw new Error('Claude is still working on the previous message')
  if (agentBusy.has(p.path)) throw new Error('A background agent is working on this project. Chat here once it’s done.')

  if (req.study || req.watchingAt !== undefined) {
    if (!req.text.trim() || req.text.length > 40_000) throw new Error('Write a shorter question (up to 40,000 characters).')
    const controller = new AbortController()
    studyAbort = controller
    const history = [...messages]
    const user: ChatMessage = { id: randomUUID(), role: 'user', parts: [{ kind: 'text', text: req.text }], studyAction: req.studyAction, at: Date.now() }
    const reply: ChatMessage = { id: randomUUID(), role: 'assistant', parts: [], at: Date.now() }
    messages.push(user, reply)
    const agent = getSettings().agent
    turn = { message: reply, prompt: req.text, step: 'Tutor', tools: {}, started: Date.now(), agent, auth: configuredAuth(agent) }
    emit({ type: 'message', message: user })
    emit({ type: 'message', message: reply })
    emit({ type: 'busy', busy: true })
    writeChat(messages)
    void (async () => {
      try {
        const result = await studyReply(p.path, req, history, controller.signal, (text) => {
          if (studyAbort === controller) emit({ type: 'delta', messageId: reply.id, text })
        }, (png) => {
          if (studyAbort !== controller) return
          user.frame = `data:image/png;base64,${png}`
          emit({ type: 'message', message: user })
        })
        if (studyAbort !== controller) return
        const { text, ...metadata } = result
        Object.assign(reply, metadata, { parts: text ? [{ kind: 'text', text }] : [] })
        if (req.confirmVideo && result.videoOffer?.state === 'created') {
          const original = messages.find((m) => m.id === req.confirmVideo)
          if (original?.videoOffer) {
            original.videoOffer = undefined
            emit({ type: 'message', message: original })
          }
        }
        emit({ type: 'message', message: reply })
        finishTurn(true)
      } catch (e) {
        if (studyAbort === controller) finishTurn(false, (e as Error).message)
      } finally {
        if (studyAbort === controller) studyAbort = null
      }
    })()
    return
  }

  const content: Exclude<SDKUserMessage['message']['content'], string> = []
  let frame: string | undefined
  const at = req.watchingAt ?? req.frameAt
  if (at !== undefined && readTimeline(p.path)) {
    const png = await frameBase64(at, 854)
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: png } })
    frame = `data:image/png;base64,${png}`
  }
  content.push({ type: 'text', text: contextNote(req) + req.text })

  const user: ChatMessage = {
    id: randomUUID(),
    role: 'user',
    parts: [{ kind: 'text', text: req.text }],
    context: req.context,
    frame,
    source: req.source,
    at: Date.now(),
  }
  const reply: ChatMessage = { id: randomUUID(), role: 'assistant', parts: [], at: Date.now() }
  messages.push(user, reply)
  const agent = getSettings().agent
  turn = { message: reply, prompt: req.text, step, tools: {}, started: Date.now(), agent, auth: configuredAuth(agent) }
  emit({ type: 'message', message: user })
  emit({ type: 'message', message: reply })
  emit({ type: 'busy', busy: true })
  pauseCommits(true)

  if (codexChosen() || antigravityChosen()) return void codexChat(p.path, contextNote(req) + req.text, frame)
  if (!session || session.dir !== p.path) await startSession(p.path)
  session!.inbox.push({ type: 'user', message: { role: 'user', content }, parent_tool_use_id: null, origin: { kind: 'human' } })
}

/** One turn with Codex or Antigravity: their events become the same chat parts Claude's do. */
async function codexChat(dir: string, text: string, frame?: string): Promise<void> {
  const reply = turn!.message
  const images: string[] = []
  if (frame) {
    const file = join(dir, '.studio', 'frames', `chat-${Date.now()}.png`)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, Buffer.from(frame.split(',')[1], 'base64'))
    images.push(file)
  }
  const meta = requireProject().meta
  const on = {
    part: (part: ChatPart) => {
      reply.parts.push(part)
      emit({ type: 'part', messageId: reply.id, part })
    },
    status: (id: string, status: 'ok' | 'error') => {
      const part = reply.parts.find((x) => x.kind === 'tool' && x.id === id)
      if (part && part.kind === 'tool') part.status = status
      emit({ type: 'tool-status', messageId: reply.id, toolId: id, status })
    },
  }
  const result = antigravityChosen()
    ? await antigravityTurn(dir, studioPrompt(dir, 'antigravity', autopilot), text, images, meta.antigravityConversationId, {
        ...on,
        conversation: (id) => project() && project()!.meta.antigravityConversationId !== id && updateMeta({ antigravityConversationId: id }),
      })
    : await codexTurn(dir, studioPrompt(dir, 'codex', autopilot), text, images, meta.codexThreadId, {
        ...on,
        thread: (id) => project() && project()!.meta.codexThreadId !== id && updateMeta({ codexThreadId: id }),
      })
  finishTurn(result.ok, result.error)
}

export async function chatInterrupt(): Promise<void> {
  studyAbort?.abort()
  interruptCodex()
  interruptAntigravity()
  await session?.query.interrupt().catch(() => undefined)
}

/** Model and effort also apply to the running conversation, so switching keeps its context. */
export async function applyChatSettings(): Promise<void> {
  const { claudeModel, claudeEffort } = getSettings()
  // A session that already ended picks the settings up when the next one starts.
  await session?.query.setModel(claudeModel || 'claude-sonnet-5-5').catch(() => undefined)
  await session?.query.applyFlagSettings({ effortLevel: claudeEffort || 'high' }).catch(() => undefined)
}

export async function chatReset(): Promise<void> {
  closeChat()
  messages = []
  if (project()) {
    updateMeta({ claudeSessionId: undefined })
    writeChat([])
  }
  emit({ type: 'reset' })
}

/** What this account can use. Not cached: it changes with the sign-in or API key (the renderer asks once per account). */
export async function chatModels(agent?: Agent): Promise<ModelOption[]> {
  if (agentOr(agent) === 'codex') return codexModels()
  if (agentOr(agent) === 'antigravity') return antigravityModels()
  const { query } = await sdk()
  const inbox = new Inbox()
  const q = query({ prompt: inbox, options: { env: claudeEnv(), pathToClaudeCodeExecutable: paths.claude(), settingSources: [] } })
  try {
    // Only the current generation (5.5): older models wrote noticeably worse scenes, and Fable isn't for this.
    const list = (await q.supportedModels()).filter((m) => m.value === 'default' || /\b5\.5\b/.test(m.displayName))
    return list.map((m) => ({
      value: m.value === 'default' ? '' : m.value,
      // Claude Code's "Default" is its own (Opus on some plans); in Studio no model means Sonnet 5.5.
      label: m.value === 'default' ? 'Studio default (Sonnet 5.5)' : m.displayName,
      description: m.value === 'default' ? 'Sonnet 5.5: writes scenes well, faster and cheaper than Opus.' : m.description,
      efforts: m.supportsEffort ? (m.supportedEffortLevels ?? []) : [],
    }))
  } finally {
    inbox.close()
    q.close()
  }
}

/**
 * A one-off request with no tools, on the chat's sign-in and model: translation, series planning.
 * `what` names it in errors ("Claude couldn't plan: …").
 */
export async function askClaude(...args: Parameters<typeof askWithAgent>): Promise<string> {
  const agent = getSettings().agent
  const route = { agent, auth: configuredAuth(agent) }
  try {
    const answer = await askWithAgent(...args)
    reportAgentOutcome(route, { ok: true })
    return answer
  } catch (error) {
    reportAgentOutcome(route, { ok: false, error: (error as Error).message, limitedUntil: agent === 'claude' ? activeLimit()?.until : undefined })
    throw error
  }
}

async function askWithAgent(
  system: string,
  prompt: string,
  what: string,
  opts: {
    onText?: (soFar: string) => void
    signal?: AbortSignal
    model?: string
    effort?: Effort
    onUsage?: (entry: UsageEntry) => void
    images?: { name: string; mediaType: string; data: string }[] // pictures to read along with the prompt
  } = {},
): Promise<string> {
  if (codexChosen()) return askCodex(system, prompt, what, opts.images, opts) // Codex answers at once at the end
  if (antigravityChosen()) return askAntigravity(system, prompt, what, opts.images, opts)
  const auth = usingApiKey() ? 'api-key' : 'account'
  const { query } = await sdk()
  const images = opts.images ?? []
  async function* withImages(): AsyncGenerator<SDKUserMessage> {
    const content: Exclude<SDKUserMessage['message']['content'], string> = images.flatMap((img) => [
      { type: 'text' as const, text: `Picture: ${img.name}` },
      { type: 'image' as const, source: { type: 'base64' as const, media_type: img.mediaType as 'image/png', data: img.data } },
    ])
    content.push({ type: 'text', text: prompt })
    yield { type: 'user', message: { role: 'user', content }, parent_tool_use_id: null }
  }
  const q = query({
    prompt: images.length ? withImages() : prompt,
    options: {
      includePartialMessages: !!opts.onText, // the answer as it's written, for progress
      env: claudeEnv(auth),
      pathToClaudeCodeExecutable: paths.claude(),
      settingSources: [],
      tools: [],
      maxTurns: 1,
      model: opts.model || getSettings().claudeModel || 'claude-sonnet-5-5',
      ...(opts.effort ? { effort: opts.effort } : {}),
      systemPrompt: system,
    },
  })
  const stop = () => q.close()
  opts.signal?.addEventListener('abort', stop)
  let answer = ''
  let soFar = ''
  for await (const msg of q) {
    if (opts.signal?.aborted) break
    noteLimit(msg)
    if (msg.type === 'stream_event' && msg.event.type === 'content_block_delta' && msg.event.delta.type === 'text_delta') {
      soFar += msg.event.delta.text
      opts.onText?.(soFar)
      continue
    }
    if (msg.type !== 'result') continue
    opts.onUsage?.(entryFrom(what, msg, {}, {}, msg.duration_ms, auth))
    if (msg.subtype !== 'success' || msg.is_error)
      throw new Error(activeLimit() ? limitText(activeLimit()!) : `Claude couldn’t ${what}: ${msg.subtype === 'success' ? msg.result : msg.errors?.join(' ')}`)
    answer = msg.result
  }
  opts.signal?.removeEventListener('abort', stop)
  if (opts.signal?.aborted) throw Object.assign(new Error('cancelled'), { cancelled: true })
  return answer
}

/**
 * Translates narration sentences for dubbing (export.ts). A one-off request with no tools, on the
 * same sign-in and model as the chat. Returns one translation per sentence, in order.
 */
export async function translateNarration(sentences: string[], from: string, to: string): Promise<string[]> {
  if (!sentences.length) return []
  const prompt = [
    `Translate this narration of a maths explainer video from ${languageName(from)} to ${languageName(to)}.`,
    `It will be spoken by a text-to-speech voice over the same animation, so keep each sentence about as long as the original, keep the maths exact, and write maths the way a teacher says it aloud in ${languageName(to)}.`,
    `Answer with only a JSON array of ${sentences.length} strings, one per sentence, in order.`,
    '',
    JSON.stringify(sentences, null, 1),
  ].join('\n')
  const answer = await askClaude('You translate narration for educational maths videos. You answer with JSON only.', prompt, 'translate')
  let parsed: unknown
  try {
    parsed = JSON.parse(answer.slice(answer.indexOf('['), answer.lastIndexOf(']') + 1))
  } catch {
    parsed = null
  }
  if (!Array.isArray(parsed) || parsed.length !== sentences.length)
    throw new Error(`Claude’s ${languageName(to)} translation didn’t match the narration. Try the export again.`)
  return parsed.map(String)
}

const WINDOW_LABELS: Record<string, string> = {
  five_hour: '5-hour limit',
  seven_day: 'Weekly limit',
  seven_day_opus: 'Weekly Opus',
  seven_day_sonnet: 'Weekly Sonnet',
}

type UsageAnswer = {
  rate_limits_available: boolean
  rate_limits: (Record<string, unknown> & { model_scoped?: { display_name: string; utilization: number | null; resets_at: string | null }[] }) | null
}

/**
 * The plan's limits as /usage shows them: shared with claude.ai and Claude Desktop, not just Studio.
 * The SDK marks this call experimental, so a missing or renamed method only hides the meter.
 */
export async function claudeUsage(includeUnselected = false): Promise<PlanUsage | null> {
  if (usingApiKey() || (!includeUnselected && claudeNotChosen())) return null
  const read = async (q: Query) => {
    const usage = (q as unknown as Record<string, unknown>).usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET
    if (typeof usage !== 'function') return null
    let timer: ReturnType<typeof setTimeout> | undefined
    const answer = await Promise.race([
      usage.call(q, { skipBehaviors: true }) as Promise<UsageAnswer>,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Plan usage read timed out')), 8000)
      }),
    ]).finally(() => clearTimeout(timer))
    if (!answer.rate_limits_available || !answer.rate_limits) return null
    const windows: UsageWindow[] = []
    for (const [key, label] of Object.entries(WINDOW_LABELS)) {
      const w = answer.rate_limits[key] as { utilization: number | null; resets_at: string | null } | null | undefined
      if (w?.utilization != null) windows.push({ label, percent: w.utilization, resetsAt: w.resets_at })
    }
    for (const w of answer.rate_limits.model_scoped ?? [])
      if (w.utilization != null) windows.push({ label: `Weekly ${w.display_name}`, percent: w.utilization, resetsAt: w.resets_at })
    return windows.length ? { windows, checkedAt: Date.now() } : null
  }
  try {
    if (session) return await read(session.query)
    const { query } = await sdk()
    const inbox = new Inbox()
    const q = query({ prompt: inbox, options: { env: claudeEnv(), pathToClaudeCodeExecutable: paths.claude(), settingSources: [] } })
    try {
      return await read(q)
    } finally {
      inbox.close()
      q.close()
    }
  } catch {
    return null
  }
}

/** Which of the user's pictures and videos the scene can use (CLAUDE.md explains image() and VideoClip()). */
export function mediaNote(dir: string): string {
  const names = mediaNames(dir)
  return names.length
    ? `The user's pictures and videos in media/: ${names.join(', ')}. Show a picture with image("name") and a video with VideoClip("name") (both from studio; see studio/media.py).`
    : 'The project has no pictures or videos of its own (media/ is empty).'
}

function contextNote(req: ChatRequest): string {
  const notes: string[] = []
  if (req.context) {
    const c = req.context
    const lines = [...new Set(c.lines)].sort((a, b) => a - b)
    notes.push(
      `[Selected on the timeline: ${c.start.toFixed(2)}–${c.end.toFixed(2)} s` +
        (lines.length ? `, scene.py lines ${lines.join(', ')}` : '') +
        (c.labels.length ? ` (${c.labels.slice(0, 6).join('; ')})` : '') +
        ']',
    )
  }
  if (req.frameAt !== undefined) notes.push(`[Attached image: the preview frame at ${req.frameAt.toFixed(2)} s]`)
  if (req.watchingAt !== undefined) {
    const p = requireProject()
    notes.push(
      `[The user is watching the finished video and paused ${momentNote(readTimeline(p.path), req.watchingAt)}. The attached image is that frame. Answer their question in the chat, as a patient tutor, about what is on screen there; change files only if they ask for a change to the video.]`,
    )
  }
  if (req.source) {
    const pages = req.source.pages?.length ? `, pages ${pageRanges(req.source.pages)}` : ''
    notes.push(`[Attached source: sources/${req.source.name}${pages}. Read it with read_source and look at its pages with view_source_pages.]`)
  }
  return notes.length ? notes.join('\n') + '\n\n' : ''
}

/** A project's meta: the open one's in memory, any other's from its project.json. */
const metaOf = (dir: string) => (project()?.path === dir ? project()!.meta : readMeta(dir))

/**
 * What a Claude session on the project in `dir` gets: Studio's tools bound to that project, the
 * file permissions (writes only inside it) and the brief. The chat and a series' background agents
 * (agent.ts) share it. `resume` continues the project's conversation when this machine has it.
 */
export async function studioOptions(dir: string, opts: { autopilot: boolean; model?: string; effort?: Effort | null; auth?: ClaudeAuth }): Promise<Options> {
  const { createSdkMcpServer, tool, getSessionInfo } = await sdk()
  const meta = metaOf(dir)
  // A project synced from another machine carries a session id this machine doesn't have.
  const resumable = meta.claudeSessionId && (await getSessionInfo(meta.claudeSessionId, { dir }).catch(() => undefined))
  const studio = createSdkMcpServer({
    name: 'studio',
    version: app.getVersion(),
    tools: [
      tool('render_preview', sceneTools.render_preview.description, sceneTools.render_preview.shape, () => renderPreview(dir)),
      tool('get_timeline', sceneTools.get_timeline.description, sceneTools.get_timeline.shape, async () => getTimeline(dir)),
      tool('view_frames', sceneTools.view_frames.description, sceneTools.view_frames.shape, ({ times }) => viewFrames(dir, times)),
      tool('read_source', sceneTools.read_source.description, sceneTools.read_source.shape, ({ source, from_page, to_page }) =>
        readSource(dir, source, from_page, to_page),
      ),
      tool('view_source_pages', sceneTools.view_source_pages.description, sceneTools.view_source_pages.shape, ({ source, pages }) =>
        viewSourcePages(dir, source, pages),
      ),
      tool('calculate', sceneTools.calculate.description, sceneTools.calculate.shape, ({ code }) => calculate(dir, code)),
    ],
  })

  const studioTools = Object.keys(sceneTools).map((name) => `mcp__studio__${name}`)
  const readRoots = [dir, paths.python(), join(paths.env(), '.pixi', 'envs', 'default')]
  return {
    cwd: dir,
    env: claudeEnv(opts.auth),
    pathToClaudeCodeExecutable: paths.claude(),
    model: opts.model || getSettings().claudeModel || 'claude-sonnet-5-5',
    ...(opts.effort === null ? {} : { effort: opts.effort || getSettings().claudeEffort || 'high' }),
    resume: resumable ? meta.claudeSessionId : undefined,
    includePartialMessages: true,
    settingSources: ['project'],
    tools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'TodoWrite'],
    // Reads inside the project need no approval; everything else goes through canUseTool.
    allowedTools: ['WebSearch', 'WebFetch', 'TodoWrite', ...studioTools],
    mcpServers: { studio },
    systemPrompt: { type: 'preset', preset: 'claude_code', append: studioPrompt(dir, 'claude', opts.autopilot) },
    canUseTool: async (name, input) => {
      const target = String(input.file_path ?? input.path ?? '')
      const writes = name === 'Edit' || name === 'Write'
      if (!writes && !target && ['Glob', 'Grep'].includes(name)) return { behavior: 'allow', updatedInput: input }
      // Claude Code opens PDF pages only with poppler installed; our tools work everywhere.
      if (name === 'Read' && /\.pdf$/i.test(target))
        return { behavior: 'deny', message: 'Use read_source for a PDF’s text and view_source_pages to look at its pages.' }
      const roots = writes ? [dir] : readRoots
      if (target && roots.some((r) => inside(r, isAbsolute(target) ? target : resolve(dir, target)))) {
        return { behavior: 'allow', updatedInput: input }
      }
      return { behavior: 'deny', message: `In Manim Studio, ${name} may only work inside the project (${dir}).` }
    },
    stderr: (line) => console.error('[claude]', line),
  }
}

async function startSession(dir: string): Promise<void> {
  const { query } = await sdk()
  const inbox = new Inbox()
  const options = await studioOptions(dir, { autopilot })
  const q = query({ prompt: inbox, options })
  session = { dir, query: q, inbox }
  void pump(session)
}

async function pump(s: Session): Promise<void> {
  try {
    for await (const msg of s.query) handle(msg)
  } catch (e) {
    finishTurn(false, (e as Error).message)
  } finally {
    if (session === s) session = null
    if (turn) finishTurn(false, 'The connection to Claude was lost.')
  }
}

function handle(msg: SDKMessage): void {
  noteLimit(msg)
  if (msg.type === 'system' && msg.subtype === 'init') {
    if (project() && project()!.meta.claudeSessionId !== msg.session_id) updateMeta({ claudeSessionId: msg.session_id })
    return
  }
  if (!turn) return
  const reply = turn.message

  if (msg.type === 'stream_event' && !msg.parent_tool_use_id) {
    const ev = msg.event
    if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') emit({ type: 'delta', messageId: reply.id, text: ev.delta.text })
    return
  }
  if (msg.type === 'assistant' && !msg.parent_tool_use_id) {
    for (const block of msg.message.content) {
      let part: ChatPart | null = null
      if (block.type === 'text' && block.text.trim()) part = { kind: 'text', text: block.text }
      if (block.type === 'tool_use') part = { kind: 'tool', id: block.id, name: block.name, summary: summarize(block.name, block.input), status: 'running' }
      if (block.type === 'tool_use') turn.tools[block.name] = (turn.tools[block.name] ?? 0) + 1
      if (part) {
        reply.parts.push(part)
        emit({ type: 'part', messageId: reply.id, part })
      }
    }
    return
  }
  if (msg.type === 'user' && Array.isArray(msg.message.content)) {
    for (const block of msg.message.content) {
      if (block.type !== 'tool_result') continue
      const status = block.is_error ? 'error' : 'ok'
      const part = reply.parts.find((p) => p.kind === 'tool' && p.id === block.tool_use_id)
      if (part && part.kind === 'tool') part.status = status
      emit({ type: 'tool-status', messageId: reply.id, toolId: block.tool_use_id, status })
    }
    return
  }
  if (msg.type === 'result') {
    const dir = project()?.path
    if (dir) recordTurn(dir, turn.step, msg, turn.tools, Date.now() - turn.started, turn.auth)
    const ok = msg.subtype === 'success' && !msg.is_error
    // A failed turn (e.g. expired sign-in) can still arrive as subtype "success" with is_error.
    const error = ok ? undefined : msg.subtype === 'success' ? msg.result : msg.errors?.join('\n')
    finishTurn(ok, error, msg.total_cost_usd)
  }
}

function finishTurn(ok: boolean, error?: string, costUsd?: number): void {
  const t = turn
  const limited = ok ? null : t?.agent === 'claude' ? activeLimit() ?? usageLimitFromError(error) : usageLimitFromError(error)
  if (limited && t?.agent === 'claude') error = limitText(limited)
  if (ok) limit = null
  if (t) reportAgentOutcome(t, { ok, error, limitedUntil: limited?.until })
  turn = null
  pauseCommits(false)
  if (t) {
    for (const p of t.message.parts) if (p.kind === 'tool' && p.status === 'running') p.status = ok ? 'ok' : 'error'
    if (!ok && error) messages.push({ id: randomUUID(), role: 'error', parts: [{ kind: 'text', text: error }], at: Date.now() })
    const dir = project()?.path
    if (dir) {
      writeChat(messages)
      void commitAll(dir, `Claude: ${t.prompt.split('\n')[0].slice(0, 72)}`, 'claude').catch(() => null)
    }
  }
  emit({ type: 'busy', busy: false })
  emit({ type: 'done', ok, error, costUsd })
  const waiter = turnDone
  turnDone = null
  waiter?.({ ok, error, limitedUntil: limited?.until })
}

// --- prompt and tool text --------------------------------------------------------------------

export function studioPrompt(dir: string, agent: Agent, autopilot: boolean): string {
  const meta = metaOf(dir)
  const portrait = meta.aspect === '9:16'
  const site = join(paths.env(), '.pixi', 'envs', 'default', process.platform === 'win32' ? 'Lib' : 'lib/python3.12', 'site-packages')
  return [
    '# Manim Studio',
    'You are working inside Manim Studio, a desktop editor for making educational maths videos with manim.',
    `The project folder is ${dir}. The video is scene.py; the app renders it on every save and shows a timeline produced by the render. Read the project's CLAUDE.md first; it holds the conventions.`,
    `Format: ${meta.aspect} (${portrait ? 'portrait for phones, frame 8 × 14.2 units' : 'landscape, frame 14.2 × 8 units'}), theme "${meta.theme}", voice provider "${meta.voice.provider}".`,
    agent === 'antigravity'
      ? "Edit files in the project yourself (your write tools; Studio allows writes inside the project only). You cannot run shell commands: they are refused and end your turn, so never run manim or python. To see your work, call the studio MCP server's tools with call_mcp_tool: render_preview (waits for the render and reports errors and layout warnings), then view_frames at the moments you changed. Always look before saying something is done. Read PDF sources with read_source and view_source_pages, and check maths with calculate."
      : agent === 'codex'
        ? 'Edit files in the project yourself. Never run manim or python to render: Studio renders. To see your work, call the studio tools: render_preview (waits for the render and reports errors and layout warnings), then view_frames at the moments you changed. Always look before saying something is done. Read PDF sources with read_source and view_source_pages.'
        : 'You cannot run shell commands. To see your work: render_preview (waits for the render and reports errors and layout warnings), then view_frames at the moments you changed. Always look before saying something is done.',
    `The manim 0.21 and manim-voiceover sources are readable under ${site} (manim/, manim_voiceover/); the studio helpers under ${paths.python()}/studio. Read them instead of guessing an API.`,
    `Write all narration and on-screen text in ${languageName(meta.voice.language)}. Reply to the user in the language they write to you in, briefly: what you changed and what you checked.`,
    styleBrief(meta),
    'In narration, read labels and indices as names, not quantities: R_{23} is "R two three" (in Croatian "er dva tri"), not "R twenty-three"; x_{12} is "x one two"; a point A_1 is "A one". Read a number as a number only when it is an amount, and follow how the material names things.',
    meta.captionBand
      ? `Keep the band where viewers' subtitles appear free of text and formulas: the bottom ${meta.aspect === '9:16' ? '2.6 units, and the right 0.9 units where phone apps put their buttons' : '1.1 units'}. SAFE_W and SAFE_H already leave it out; centre a full layout on SAFE_CENTER (not ORIGIN) and use to_edge(DOWN, buff=BOTTOM_BUFF). Pictures, shapes and axes may cross it; the render warns about text that does.`
      : '',
    'Mark the thumbnail once in scene.py: self.thumbnail("a 2 to 5 word hook") right after the animation that completes the key picture (the core idea fully on screen). The hook is in the narration language and makes someone want to watch; it is not the title. The exported thumbnail puts the hook and the episode number on the left of that frame.',
    seriesBrief(meta),
    exerciseBrief(meta),
    scriptBrief({ auto: autopilot }),
    autopilot
      ? 'You are working unattended: the user started this in quick mode and is not watching, so nobody can answer a question. Make every choice yourself, never stop to ask, and finish the whole job: the script, scene.py, a render with no errors and no layout warnings, and a last look at the frames. End with two or three sentences on what the video covers.'
      : '',
    mediaNote(dir),
    sourcesNote(dir),
    'To find something in a long PDF, Grep its text in .studio/sources/<name>/text.txt (one "=== Page N ===" line per page).',
    `The python used for renders is ${pythonExe('default')} (for reference only).`,
  ].join('\n')
}

export function summarize(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>
  const file = typeof i.file_path === 'string' ? basename(i.file_path) : ''
  switch (name) {
    case 'Read':
      return `Reading ${file}`
    case 'Edit':
      return `Editing ${file}`
    case 'Write':
      return `Writing ${file}`
    case 'Glob':
    case 'Grep':
      return `Searching ${String(i.pattern ?? '')}`.slice(0, 60)
    case 'WebSearch':
      return `Searching the web: ${String(i.query ?? '')}`.slice(0, 70)
    case 'WebFetch':
      return `Opening ${
        String(i.url ?? '')
          .replace(/^https?:\/\//, '')
          .split('/')[0]
      }`
    case 'TodoWrite':
      return 'Planning steps'
    case 'mcp__studio__render_preview':
      return 'Rendering the preview'
    case 'mcp__studio__get_timeline':
      return 'Reading the timeline'
    case 'mcp__studio__read_source':
      return `Reading ${String(i.source ?? '')}${i.from_page ? ` from page ${i.from_page}` : ''}`
    case 'mcp__studio__view_source_pages':
      return `Looking at ${String(i.source ?? '')}, page ${Array.isArray(i.pages) ? pageRanges(i.pages.map(Number)) : ''}`
    case 'mcp__studio__calculate':
      return 'Checking a calculation'
    case 'mcp__studio__view_frames':
      return `Looking at frames ${Array.isArray(i.times) ? i.times.map((t) => `${Number(t).toFixed(1)}s`).join(', ') : ''}`
    default:
      return name
  }
}

function inside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** What the open project's agent turns used (Usage in the chat's header). */
export const projectUsage = (): UsageEntry[] => (project() ? readUsage(project()!.path) : [])
