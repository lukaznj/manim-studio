import { t as uiText, format, currentLocale } from '../lib/i18n'
import { Receipt } from 'lucide-react'
import { useEffect, useState } from 'react'
import { apiEstimateOf, costOf, modelName, usageTotals, type ModelTokens, type UsageEntry } from '../../../shared/usage'
import { api } from '../lib/api'
import { closeDialog, openDialog, useStore } from '../store'
import { Modal } from './ui'
import { AccountPlanUsage } from './AccountPlanUsage'
import { configuredAuth } from './LimitSwitch'

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

/** Recorded project tokens; prices only for a verified, fully priced API-key history. */
export function ProjectUsage() {
  const project = useStore((s) => s.project?.path)
  const [entries, setEntries] = useState<UsageEntry[]>([])
  useEffect(() => {
    let active = true
    setEntries([])
    const load = () => void api.projectUsage().then((usage) => active && setEntries(usage))
    load()
    const off = api.on('chat', (e) => e.type === 'done' && load())
    return () => { active = false; off() }
  }, [project])
  const total = usageTotals(entries)
  const count = sum(total, 'input') + sum(total, 'cacheRead') + sum(total, 'cacheWrite') + sum(total, 'output')
  const estimate = apiEstimateOf(entries)
  const showCost = estimate !== null
  if (!entries.length) return null
  return (
    <button
      className="usage-chip"
      title={uiText(showCost ? 'API-equivalent estimate, not subscription charges or an invoice.' : 'Recorded tokens for this video. Open the usage breakdown.')}
      onClick={() => openDialog({ kind: 'usage' })}
    >
      <Receipt /> {showCost ? dollars(estimate ?? costOf(total)) : format('{0} tokens', [tokens(count)])}
    </button>
  )
}

/** Where a video's usage went: by model (which one ran), by step (script, video, fixes, chat) and turn by turn. */
export function UsageDialog() {
  const open = useStore((s) => s.dialog?.kind === 'usage')
  const settings = useStore((s) => s.settings)
  const [log, setLog] = useState<UsageEntry[]>([])
  useEffect(() => {
    if (open) void api.projectUsage().then(setLog)
  }, [open])

  const totals = usageTotals(log)
  const total = costOf(totals)
  const showCosts = apiEstimateOf(log) !== null
  const tokenCount = (models: Record<string, ModelTokens>) => sum(models, 'input') + sum(models, 'cacheRead') + sum(models, 'cacheWrite') + sum(models, 'output')
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
        {settings && <AccountPlanUsage agent={settings.agent} auth={configuredAuth(settings, settings.agent)} />}
        {!log.length ? (
          <p className="muted">{uiText('No agent turns recorded yet. Every turn from now on is (chat, quick mode and series).')}</p>
        ) : (
          <>
            <p className="muted">
              {format('{0} tokens across {1} recorded turns.', [tokens(tokenCount(totals)), log.length])}
              {showCosts && <> {dollars(total)} · {uiText('API-equivalent estimate, not subscription charges or an invoice.')}</>}
            </p>
            <table className="usage-table">
              <thead>
                <tr>
                  <th>{uiText('Model')}</th>
                  <th>{uiText('Input')}</th>
                  <th>{uiText('Cache reads')}</th>
                  <th>{uiText('Cache writes')}</th>
                  <th>{uiText('Output')}</th>
                  {showCosts && <th>{uiText('API estimate')}</th>}
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
                    {showCosts && <td className="mono">{log.some((entry) => entry.costKnown !== false && entry.models[model]) ? dollars(n.costUSD) : '—'}</td>}
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
                  <th>{uiText('Tokens')}</th>
                  {showCosts && <th>{uiText('API estimate')}</th>}
                </tr>
              </thead>
              <tbody>
                {[...steps]
                  .map(([step, entries]) => ({ step, entries, count: entries.reduce((s, e) => s + tokenCount(e.models), 0), cost: entries.reduce((s, e) => s + costOf(e.models), 0) }))
                  .sort((a, b) => b.count - a.count)
                  .map(({ step, entries, count, cost }) => (
                    <tr key={step}>
                      <td>{step}</td>
                      <td className="mono">{entries.length}</td>
                      <td className="faint">
                        {tools(
                          entries.reduce<Record<string, number>>((t, e) => (Object.entries(e.tools).forEach(([k, n]) => (t[k] = (t[k] ?? 0) + n)), t), {}),
                        )}
                      </td>
                      <td className="mono">{tokens(count)}</td>
                      {showCosts && <td className="mono">{entries.some((entry) => entry.costKnown !== false) ? dollars(cost) : '—'}</td>}
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
                        {new Date(e.at).toLocaleString(currentLocale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td>{e.step}</td>
                      <td className="faint">{Object.keys(e.models).map(modelName).join(', ')}</td>
                      <td className="faint mono">
                        {tokens(sum(e.models, 'cacheRead') + sum(e.models, 'input') + sum(e.models, 'cacheWrite'))} {uiText(" in · ")}
                        {tokens(sum(e.models, 'output'))} {uiText(" out")}
                      </td>
                      {showCosts && <td className="mono">{e.costKnown === false ? '—' : dollars(costOf(e.models))}</td>}
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
