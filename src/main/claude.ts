// Claude inside the app, through the Agent SDK and each user's own Claude login.
//
// Sign-in runs the unmodified Claude Code binary's own `auth login` (browser OAuth);
// the app never sees or stores a token. Usage counts against the signed-in user's
// plan, or against their own Anthropic API key if they set one in Settings.
// See docs/04-decisions/0004-claude-via-agent-sdk.md.
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import type { Options, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { sceneTools } from '../shared/studio-tools'
import type { ChatEvent, ChatMessage, ChatPart, ChatRequest, ClaudeLoginEvent, ClaudeStatus, ModelOption, PlanUsage, UsageWindow } from '../shared/types'
import { cleanEnv, pythonExe } from './env'
import { commitAll } from './git'
import { paths } from './paths'
import { mediaNames, project, readChat, readTimeline, requireProject, updateMeta, writeChat } from './projects'
import { frameBase64, pauseCommits } from './render'
import { getTimeline, renderPreview, viewFrames } from './scene-tools'
import { getSecret, getSettings } from './settings'

type Sdk = typeof import('@anthropic-ai/claude-agent-sdk')
let sdkPromise: Promise<Sdk> | null = null
const sdk = () => (sdkPromise ??= import('@anthropic-ai/claude-agent-sdk'))

/** Settings → Claude chooses between the Claude account sign-in and the user's own API key. */
const usingApiKey = () => getSettings().claudeAuth === 'api-key'

/** cleanEnv() strips inherited ANTHROPIC_* variables; the key saved in Settings goes back only when it's the chosen method. */
const claudeEnv = (): NodeJS.ProcessEnv => {
  const apiKey = usingApiKey() ? getSecret('anthropic') : ''
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

export async function claudeStatus(): Promise<ClaudeStatus> {
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

export function claudeLogin(onEvent: (e: ClaudeLoginEvent) => void): Promise<ClaudeStatus> {
  loginChild?.kill()
  return new Promise((resolvePromise) => {
    const child = spawn(paths.claude(), ['auth', 'login', '--claudeai'], { env: claudeEnv(), windowsHide: true })
    loginChild = child
    const onData = (b: Buffer) => {
      for (const line of b.toString().split('\n').map((l) => l.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim())) {
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
      resolvePromise(await claudeStatus())
    })
  })
}

export function claudeLoginCode(code: string): void {
  loginChild?.stdin?.write(code.trim() + '\n')
}

export async function claudeLogout(): Promise<ClaudeStatus> {
  await runClaude(['auth', 'logout'])
  return claudeStatus()
}

// --- chat -------------------------------------------------------------------------------

class Inbox implements AsyncIterable<SDKUserMessage> {
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
let messages: ChatMessage[] = []
let turn: { message: ChatMessage; prompt: string } | null = null
let emit: (e: ChatEvent) => void = () => {}

export function onChatEvent(fn: (e: ChatEvent) => void): void {
  emit = fn
}

export function loadChat(dir: string): void {
  closeChat()
  messages = readChat(dir)
}

export function closeChat(): void {
  session?.inbox.close()
  session?.query.close()
  session = null
  turn = null
  pauseCommits(false)
}

export async function chatSend(req: ChatRequest): Promise<void> {
  const p = requireProject()
  if (turn) throw new Error('Claude is still working on the previous message')

  const content: Exclude<SDKUserMessage['message']['content'], string> = []
  let frame: string | undefined
  if (req.frameAt !== undefined && readTimeline(p.path)) {
    const png = await frameBase64(req.frameAt, 854)
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: png } })
    frame = `data:image/png;base64,${png}`
  }
  content.push({ type: 'text', text: contextNote(req) + req.text })

  const user: ChatMessage = { id: randomUUID(), role: 'user', parts: [{ kind: 'text', text: req.text }], context: req.context, frame, at: Date.now() }
  const reply: ChatMessage = { id: randomUUID(), role: 'assistant', parts: [], at: Date.now() }
  messages.push(user, reply)
  turn = { message: reply, prompt: req.text }
  emit({ type: 'message', message: user })
  emit({ type: 'message', message: reply })
  emit({ type: 'busy', busy: true })
  pauseCommits(true)

  if (!session || session.dir !== p.path) await startSession(p.path)
  session!.inbox.push({ type: 'user', message: { role: 'user', content }, parent_tool_use_id: null, origin: { kind: 'human' } })
}

export async function chatInterrupt(): Promise<void> {
  await session?.query.interrupt().catch(() => undefined)
}

/** Model and effort also apply to the running conversation, so switching keeps its context. */
export async function applyChatSettings(): Promise<void> {
  const { claudeModel, claudeEffort } = getSettings()
  // A session that already ended picks the settings up when the next one starts.
  await session?.query.setModel(claudeModel || undefined).catch(() => undefined)
  await session?.query.applyFlagSettings({ effortLevel: claudeEffort || 'medium' }).catch(() => undefined)
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
export async function chatModels(): Promise<ModelOption[]> {
  const { query } = await sdk()
  const inbox = new Inbox()
  const q = query({ prompt: inbox, options: { env: claudeEnv(), pathToClaudeCodeExecutable: paths.claude(), settingSources: [] } })
  try {
    const list = await q.supportedModels()
    return list.map((m) => ({
      value: m.value === 'default' ? '' : m.value,
      // "Default (recommended)" says less than which model it is: "Opus 5.5 · Best for…" → "Default (Opus 5.5)".
      label: m.value === 'default' && m.description.includes(' · ') ? `Default (${m.description.split(' · ')[0]})` : m.displayName,
      description: m.description,
      efforts: m.supportsEffort ? (m.supportedEffortLevels ?? []) : [],
    }))
  } finally {
    inbox.close()
    q.close()
  }
}

/**
 * Translates narration sentences for dubbing (export.ts). A one-off request with no tools, on the
 * same sign-in and model as the chat. Returns one translation per sentence, in order.
 */
export async function translateNarration(sentences: string[], from: string, to: string): Promise<string[]> {
  if (!sentences.length) return []
  const { query } = await sdk()
  const prompt = [
    `Translate this narration of a maths explainer video from ${languageName(from)} to ${languageName(to)}.`,
    `It will be spoken by a text-to-speech voice over the same animation, so keep each sentence about as long as the original, keep the maths exact, and write maths the way a teacher says it aloud in ${languageName(to)}.`,
    `Answer with only a JSON array of ${sentences.length} strings, one per sentence, in order.`,
    '',
    JSON.stringify(sentences, null, 1),
  ].join('\n')
  const q = query({
    prompt,
    options: {
      env: claudeEnv(),
      pathToClaudeCodeExecutable: paths.claude(),
      settingSources: [],
      tools: [],
      maxTurns: 1,
      model: getSettings().claudeModel || undefined,
      systemPrompt: 'You translate narration for educational maths videos. You answer with JSON only.',
    },
  })
  let answer = ''
  for await (const msg of q) {
    if (msg.type !== 'result') continue
    if (msg.subtype !== 'success' || msg.is_error) throw new Error(`Claude couldn’t translate: ${msg.subtype === 'success' ? msg.result : msg.errors?.join(' ')}`)
    answer = msg.result
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(answer.slice(answer.indexOf('['), answer.lastIndexOf(']') + 1))
  } catch {
    parsed = null
  }
  if (!Array.isArray(parsed) || parsed.length !== sentences.length) throw new Error(`Claude’s ${languageName(to)} translation didn’t match the narration. Try the export again.`)
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
  rate_limits: Record<string, unknown> & { model_scoped?: { display_name: string; utilization: number | null; resets_at: string | null }[] } | null
}

/**
 * The plan's limits as /usage shows them: shared with claude.ai and Claude Desktop, not just Studio.
 * The SDK marks this call experimental, so a missing or renamed method only hides the meter.
 */
export async function claudeUsage(): Promise<PlanUsage | null> {
  if (usingApiKey()) return null
  const read = async (q: Query) => {
    const usage = (q as unknown as Record<string, unknown>).usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET
    if (typeof usage !== 'function') return null
    const answer = (await usage.call(q, { skipBehaviors: true })) as UsageAnswer
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
  return notes.length ? notes.join('\n') + '\n\n' : ''
}

async function startSession(dir: string): Promise<void> {
  const { query, createSdkMcpServer, tool, getSessionInfo } = await sdk()
  const meta = requireProject().meta
  // A project synced from another machine carries a session id this machine doesn't have.
  const resumable = meta.claudeSessionId && (await getSessionInfo(meta.claudeSessionId, { dir }).catch(() => undefined))
  const inbox = new Inbox()
  const studio = createSdkMcpServer({
    name: 'studio',
    version: app.getVersion(),
    tools: [
      tool('render_preview', sceneTools.render_preview.description, sceneTools.render_preview.shape, () => renderPreview()),
      tool('get_timeline', sceneTools.get_timeline.description, sceneTools.get_timeline.shape, async () => getTimeline()),
      tool('view_frames', sceneTools.view_frames.description, sceneTools.view_frames.shape, ({ times }) => viewFrames(times)),
    ],
  })

  const studioTools = ['mcp__studio__render_preview', 'mcp__studio__get_timeline', 'mcp__studio__view_frames']
  const readRoots = [dir, paths.python(), join(paths.env(), '.pixi', 'envs', 'default')]
  const options: Options = {
    cwd: dir,
    env: claudeEnv(),
    pathToClaudeCodeExecutable: paths.claude(),
    model: getSettings().claudeModel || undefined,
    effort: getSettings().claudeEffort || 'medium',
    resume: resumable ? meta.claudeSessionId : undefined,
    includePartialMessages: true,
    settingSources: ['project'],
    tools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'TodoWrite'],
    // Reads inside the project need no approval; everything else goes through canUseTool.
    allowedTools: ['WebSearch', 'WebFetch', 'TodoWrite', ...studioTools],
    mcpServers: { studio },
    systemPrompt: { type: 'preset', preset: 'claude_code', append: studioPrompt(dir) },
    canUseTool: async (name, input) => {
      const target = String(input.file_path ?? input.path ?? '')
      const writes = name === 'Edit' || name === 'Write'
      if (!writes && !target && ['Glob', 'Grep'].includes(name)) return { behavior: 'allow', updatedInput: input }
      const roots = writes ? [dir] : readRoots
      if (target && roots.some((r) => inside(r, isAbsolute(target) ? target : resolve(dir, target)))) {
        return { behavior: 'allow', updatedInput: input }
      }
      return { behavior: 'deny', message: `In Manim Studio, ${name} may only work inside the project (${dir}).` }
    },
    stderr: (line) => console.error('[claude]', line),
  }

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
    const ok = msg.subtype === 'success' && !msg.is_error
    // A failed turn (e.g. expired sign-in) can still arrive as subtype "success" with is_error.
    const error = ok ? undefined : msg.subtype === 'success' ? msg.result : msg.errors?.join('\n')
    finishTurn(ok, error, msg.total_cost_usd)
  }
}

function finishTurn(ok: boolean, error?: string, costUsd?: number): void {
  const t = turn
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
}

// --- prompt and tool text --------------------------------------------------------------------

function studioPrompt(dir: string): string {
  const meta = requireProject().meta
  const portrait = meta.aspect === '9:16'
  const site = join(paths.env(), '.pixi', 'envs', 'default', process.platform === 'win32' ? 'Lib' : 'lib/python3.12', 'site-packages')
  return [
    '# Manim Studio',
    'You are working inside Manim Studio, a desktop editor for making short educational maths videos with manim.',
    `The project folder is ${dir}. The video is scene.py; the app renders it on every save and shows a timeline produced by the render. Read the project's CLAUDE.md first; it holds the conventions.`,
    `Format: ${meta.aspect} (${portrait ? 'portrait for phones, frame 8 × 14.2 units' : 'landscape, frame 14.2 × 8 units'}), theme "${meta.theme}", voice provider "${meta.voice.provider}".`,
    'You cannot run shell commands. To see your work: render_preview (waits for the render and reports errors and layout warnings), then view_frames at the moments you changed. Always look before saying something is done.',
    `The manim 0.21 and manim-voiceover sources are readable under ${site} (manim/, manim_voiceover/); the studio helpers under ${paths.python()}/studio. Read them instead of guessing an API.`,
    `Write all narration and on-screen text in ${languageName(meta.voice.language)}. Reply to the user in the language they write to you in, briefly: what you changed and what you checked.`,
    mediaNote(dir),
    `The python used for renders is ${pythonExe('default')} (for reference only).`,
  ].join('\n')
}

function summarize(name: string, input: unknown): string {
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
      return `Opening ${String(i.url ?? '').replace(/^https?:\/\//, '').split('/')[0]}`
    case 'TodoWrite':
      return 'Planning steps'
    case 'mcp__studio__render_preview':
      return 'Rendering the preview'
    case 'mcp__studio__get_timeline':
      return 'Reading the timeline'
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
