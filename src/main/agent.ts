// A series' background agents (ADR 0023): Claude working on one episode's project, outside the
// window, so several episodes are made at once. Each has the chat's tools and permissions, bound to
// its own project (claude.ts studioOptions), records its conversation in the episode's chat.json
// (opening the episode shows what it did) and keeps the session id, so the chat can carry on later.
import { randomUUID } from 'node:crypto'
import type { ChatMessage } from '../shared/types'
import { limitFrom, limitFromText, limitText, type Limit } from '../shared/usage-limit'
import { Inbox, sdk, studioOptions, summarize, type TurnResult } from './claude'
import { fakeAgent, fakeAgents } from './agent-fake'
import { commitAll } from './git'
import { readChat, updateMetaAt, writeChat } from './projects'

export interface EpisodeAgent {
  /** One turn: sends `text` and waits for Claude to finish. */
  turn(text: string): Promise<TurnResult>
  close(): void
}

/** Projects a background agent is working on: the chat leaves them alone until it's done. */
export const agentBusy = new Set<string>()

export async function episodeAgent(dir: string, onTool: (summary: string) => void): Promise<EpisodeAgent> {
  if (fakeAgents()) return fakeAgent(dir, onTool) // driving the app in tests
  const { query } = await sdk()
  const inbox = new Inbox()
  const q = query({ prompt: inbox, options: await studioOptions(dir, { autopilot: true }) })
  agentBusy.add(dir)
  const messages = readChat(dir)
  let reply = null as ChatMessage | null // the turn being answered (set by turn())
  let done: ((r: TurnResult) => void) | null = null
  let limit: Limit | null = null

  const finish = (ok: boolean, error?: string) => {
    const resolve = done
    done = null
    if (!resolve) return
    const limited = !ok && limit && (!limit.until || limit.until > Date.now()) ? limit : null
    if (limited) error = limitText(limited)
    if (!ok && error) messages.push({ id: randomUUID(), role: 'error', parts: [{ kind: 'text', text: error }], at: Date.now() })
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
    async turn(text) {
      const result = new Promise<TurnResult>((resolve) => (done = resolve))
      messages.push({ id: randomUUID(), role: 'user', parts: [{ kind: 'text', text }], at: Date.now() })
      reply = { id: randomUUID(), role: 'assistant', parts: [], at: Date.now() }
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
 * Runs a turn, and when a usage limit ends it, waits for the reset and tells Claude to carry on.
 * `waiting` shows what it's waiting for (undefined once it goes on); `check` throws to stop.
 */
export async function turnPastLimits(
  turn: (text: string) => Promise<TurnResult>,
  text: string,
  waiting: (note: string | undefined) => void,
  check: () => void,
): Promise<TurnResult> {
  let result = await turn(text)
  while (!result.ok && result.limitedUntil !== undefined) {
    check()
    const until = result.limitedUntil || Date.now() + 30 * 60_000 // reset time unknown: try again in half an hour
    waiting(`${limitText({ until })} Waiting, then it carries on by itself.`)
    while (Date.now() < until + 60_000) {
      check()
      await new Promise((r) => setTimeout(r, 5_000))
    }
    waiting(undefined)
    result = await turn('Your usage limit has reset. Carry on where you stopped, with the task above.')
  }
  return result
}
