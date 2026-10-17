import { t as uiText } from '../lib/i18n'
import { Receipt } from 'lucide-react'
import { useEffect, useState } from 'react'
import { costOf, modelName, usageTotals, type ModelTokens, type UsageEntry } from '../../../shared/usage'
import { api } from '../lib/api'
import { closeDialog, openDialog, useStore } from '../store'
import { Modal } from './ui'

const dollars = (n: number) => `$${n < 10 ? n.toFixed(2) : n.toFixed(0)}`
const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n))
const sum = (models: Record<string, ModelTokens>, k: keyof ModelTokens) => Object.values(models).reduce((s, n) => s + n[k], 0)

const TOOL: Record<string, string> = {
  mcp__studio__render_preview: 'renders',
  mcp__studio__view_frames: 'frame looks',
  mcp__studio__view_source_pages: 'PDF page looks',
  mcp__studio__read_source: 'PDF reads',
  mcp__studio__get_timeline: 'timeline reads',
  Read: 'file reads',
  Edit: 'edits',
  Write: 'writes',
  Grep: 'searches',
  Glob: 'searches',
  WebSearch: 'web searches',
  WebFetch: 'web pages',
}

/** The project's agent turns in the chat's header: what this video cost so far. Opens the breakdown. */
export function ProjectCost() {
  const project = useStore((s) => s.project?.path)
  const [cost, setCost] = useState(0)
  useEffect(() => {
    const load = () => void api.projectUsage().then((u) => setCost(u.reduce((s, e) => s + costOf(e.models), 0)))
    load()
    return api.on('chat', (e) => e.type === 'done' && load())
  }, [project])
  if (!cost) return null
  return (
    <button
      className="usage-chip"
      title={uiText('What this video’s agent turns cost at API prices. Click for where it went.')}
      onClick={() => openDialog({ kind: 'usage' })}
    >
      <Receipt /> {dollars(cost)}
    </button>
  )
}

/** Where a video's usage went: by model (which one ran), by step (script, video, fixes, chat) and turn by turn. */
export function UsageDialog() {
  const open = useStore((s) => s.dialog?.kind === 'usage')
  const [log, setLog] = useState<UsageEntry[]>([])
  useEffect(() => {
    if (open) void api.projectUsage().then(setLog)
  }, [open])

  const totals = usageTotals(log)
  const total = costOf(totals)
  const steps = new Map<string, UsageEntry[]>()
  for (const e of log) steps.set(e.step, [...(steps.get(e.step) ?? []), e])
  const tools = (t: Record<string, number>) => {
    const named = new Map<string, number>()
    for (const [name, n] of Object.entries(t)) named.set(TOOL[name] ?? name, (named.get(TOOL[name] ?? name) ?? 0) + n)
    return [...named].map(([name, n]) => `${n} ${name}`).join(', ')
  }

  return (
    <Modal open={open} onClose={closeDialog} title={uiText('What this video used')} icon={<Receipt className="head-icon" />} width={720}>
      <div className="modal-body usage-dialog">
        {!log.length ? (
          <p className="muted">{uiText('No agent turns recorded yet. Every turn from now on is (chat, quick mode and series).')}</p>
        ) : (
          <>
            <p className="muted">
              {dollars(total)} {uiText(" at API prices over ")}
              {log.length}{' '}
              {uiText(
                " turns. On a Claude plan these tokens count against its limits instead of being billed; the proportions show where the usage went. Most of it is usually ",
              )}
              <strong>{uiText('cache reads')}</strong>
              {uiText(
                ': on every tool call the agent reads the whole conversation again, pictures of frames and PDF pages included, so long sessions with many renders and looks cost the most.',
              )}
            </p>
            <table className="usage-table">
              <thead>
                <tr>
                  <th>{uiText('Model')}</th>
                  <th>{uiText('Input')}</th>
                  <th>{uiText('Cache reads')}</th>
                  <th>{uiText('Cache writes')}</th>
                  <th>{uiText('Output')}</th>
                  <th>{uiText('Cost')}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(totals).map(([model, n]) => (
                  <tr key={model}>
                    <td>{modelName(model)}</td>
                    <td className="mono">{tokens(n.input)}</td>
                    <td className="mono">{tokens(n.cacheRead)}</td>
                    <td className="mono">{tokens(n.cacheWrite)}</td>
                    <td className="mono">{tokens(n.output)}</td>
                    <td className="mono">{dollars(n.costUSD)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3>{uiText('By step')}</h3>
            <table className="usage-table">
              <thead>
                <tr>
                  <th>{uiText('Step')}</th>
                  <th>{uiText('Turns')}</th>
                  <th>{uiText('What the agent did')}</th>
                  <th>{uiText('Cost')}</th>
                  <th>{uiText('Share')}</th>
                </tr>
              </thead>
              <tbody>
                {[...steps]
                  .map(([step, entries]) => ({ step, entries, cost: entries.reduce((s, e) => s + costOf(e.models), 0) }))
                  .sort((a, b) => b.cost - a.cost)
                  .map(({ step, entries, cost }) => (
                    <tr key={step}>
                      <td>{step}</td>
                      <td className="mono">{entries.length}</td>
                      <td className="faint">
                        {tools(
                          entries.reduce<Record<string, number>>((t, e) => (Object.entries(e.tools).forEach(([k, n]) => (t[k] = (t[k] ?? 0) + n)), t), {}),
                        )}
                      </td>
                      <td className="mono">{dollars(cost)}</td>
                      <td>
                        <span className="usage-share">
                          <span style={{ width: `${total ? (cost / total) * 100 : 0}%` }} />
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>

            <details className="usage-turns">
              <summary>{uiText('Every turn')}</summary>
              <table className="usage-table">
                <tbody>
                  {[...log].reverse().map((e, i) => (
                    <tr key={i}>
                      <td className="faint mono">
                        {new Date(e.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td>{e.step}</td>
                      <td className="faint">{Object.keys(e.models).map(modelName).join(', ')}</td>
                      <td className="faint mono">
                        {tokens(sum(e.models, 'cacheRead') + sum(e.models, 'input') + sum(e.models, 'cacheWrite'))} {uiText(" in · ")}
                        {tokens(sum(e.models, 'output'))} {uiText(" out")}
                      </td>
                      <td className="mono">{dollars(costOf(e.models))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
      </div>
    </Modal>
  )
}
