// A series' background agents (ADR 0023): Claude working on one episode's project, outside the
// window, so several episodes are made at once. Each has the chat's tools and permissions, bound to
// its own project (claude.ts studioOptions), records its conversation in the episode's chat.json
// (opening the episode shows what it did) and keeps the session id, so the chat can carry on later.
// With Codex or Antigravity chosen, the same agent runs on them (otherAgent): their bridge to
// Studio's tools names the project, so several projects are worked on at once.
import { randomUUID } from 'node:crypto'
import type { Agent, AgentRoute, ChatMessage, ChatPart, ClaudeAuth, Effort } from '../shared/types'
import type { UsageEntry } from '../shared/usage'
import { limitFrom, limitFromText, limitText, usageLimitFromError, type Limit } from '../shared/usage-limit'
import { reportAgentOutcome } from './agent-limit-notifications'
import { antigravitySession, antigravityUsesKey } from './antigravity'
import { antigravityChosen, claudeStatus, codexChosen, Inbox, sdk, studioOptions, studioPrompt, summarize, type TurnResult } from './claude'
import { codexSession, codexUsesKey } from './codex'
import { agentProjects } from './agent-projects'
import { fakeAgent, fakeAgents } from './agent-fake'
import { commitAll } from './git'
import { readChat, readMeta, updateMetaAt, writeChat } from './projects'
import { getSecret, getSettings } from './settings'
import { appendUsage, recordTurn } from './usage'

export interface EpisodeAgent {
  /** One turn: sends `text` and waits for Claude to finish. `step` labels its usage ("Script", "Video"…). */
  turn(text: string, step: string): Promise<TurnResult>
  close(): void
}

export interface AgentOptions {
  onTool: (summary: string) => void
  onUsage: (entry: UsageEntry) => void
  model?: string // the series' own choice; otherwise the chat's (Settings)
  effort?: Effort
  agent?: Agent
  auth?: ClaudeAuth // the account or the saved key, for this agent only (ADR 0048); otherwise Settings
  allowFallback?: boolean
  strictModel?: boolean // an experiment supplies its effort explicitly, including no effort
}

/** Projects a background agent is working on: the chat leaves them alone until it's done. */
export const agentBusy = new Set<string>()

export async function episodeAgent(dir: string, opts: AgentOptions): Promise<EpisodeAgent> {
  const agent = opts.agent ?? getSettings().agent
  const route: AgentRoute = { agent, auth: opts.auth ?? configuredAuth(agent) }
  const session = await createEpisodeAgent(dir, opts)
  return {
    async turn(text, step) {
      const result = await session.turn(text, step)
      reportAgentOutcome(route, result)
      return result
    },
    close: () => session.close(),
  }
}

async function createEpisodeAgent(dir: string, opts: AgentOptions): Promise<EpisodeAgent> {
  if (fakeAgents()) return fakeAgent(dir, opts) // driving the app in tests
  if (opts.agent ? opts.agent === 'codex' : codexChosen()) return otherAgent(dir, opts, 'codex')
  if (opts.agent ? opts.agent === 'antigravity' : antigravityChosen()) return otherAgent(dir, opts, 'antigravity')
  const { onTool } = opts
  const auth = opts.auth ?? configuredAuth('claude')
  const { query } = await sdk()
  const inbox = new Inbox()
  const q = query({
    prompt: inbox,
    options: await studioOptions(dir, {
      autopilot: true,
      model: opts.model,
      effort: opts.strictModel && !opts.effort ? null : opts.effort,
      auth,
    }),
  })
  agentBusy.add(dir)
  const messages = readChat(dir)
  let reply = null as ChatMessage | null // the turn being answered (set by turn())
  let done: ((r: TurnResult) => void) | null = null
  let limit: Limit | null = null
  let step = '' // the turn's label and its tool calls, for the usage log
  let tools: Record<string, number> = {}
  let started = 0

  const finish = (ok: boolean, error?: string) => {
    const resolve = done
    done = null
    if (!resolve) return
    const limited = !ok && limit && (!limit.until || limit.until > Date.now()) ? limit : null
    if (limited) error = limitText(limited)
    if (!ok && error) messages.push({ id: randomUUID(), role: 'error', parts: [{ kind: 'text', text: error }], auto: true, at: Date.now() })
    writeChat(messages, dir)
    resolve({ ok, error, limitedUntil: limited?.until })
  }

  void (async () => {
    try {
      for await (const msg of q) {
        if (msg.type === 'rate_limit_event') limit = limitFrom(msg.rate_limit_info)
        else if (msg.type === 'system' && msg.subtype === 'init') updateMetaAt(dir, { claudeSessionId: msg.session_id })
        else if (msg.type === 'assistant' && !msg.parent_tool_use_id && reply) {
          for (const block of msg.message.content) {
            if (block.type === 'text' && block.text.trim()) reply.parts.push({ kind: 'text', text: block.text })
            if (block.type === 'tool_use') {
              const summary = summarize(block.name, block.input)
              reply.parts.push({ kind: 'tool', id: block.id, name: block.name, summary, status: 'running' })
              tools[block.name] = (tools[block.name] ?? 0) + 1
              onTool(summary)
            }
          }
        } else if (msg.type === 'user' && Array.isArray(msg.message.content) && reply) {
          for (const block of msg.message.content) {
            if (block.type !== 'tool_result') continue
            const part = reply.parts.find((p) => p.kind === 'tool' && p.id === block.tool_use_id)
            if (part && part.kind === 'tool') part.status = block.is_error ? 'error' : 'ok'
          }
        } else if (msg.type === 'result') {
          const ok = msg.subtype === 'success' && !msg.is_error
          if (!ok && msg.subtype === 'success') limit = limitFromText(msg.result) ?? limit
          if (step) opts.onUsage(recordTurn(dir, step, msg, tools, Date.now() - started, auth))
          finish(ok, ok ? undefined : msg.subtype === 'success' ? msg.result : msg.errors?.join('\n'))
        }
      }
    } catch (e) {
      finish(false, (e as Error).message)
    } finally {
      finish(false, 'The connection to Claude was lost.')
    }
  })()

  return {
    async turn(text, label) {
      const result = new Promise<TurnResult>((resolve) => (done = resolve))
      step = label
      tools = {}
      started = Date.now()
      messages.push({ id: randomUUID(), role: 'user', parts: [{ kind: 'text', text }], auto: true, at: Date.now() })
      reply = { id: randomUUID(), role: 'assistant', parts: [], auto: true, at: Date.now() }
      messages.push(reply)
      inbox.push({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] }, parent_tool_use_id: null, origin: { kind: 'human' } })
      const r = await result
      await commitAll(dir, `Claude: ${text.split('\n')[0].slice(0, 72)}`, 'claude').catch(() => null)
      return r
    },
    close() {
      agentBusy.delete(dir)
      finish(false, 'Stopped')
      inbox.close()
      q.close()
    },
  }
}

/**
 * The same agent on Codex or Antigravity: its turns and their steps go into the project's chat.json,
 * and the thread or conversation id into project.json, so the chat carries on from it. The project
 * is registered with the bridge (mcp.ts agentProjects) while the agent works in it.
 */
function otherAgent(dir: string, opts: AgentOptions, agent: 'codex' | 'antigravity'): EpisodeAgent {
  const auth = agent === 'antigravity' ? configuredAuth(agent) : opts.auth ?? configuredAuth(agent)
  agentBusy.add(dir)
  agentProjects.add(dir)
  const messages = readChat(dir)
  let reply: ChatMessage | null = null
  let step = '',
    startedAt = 0
  let tools: Record<string, number> = {}
  const on = {
    part(part: ChatPart) {
      if (!reply) return
      reply.parts.push(part)
      if (part.kind === 'tool') {
        opts.onTool(part.summary)
        tools[part.name] = (tools[part.name] ?? 0) + 1
      }
    },
    status(id: string, status: 'ok' | 'error') {
      const part = reply?.parts.find((p) => p.kind === 'tool' && p.id === id)
      if (part && part.kind === 'tool') part.status = status
    },
    usage(raw: Record<string, number>, model: string) {
      const cached = raw.cached_input_tokens ?? raw.cache_read_tokens ?? 0
      const entry: UsageEntry = {
        at: Date.now(),
        step,
        session: agent === 'codex' ? readMeta(dir).codexThreadId : readMeta(dir).antigravityConversationId,
        provider: agent,
        auth,
        providerUsage: raw,
        costKnown: false,
        tools: { ...tools },
        ms: Date.now() - startedAt,
        models: {
          [model]: {
            input: agent === 'codex' ? Math.max(0, (raw.input_tokens ?? 0) - cached) : (raw.input_tokens ?? 0),
            output: raw.output_tokens ?? 0,
            cacheRead: cached,
            cacheWrite: 0,
            costUSD: 0,
          },
        },
      }
      appendUsage(dir, entry)
      opts.onUsage(entry)
    },
  }
  const meta = readMeta(dir)
  const instructions = studioPrompt(dir, agent, true)
  const session =
    agent === 'codex'
      ? codexSession(dir, instructions, meta.codexThreadId, { ...on, thread: (id) => updateMetaAt(dir, { codexThreadId: id }) }, { ...opts, auth })
      : antigravitySession(
          dir,
          instructions,
          meta.antigravityConversationId,
          {
            ...on,
            conversation: (id) => updateMetaAt(dir, { antigravityConversationId: id }),
          },
          opts,
        )
  const name = agent === 'codex' ? 'Codex' : 'Antigravity'
  return {
    async turn(text, label) {
      step = label
      startedAt = Date.now()
      tools = {}
      messages.push({ id: randomUUID(), role: 'user', parts: [{ kind: 'text', text }], auto: true, at: Date.now() })
      reply = { id: randomUUID(), role: 'assistant', parts: [], auto: true, at: Date.now() }
      messages.push(reply)
      writeChat(messages, dir)
      const r = await session.turn(text)
      for (const p of reply.parts) if (p.kind === 'tool' && p.status === 'running') p.status = r.ok ? 'ok' : 'error'
      if (!r.ok && r.error) messages.push({ id: randomUUID(), role: 'error', parts: [{ kind: 'text', text: r.error }], auto: true, at: Date.now() })
      writeChat(messages, dir)
      await commitAll(dir, `${name}: ${text.split('\n')[0].slice(0, 72)}`, agent === 'codex' ? 'codex' : 'antigravity').catch(() => null)
      // Their CLIs end a turn at the plan's limit with an error; it waits like Claude's (reset time unknown).
      return { ok: r.ok, error: r.error, limitedUntil: !r.ok ? usageLimitFromError(r.error)?.until : undefined }
    },
    close() {
      session.close()
      // The process may exit after the app's last checkpoint; retain the partial conversation now.
      writeChat(messages, dir)
      agentBusy.delete(dir)
      agentProjects.delete(dir)
    },
  }
}

/**
 * Runs a turn, and when a usage limit ends it, waits for the reset and tells the agent to carry on.
 * `waiting` shows what it's waiting for and until when (undefined once it goes on); `check` throws to
 * stop. `moved` says the user chose another agent meanwhile (ADR 0048): the wait ends with `switched`,
 * and the caller carries on with that agent.
 */
export async function turnPastLimits(
  turn: (text: string) => Promise<TurnResult>,
  text: string,
  waiting: (note: string | undefined, until?: number) => void,
  check: () => void,
  moved: () => boolean = () => false,
): Promise<TurnResult> {
  let result = await turn(text)
  while (!result.ok && result.limitedUntil !== undefined) {
    check()
    const until = result.limitedUntil || Date.now() + 30 * 60_000 // reset time unknown: try again in half an hour
    waiting(`${limitText({ until })} Waiting, then it carries on by itself.`, until)
    while (Date.now() < until + 60_000) {
      check()
      if (moved()) {
        waiting(undefined)
        return { ok: false, switched: true }
      }
      await new Promise((r) => setTimeout(r, 2_000))
    }
    waiting(undefined)
    result = await turn('Your usage limit has reset. Carry on where you stopped, with the task above.')
  }
  return result
}

/** Who can take over when a plan's limit is reached: each signed-in agent, and a saved Claude or OpenAI key. */
export async function agentRoutes(): Promise<AgentRoute[]> {
  if (fakeAgents())
    return [
      { agent: 'claude', auth: 'account' },
      { agent: 'codex', auth: 'account' },
      { agent: 'claude', auth: 'api-key' },
    ]
  const configured = { claude: configuredAuth('claude'), codex: configuredAuth('codex'), antigravity: configuredAuth('antigravity') }
  const routes: AgentRoute[] = []
  for (const agent of ['claude', 'codex', 'antigravity'] as const) {
    if ((await claudeStatus(agent).catch(() => null))?.loggedIn) routes.push({ agent, auth: configured[agent] })
    // Antigravity keeps its sign-in in its own settings files, so only the method Settings chose.
    const key = agent === 'claude' ? 'anthropic' : agent === 'codex' ? 'openai' : null
    if (key && configured[agent] === 'account' && getSecret(key)) routes.push({ agent, auth: 'api-key' })
  }
  return routes
}

/** How Settings → Accounts signs this agent in. */
export function configuredAuth(agent: Agent): ClaudeAuth {
  if (agent === 'codex') return codexUsesKey() ? 'api-key' : 'account'
  if (agent === 'antigravity') return antigravityUsesKey() ? 'api-key' : 'account'
  return getSettings().claudeAuth ?? 'account'
}

export const sameRoute = (a: AgentRoute, b: AgentRoute): boolean => a.agent === b.agent && a.auth === b.auth
