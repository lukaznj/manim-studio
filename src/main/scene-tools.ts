// Handlers for the scene tools in src/shared/studio-tools.ts, shared by the in-app chat
// (claude.ts) and Claude Desktop (mcp.ts). They work on the open project.
import { readFileSync } from 'node:fs'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { Timeline } from '../shared/types'
import { readTimeline, requireProject } from './projects'
import { currentOrNewRender, framesBase64, type RenderOutcome } from './render'
import { requireSource, sourcePageCount, sourcePages, sourceText } from './sources'

export const textResult = (text: string, isError = false): CallToolResult => ({ content: [{ type: 'text', text }], ...(isError ? { isError } : {}) })

/** Waits for the render; with `maxWaitMs`, gives up waiting (not rendering) so a caller with a tool timeout gets an answer. */
export async function renderPreview(maxWaitMs?: number): Promise<CallToolResult> {
  const render = currentOrNewRender()
  const outcome = maxWaitMs ? await Promise.race([render, new Promise<null>((r) => setTimeout(() => r(null), maxWaitMs))]) : await render
  if (!outcome) return textResult('Still rendering (the first render after an install or update takes up to a minute). Call render_preview again for the result.')
  return textResult(describeOutcome(outcome))
}

export function getTimeline(): CallToolResult {
  const t = readTimeline(requireProject().path)
  return textResult(t ? describeTimeline(t) : 'No successful render yet.')
}

export async function viewFrames(times: number[]): Promise<CallToolResult> {
  if (!readTimeline(requireProject().path)) return textResult('Nothing rendered yet; call render_preview.')
  const images = await framesBase64(times, 854)
  return {
    content: images.flatMap((data, i) => [
      { type: 'text' as const, text: `Frame at ${times[i].toFixed(2)} s:` },
      { type: 'image' as const, data, mimeType: 'image/png' },
    ]),
  }
}

export async function readSource(source: string, from?: number, to?: number): Promise<CallToolResult> {
  try {
    return textResult(await sourceText(source, from, to))
  } catch (e) {
    return textResult((e as Error).message, true)
  }
}

/** Pages as pictures, about the size Claude reads a page at (the API scales larger ones down anyway). */
export async function viewSourcePages(source: string, pages: number[]): Promise<CallToolResult> {
  try {
    const name = requireSource(source)
    const count = await sourcePageCount(name)
    const missing = pages.filter((n) => n > count)
    const files = await sourcePages(name, pages, 1100)
    if (!files.length) return textResult(`${name} has ${count} pages; there is no page ${missing.join(', ')}.`, true)
    return {
      content: [
        ...(missing.length ? [{ type: 'text' as const, text: `${name} has ${count} pages; skipped page ${missing.join(', ')}.` }] : []),
        ...files.flatMap((file) => [
          { type: 'text' as const, text: `${name}, page ${file.match(/page-(\d+)-\d+\.png$/)?.[1]}:` },
          { type: 'image' as const, data: readFileSync(file).toString('base64'), mimeType: 'image/png' },
        ]),
      ],
    }
  } catch (e) {
    return textResult((e as Error).message, true)
  }
}

function describeOutcome(o: RenderOutcome): string {
  if ('cancelled' in o) return 'The render was cancelled (a newer change started another one). Call render_preview again.'
  if ('error' in o) {
    const tb = o.error.traceback.split('\n').slice(-25).join('\n')
    return `Render FAILED${o.error.line ? ` (scene.py line ${o.error.line})` : ''}: ${o.error.message}\n\n${tb}`
  }
  return 'Render succeeded.\n' + describeTimeline(o.timeline)
}

export function describeTimeline(t: Timeline): string {
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
