// API keys for the agents, tried for real like the ElevenLabs key (voice.ts checkElevenLabsKey):
// an Anthropic key for Claude, an OpenAI key for Codex. Each check lists what the key may do and,
// when something else stops it (an invalid key, no credit left), says what.
import Anthropic from '@anthropic-ai/sdk'
import type { KeyCheck } from '../shared/types'
import { getSecret, getSettings } from './settings'

const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`)

const cache = new Map<string, { key: string; result: KeyCheck }>()

function remembered(name: string, key: string, again: boolean): KeyCheck | null {
  const hit = cache.get(name)
  return !again && hit?.key === key ? hit.result : null
}

/**
 * An Anthropic key: it's valid (it lists the models), it can make requests (one token from Haiku,
 * a fraction of a cent) and it can use the model Studio runs.
 */
export async function checkAnthropicKey(key = getSecret('anthropic'), again = false): Promise<KeyCheck> {
  const hit = remembered('anthropic', key, again)
  if (hit) return hit
  if (!key) return { items: [], problem: 'No Anthropic API key is saved.', rejected: true }
  const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 20_000 })
  const model = getSettings().claudeModel || 'claude-sonnet-5-5'
  const result: KeyCheck = { items: [] }
  try {
    const ids: string[] = []
    for await (const m of client.models.list({ limit: 100 })) ids.push(m.id)
    result.items.push({ label: 'Valid key', ok: true })
    result.items.push({ label: `Model ${model}`, ok: ids.includes(model), why: 'The model Studio uses (Settings → Agent).' })
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError)
      return remember('anthropic', key, {
        items: [{ label: 'Valid key', ok: false }],
        problem: 'Anthropic doesn’t accept this key: it may be mistyped, revoked or from another account.',
        rejected: true,
      })
    if (e instanceof Anthropic.APIConnectionError) return { items: [], problem: 'Anthropic couldn’t be reached. Check the internet connection and try again.' }
    result.items.push({ label: 'Valid key', ok: true }) // listing models is refused, but the key itself is known
  }
  try {
    await client.messages.create({ model: 'claude-haiku-5-5', max_tokens: 1, output_config: { effort: 'low' }, messages: [{ role: 'user', content: '.' }] })
    result.items.push({ label: 'Requests', ok: true, why: 'It can send messages to Claude.' })
  } catch (e) {
    if (e instanceof Anthropic.PermissionDeniedError) result.items.push({ label: 'Requests', ok: false, why: 'Its workspace doesn’t allow sending messages.' })
    else if (e instanceof Anthropic.RateLimitError) result.items.push({ label: 'Requests', ok: true, why: 'Rate-limited right now, but allowed.' })
    else {
      result.items.push({ label: 'Requests', ok: false })
      // e.g. 400 "Your credit balance is too low to access the Anthropic API."
      result.problem = `Anthropic: ${sentence(e instanceof Anthropic.APIError ? String((e.error as { error?: { message?: string } })?.error?.message ?? e.message) : (e as Error).message)}`
    }
  }
  return remember('anthropic', key, result)
}

/** An OpenAI key for Codex: it's valid, it may list the models, and it can make a (tiny) request. */
export async function checkOpenAIKey(key = getSecret('openai'), again = false): Promise<KeyCheck> {
  const hit = remembered('openai', key, again)
  if (hit) return hit
  if (!key) return { items: [], problem: 'No OpenAI API key is saved.', rejected: true }
  const call = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`https://api.openai.com/v1${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    })
    const body = (await res.json().catch(() => null)) as { data?: { id: string }[]; error?: { message?: string; code?: string; type?: string } } | null
    return { status: res.status, body }
  }
  const result: KeyCheck = { items: [] }
  let models: string[] = []
  try {
    const list = await call('/models')
    const scopes = /missing scopes|insufficient permissions/i.test(list.body?.error?.message ?? '')
    if (list.status === 401 && !scopes)
      return remember('openai', key, {
        items: [{ label: 'Valid key', ok: false }],
        problem: 'OpenAI doesn’t accept this key: it may be mistyped, revoked or from another project.',
        rejected: true,
      })
    result.items.push({ label: 'Valid key', ok: true })
    result.items.push({ label: 'Models (Read)', ok: list.status === 200, why: 'Lets Codex see which models the key may use.' })
    models = list.body?.data?.map((m) => m.id) ?? []
  } catch {
    return { items: [], problem: 'OpenAI couldn’t be reached. Check the internet connection and try again.' }
  }
  // The cheapest model the key lists for the request; Codex's own choice when it's set.
  const model =
    getSettings().codexModel ||
    models
      .filter((id) => /^gpt-[\d.]+-mini$/.test(id))
      .sort()
      .pop() ||
    models.find((id) => /mini/.test(id)) ||
    'gpt-5-mini'
  const r = await call('/responses', { method: 'POST', body: JSON.stringify({ model, input: '.', max_output_tokens: 16 }) }).catch(() => null)
  const message = r?.body?.error?.message ?? ''
  if (!r) result.items.push({ label: 'Model requests', ok: false })
  else if (r.status === 200 || r.status === 404) result.items.push({ label: 'Model requests', ok: true, why: 'It can ask models for answers (Responses).' })
  else if (/missing scopes|insufficient permissions/i.test(message) || r.status === 403)
    result.items.push({ label: 'Model requests', ok: false, why: 'Switch on Model capabilities (Responses) for the key.' })
  else if (r.status === 429 && r.body?.error?.code !== 'insufficient_quota')
    result.items.push({ label: 'Model requests', ok: true, why: 'Rate-limited right now, but allowed.' })
  else {
    result.items.push({ label: 'Model requests', ok: false })
    // e.g. 429 insufficient_quota: "You exceeded your current quota, please check your plan and billing details."
    result.problem = `OpenAI: ${sentence(message || `HTTP ${r.status}`)}`
  }
  return remember('openai', key, result)
}

function remember(name: string, key: string, result: KeyCheck): KeyCheck {
  cache.set(name, { key, result })
  return result
}

/** Throws, saying what to change, when the key can't be used at all; returns what the check found. */
export async function keyUsable(name: 'anthropic' | 'openai', key: string): Promise<KeyCheck> {
  const check = name === 'anthropic' ? await checkAnthropicKey(key, true) : await checkOpenAIKey(key, true)
  if (check.rejected) throw new Error(check.problem)
  const missing = check.items.filter((i) => !i.ok && /Requests|Model requests/.test(i.label))
  if (missing.length && !check.problem)
    throw new Error(
      name === 'anthropic'
        ? 'This key may not send messages: its workspace restricts it. Use a key from a workspace that allows the Messages API.'
        : 'This key is missing Model capabilities (Responses). Edit it at platform.openai.com → API keys, switch it on, and save it here again.',
    )
  return check
}
