// The Antigravity CLI's stream-json events (`agy -p … --output-format stream-json`) as the chat's
// parts (ADR 0031). Plain code with no Electron, so it runs under node:test.
import type { ChatPart } from '../shared/types'

/** One NDJSON line of the CLI's output. */
export type AgyEvent =
  | { event: 'init'; init: { model?: string; cwd: string } }
  | {
      event: 'step_update'
      step_update: {
        conversation_id: string
        step_index: number
        state: string // ACTIVE, DONE, ERROR…
        step_type: string // user_input, agent_response, tool…
        text_delta?: string
        tool_info?: { name: string; parameters?: Record<string, unknown>; output?: string; error?: { message?: string } }
      }
    }
  | { event: 'result'; result: AgyResult }

export interface AgyResult {
  conversation_id: string
  status: string // SUCCESS, ERROR, CANCELED…
  response: string
  error?: string
  denied_actions?: { action: string; display_name?: string }[]
  usage?: { input_tokens: number; output_tokens: number; thinking_tokens: number; cache_read_tokens: number; total_tokens: number }
}

export interface AgyHandlers {
  part(part: ChatPart): void
  status(id: string, status: 'ok' | 'error'): void
  conversation(id: string): void
}

const STUDIO_TOOL: Record<string, string> = {
  render_preview: 'Rendering the preview',
  get_timeline: 'Reading the timeline',
  view_frames: 'Looking at frames',
  read_source: 'Reading a source',
  view_source_pages: 'Looking at source pages',
  calculate: 'Checking a calculation',
}

const VERB: Record<string, string> = { read_file: 'reading', write_file: 'writing', command: 'running', unsandboxed: 'running' }

const file = (p: Record<string, unknown> = {}) =>
  String(p.TargetFile ?? p.AbsolutePath ?? p.Path ?? p.SearchPath ?? '')
    .split(/[\\/]/)
    .pop() ?? ''

/** A tool step as a chat part: Studio's tools by their own names, the CLI's by what they do. */
export function toolPart(id: string, info: { name: string; parameters?: Record<string, unknown> }, status: 'running' | 'ok' | 'error'): ChatPart {
  const p = info.parameters ?? {}
  if (info.name === 'call_mcp_tool') {
    const tool = String(p.ToolName ?? '')
    return { kind: 'tool', id, name: `mcp__studio__${tool}`, summary: STUDIO_TOOL[tool] ?? tool, status }
  }
  if (/^(write_to_file|replace_file_content|multi_replace_file_content)$/.test(info.name))
    return { kind: 'tool', id, name: 'Edit', summary: `Editing ${file(p)}`, status }
  if (info.name === 'view_file') return { kind: 'tool', id, name: 'Read', summary: `Reading ${file(p)}`, status }
  if (/^(grep_search|find_by_name|list_dir|codebase_search)$/.test(info.name))
    return { kind: 'tool', id, name: 'Grep', summary: 'Searching the project', status }
  if (info.name === 'run_command') return { kind: 'tool', id, name: 'Shell', summary: `Running ${String(p.CommandLine ?? '').slice(0, 60)}`, status }
  if (/search_web|read_url/.test(info.name)) return { kind: 'tool', id, name: 'WebSearch', summary: 'Searching the web', status }
  return { kind: 'tool', id, name: info.name, summary: info.name.replace(/_/g, ' '), status }
}

/**
 * Follows one turn's events. `feed` takes each parsed line and returns the turn's outcome on its
 * `result`; the agent's text arrives in deltas and becomes a part once its step is done.
 */
export function agyFollower(on: AgyHandlers) {
  const texts = new Map<number, string>()
  const shown = new Set<string>() // tool steps already in the chat
  let refused = '' // what the last permission refusal was about, from the CLI's message
  let conversation = ''
  return function feed(e: AgyEvent): { ok: boolean; error?: string; result: AgyResult } | null {
    if (e.event === 'step_update') {
      const s = e.step_update
      if (s.conversation_id && s.conversation_id !== conversation) on.conversation((conversation = s.conversation_id))
      const id = `${s.conversation_id}:${s.step_index}`
      if (s.step_type === 'agent_response') {
        if (s.text_delta) texts.set(s.step_index, (texts.get(s.step_index) ?? '') + s.text_delta)
        const text = texts.get(s.step_index)?.trim()
        if (s.state !== 'ACTIVE' && text) {
          on.part({ kind: 'text', text })
          texts.delete(s.step_index)
        }
      } else if (s.step_type === 'tool' && s.tool_info) {
        const status = s.state === 'ACTIVE' ? 'running' : s.state === 'DONE' ? 'ok' : 'error'
        // A refused step can arrive already failed, with no ACTIVE step before it.
        if (!shown.has(id)) on.part(toolPart(id, s.tool_info, status))
        else if (status !== 'running') on.status(id, status)
        shown.add(id)
        const why = /permission check failed for (\w+) "([^"]*)"/.exec(s.tool_info.error?.message ?? '')
        if (why) refused = `${VERB[why[1]] ?? why[1]} ${why[2].replace(/\\\\/g, '\\')}`
      }
      return null
    }
    if (e.event === 'result') {
      const r = e.result
      if (r.conversation_id && r.conversation_id !== conversation) on.conversation((conversation = r.conversation_id))
      if (r.status !== 'SUCCESS') return { ok: false, error: r.error || `Antigravity stopped (${r.status.toLowerCase()}).`, result: r }
      // A refused tool ends a headless turn; say what was refused, since nobody could approve it.
      const denied = r.denied_actions?.map((d) => d.display_name || d.action) ?? []
      return denied.length
        ? {
            ok: false,
            error: refused
              ? `Antigravity stopped: Studio doesn’t allow ${refused} (only the project, Studio’s tools and the manim sources are allowed).`
              : `Antigravity stopped: Studio doesn’t allow ${[...new Set(denied)].join(', ')} outside the project or by shell.`,
            result: r,
          }
        : { ok: true, result: r }
    }
    return null
  }
}
