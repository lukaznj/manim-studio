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
import { z } from 'zod'
import type { Options, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { ChatEvent, ChatMessage, ChatPart, ChatRequest, ClaudeLoginEvent, ClaudeStatus, ModelOption, Timeline } from '../shared/types'
import { cleanEnv, pythonExe } from './env'
import { commitAll } from './git'
import { paths } from './paths'
import { project, readChat, readTimeline, requireProject, updateMeta, writeChat } from './projects'
import { currentOrNewRender, frameBase64, framesBase64, pauseCommits } from './render'
import { getSecret, getSettings } from './settings'

type Sdk = typeof import('@anthropic-ai/claude-agent-sdk')
let sdkPromise: Promise<Sdk> | null = null
const sdk = () => (sdkPromise ??= import('@anthropic-ai/claude-agent-sdk'))

/** cleanEnv() strips inherited ANTHROPIC_* variables; a key the user saved in Settings is put back. */
const claudeEnv = (): NodeJS.ProcessEnv => {
  const apiKey = getSecret('anthropic')
  return { ...cleanEnv(), CLAUDE_AGENT_SDK_CLIENT_APP: `manim-studio/${app.getVersion()}`, ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}) }
}

const languageName = (code: string) => {
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
  if (getSecret('anthropic')) return { loggedIn: true, method: 'api-key', subscription: 'API key' }
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

export async function chatReset(): Promise<void> {
  closeChat()
  messages = []
  if (project()) {
    updateMeta({ claudeSessionId: undefined })
    writeChat([])
  }
  emit({ type: 'reset' })
}

let models: ModelOption[] | null = null

export async function chatModels(): Promise<ModelOption[]> {
  if (models) return models
  const { query } = await sdk()
  const inbox = new Inbox()
  const q = query({ prompt: inbox, options: { env: claudeEnv(), pathToClaudeCodeExecutable: paths.claude(), settingSources: [] } })
  try {
    const list = await q.supportedModels()
    models = list.map((m) => ({ value: m.value === 'default' ? '' : m.value, label: m.displayName, description: m.description }))
    return models
  } finally {
    inbox.close()
    q.close()
  }
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
      tool(
        'render_preview',
        'Render the low-resolution preview of scene.py and report what happened: duration, sections, layout warnings (things off screen, overlapping text), voice problems, or the error with its scene.py line. The app also re-renders on every save; this waits for that result. Call it after editing.',
        {},
        async () => textResult(describeOutcome(await currentOrNewRender())),
      ),
      tool(
        'get_timeline',
        'The current timeline from the last successful render: sections, every play()/wait() clip with its scene.py line and times, voiceover blocks with their text and audio source, subtitles and layout warnings.',
        {},
        async () => {
          const t = readTimeline(dir)
          return textResult(t ? describeTimeline(t) : 'No successful render yet.')
        },
      ),
      tool(
        'view_frames',
        'Look at frames of the latest preview render at the given times (seconds). Use it to check layout, legibility and that things look right — after every visual change. Up to 6 times per call.',
        { times: z.array(z.number()).min(1).max(6) },
        async ({ times }) => {
          if (!readTimeline(dir)) return textResult('Nothing rendered yet; call render_preview.')
          const images = await framesBase64(times, 854)
          return {
            content: images.flatMap((data, i) => [
              { type: 'text' as const, text: `Frame at ${times[i].toFixed(2)} s:` },
              { type: 'image' as const, data, mimeType: 'image/png' },
            ]),
          }
        },
      ),
    ],
  })

  const studioTools = ['mcp__studio__render_preview', 'mcp__studio__get_timeline', 'mcp__studio__view_frames']
  const readRoots = [dir, paths.python(), join(paths.env(), '.pixi', 'envs', 'default')]
  const options: Options = {
    cwd: dir,
    env: claudeEnv(),
    pathToClaudeCodeExecutable: paths.claude(),
    model: getSettings().claudeModel || undefined,
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
    `The python used for renders is ${pythonExe('default')} (for reference only).`,
  ].join('\n')
}

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

function describeOutcome(o: Awaited<ReturnType<typeof currentOrNewRender>>): string {
  if ('cancelled' in o) return 'The render was cancelled (a newer change started another one). Call render_preview again.'
  if ('error' in o) {
    const tb = o.error.traceback.split('\n').slice(-25).join('\n')
    return `Render FAILED${o.error.line ? ` (scene.py line ${o.error.line})` : ''}: ${o.error.message}\n\n${tb}`
  }
  return 'Render succeeded.\n' + describeTimeline(o.timeline)
}

function describeTimeline(t: Timeline): string {
  const f = (n: number) => n.toFixed(2)
  const out = [`Duration ${f(t.duration)} s, ${t.width}×${t.height}, render ${t.renderSeconds} s.`]
  if (t.sections.length) out.push('Sections: ' + t.sections.map((s) => `"${s.name || '—'}" ${f(s.start)}–${f(s.end)}`).join(', '))
  out.push('Clips:')
  for (const c of t.clips) {
    const what = c.anims.map((a) => (a.target ? `${a.name}(${a.target})` : a.name)).join(', ')
    out.push(`  ${f(c.start)}–${f(c.end)} line ${c.line ?? '?'} ${c.kind}: ${what}`)
  }
  for (const v of t.voice) out.push(`Voice ${f(v.start)}–${f(v.end)} line ${v.line ?? '?'} [${v.source}]: "${v.text}"`)
  for (const w of t.warnings) out.push(`WARNING ${f(w.start)}–${f(w.end)} line ${w.line ?? '?'}: ${w.message}`)
  for (const w of t.voiceWarnings) out.push(`WARNING voice: ${w}`)
  return out.join('\n')
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
