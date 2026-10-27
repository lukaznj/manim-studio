import { ArrowDown, ArrowUp, Check, ChevronDown, CreditCard, Gauge, KeyRound, Plus, RefreshCw, Settings2, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import type { FallbackModelOption, ModelRoute, PlanUsage } from '../../../shared/types'
import { modelRouteKey, modelUsagePercent, normalizeModelOrder } from '../../../shared/model-fallback'
import { defaultAgentSelection } from '../../../shared/agent-selection'
import { studyModel } from '../../../shared/study-assistant'
import { modelName } from '../../../shared/usage'
import { api } from '../lib/api'
import { format, t } from '../lib/i18n'
import { resetTime } from '../lib/time'
import { errorText, openDialog, refreshUsage, toast, updateSettings, useStore } from '../store'

const names = { claude: 'Claude', codex: 'Codex', antigravity: 'Antigravity' }
const method = (route: ModelRoute) => route.auth === 'api-key' ? t('API key') : route.agent === 'codex' ? 'ChatGPT' : t('Account')
const effortName = { low: 'Low effort', medium: 'Medium effort', high: 'High effort', xhigh: 'Extra high effort', max: 'Maximum effort' }
export function useChatRoute(): ModelRoute {
  const settings = useStore((s) => s.settings)!
  const selected = useStore((s) => s.chatRoute)
  const studying = useStore((s) => s.screen === 'study')
  const agent = settings?.agent ?? 'claude'
  const auth = agent === 'claude' ? settings?.claudeAuth ?? 'account' : agent === 'codex' ? settings?.codexAuth ?? (settings?.hasOpenAIKey ? 'api-key' : 'account') : settings?.antigravityAuth ?? (settings?.hasGeminiKey ? 'api-key' : 'account')
  return normalizeModelOrder([selected ?? { ...defaultAgentSelection(settings, agent), ...(studying ? studyModel(settings) : {}), auth }])[0]
}

function place(event: React.MouseEvent<HTMLButtonElement>, ref: RefObject<HTMLDivElement | null>, width = 330) {
  const rect = event.currentTarget.getBoundingClientRect()
  if (ref.current) {
    ref.current.style.left = `${Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))}px`
    ref.current.style.bottom = `${window.innerHeight - rect.top + 10}px`
  }
}

/** A per-episode model choice and provider-reported allowance; popovers remain usable in fullscreen. */
export function ChatRouting() {
  const route = useChatRoute()
  const key = modelRouteKey(route)
  const busy = useStore((s) => s.chatBusy)
  const usage = useStore((s) => s.usage)
  const policy = useStore((s) => s.settings?.modelFallback?.enabled)
  const [options, setOptions] = useState<FallbackModelOption[]>([])
  const [readings, setReadings] = useState<Partial<Record<ModelRoute['agent'], PlanUsage | null>>>({})
  const [loading, setLoading] = useState(false)
  const [switching, setSwitching] = useState(false)
  const pickerId = useId(), usageId = useId()
  const picker = useRef<HTMLDivElement>(null), details = useRef<HTMLDivElement>(null)
  const refresh = async () => {
    setLoading(true)
    try {
      const list = await api.fallbackModels()
      setOptions(list)
      const agents = [...new Set([...list.filter((o) => o.route.auth === 'account').map((o) => o.route.agent), ...(route.auth === 'account' ? [route.agent] : [])])]
      const rows = await Promise.all(agents.map(async (agent) => [agent, await api.agentPlanUsage(agent, 'account').catch(() => null)] as const))
      setReadings(Object.fromEntries(rows))
    } catch (error) { toast(errorText(error), 'error') }
    finally { setLoading(false) }
    void refreshUsage(true)
  }
  useEffect(() => { if (!busy) void refresh() }, [busy, key])
  const current = route.auth === 'account' ? readings[route.agent] ?? (usage?.agent === route.agent ? usage : null) : null
  const percent = modelUsagePercent(route, current)
  const bounded = Math.max(0, Math.min(100, percent ?? 0))
  const select = async (next: ModelRoute) => {
    setSwitching(true)
    try {
      await api.chatSelectModel(next)
      picker.current?.hidePopover()
    } catch (error) { toast(errorText(error), 'error') }
    finally { setSwitching(false) }
  }
  return <div className="chat-routing">
    <button className="chat-model-trigger" disabled={busy || switching} popoverTarget={pickerId} onClick={(e) => { place(e, picker); void refresh() }} title={t('Switch chat model')}>
      <span>{modelName(route.model) || names[route.agent]}</span><ChevronDown />
    </button>
    <button className={`chat-usage-circle ${percent !== null && percent >= 90 ? 'hot' : percent !== null && percent >= 70 ? 'warm' : ''} ${percent === null ? 'unknown' : ''}`} popoverTarget={usageId} onClick={(e) => { place(e, details); void refresh() }}
      aria-label={percent === null ? t('Plan usage') : format('Plan usage: {0}% used', [Math.round(percent)])} title={percent === null ? t('Plan usage') : format('{0}% used', [Math.round(percent)])}>
      <svg viewBox="0 0 32 32" aria-hidden="true"><circle className="usage-circle-track" cx="16" cy="16" r="12" /><circle className="usage-circle-fill" cx="16" cy="16" r="12" pathLength="100" strokeDasharray={`${bounded} 100`} /></svg>
      {percent === null && (route.auth === 'api-key' ? <KeyRound /> : <Gauge />)}
    </button>
    <div ref={picker} id={pickerId} popover="auto" className="chat-routing-popover">
      <header><div><span className="eyebrow">{t('This conversation')}</span><h4>{t('Choose a model')}</h4></div><Sparkles /></header>
      <p className="hint">{t('Your conversation stays with this episode when you switch.')}</p>
      {options.map((option) => {
        const selected = modelRouteKey(option.route) === key
        const reading = option.route.auth === 'account' ? readings[option.route.agent] : null
        const used = modelUsagePercent(option.route, reading)
        return <button key={modelRouteKey(option.route)} className={`chat-route-option ${selected ? 'selected' : ''}`} disabled={busy || switching} onClick={() => void select({ ...option.route, effort: option.efforts.includes(route.effort!) ? route.effort : option.route.effort })}>
          <span className="route-provider-icon">{option.route.auth === 'api-key' ? <KeyRound /> : <Sparkles />}</span><span><strong>{option.label}</strong><small>{names[option.route.agent]} · {method(option.route)}</small></span>
          <span className="route-option-end">{used !== null && <small>{format('{0}% left', [Math.max(0, Math.round(100 - used))])}</small>}{selected && <Check />}</span>
        </button>
      })}
      {!options.length && <p className="hint">{t(loading ? 'Checking account…' : 'Connect this agent under Accounts first.')}</p>}
      <footer><button className="link-btn" onClick={() => { picker.current?.hidePopover(); openDialog({ kind: 'settings', tab: 'account' }) }}><Settings2 />{t('Model and effort settings')}</button><span>{t(policy ? 'Automatic switching on' : 'Automatic switching off')}</span></footer>
    </div>
    <div ref={details} id={usageId} popover="auto" className="chat-routing-popover chat-allowances">
      <header><div><span className="eyebrow">{t('Account usage')}</span><h4>{t('Plan limits')}</h4></div><button className="icon-btn" disabled={loading} aria-label={t('Refresh usage')} onClick={() => void refresh()}><RefreshCw className={loading ? 'spin' : ''} /></button></header>
      <p className="hint">{t('Shared with your other apps. Percentages come from the provider.')}</p>
      {route.auth === 'api-key' && <section><h5><KeyRound />{names[route.agent]} · {t('API key')}</h5><p className="hint">{t('API keys are billed separately and have no subscription allowance.')}</p></section>}
      {[...new Set([...(route.auth === 'account' ? [route.agent] : []), ...options.filter((o) => o.route.auth === 'account').map((o) => o.route.agent)])].map((agent) => <section key={agent}>
        <h5><CreditCard />{names[agent]}{agent === route.agent && route.auth === 'account' && <span>{t('In use')}</span>}</h5>
        {readings[agent]?.windows.length ? readings[agent]!.windows.map((window, i) => <div key={`${window.label}-${i}`} className="chat-allowance-window">
          <div><span>{window.label.split(' · ').map(t).join(' · ')}</span><strong>{format('{0}% used', [Math.round(window.percent)])}</strong></div>
          <progress className={window.percent >= 90 ? 'hot' : ''} value={Math.max(0, Math.min(100, window.percent))} max="100" />
          {window.resetsAt && <small>{format('resets {0}', [resetTime(window.resetsAt)])}</small>}
        </div>) : <p className="hint">{t(loading ? 'Checking account…' : 'This agent does not currently report plan usage. A missing reading does not mean zero usage.')}</p>}
      </section>)}
      <footer><button className="link-btn" onClick={() => { details.current?.hidePopover(); openDialog({ kind: 'usage' }) }}><Gauge />{t('Usage')}</button><button className="link-btn" onClick={() => { details.current?.hidePopover(); openDialog({ kind: 'settings', tab: 'account' }) }}><Settings2 />{t('Automatic switching')}</button></footer>
    </div>
  </div>
}

export function FallbackSettings() {
  const policy = useStore((s) => s.settings?.modelFallback)
  const [options, setOptions] = useState<FallbackModelOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const order = policy?.order ?? []
  useEffect(() => { let active = true; void api.fallbackModels().then((value) => { if (active) setOptions(value) }, (e) => { if (active) setError(errorText(e)) }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [])
  const save = (next: ModelRoute[], enabled = policy?.enabled ?? false) => void updateSettings({ modelFallback: { enabled, order: next } })
  const remaining = options.filter((o) => !order.some((route) => modelRouteKey(route) === modelRouteKey(o.route)))
  const move = (index: number, by: number) => { const next = [...order]; [next[index], next[index + by]] = [next[index + by], next[index]]; save(next) }
  return <section className="model-fallback-settings">
    <div className="fallback-settings-head"><div><h3>{t('Automatic switching')}</h3><p className="hint">{t('When a usage limit stops work, continue with the next available model in this order. Applies to chat, planning and video creation.')}</p></div><input type="checkbox" role="switch" aria-label={t('Automatic switching')} checked={!!policy?.enabled} disabled={!order.length} onChange={(e) => save(order, e.target.checked)} /></div>
    <p className="hint">{t('Models on the same account may share limits. Studio skips an exhausted shared allowance until it resets. API keys are used only if you add them here.')}</p>
    <ol className="fallback-model-order">{order.map((route, index) => {
      const option = options.find((o) => modelRouteKey(o.route) === modelRouteKey(route))
      return <li key={modelRouteKey(route)}><span className="fallback-position">{index + 1}</span><div><strong>{option?.label ?? modelName(route.model)}</strong><small>{names[route.agent]} · {method(route)}{!option && !loading ? ` · ${t('Unavailable')}` : ''}</small></div>
        {!!option?.efforts.length && <select className="input" aria-label={format('Effort for {0}', [option.label])} value={route.effort ?? 'high'} onChange={(e) => save(order.map((r, i) => i === index ? { ...r, effort: e.target.value as ModelRoute['effort'] } : r))}>{option.efforts.map((effort) => <option key={effort} value={effort}>{t(effortName[effort])}</option>)}</select>}
        <button className="icon-btn" disabled={index === 0} aria-label={t('Move earlier')} onClick={() => move(index, -1)}><ArrowUp /></button><button className="icon-btn" disabled={index === order.length - 1} aria-label={t('Move later')} onClick={() => move(index, 1)}><ArrowDown /></button><button className="icon-btn" aria-label={t('Remove model')} onClick={() => { const next = order.filter((_, i) => i !== index); save(next, next.length ? policy?.enabled : false) }}><Trash2 /></button>
      </li>
    })}</ol>
    <label className="fallback-model-add"><Plus /><select className="input" aria-label={t('Add model to switching order')} value="" disabled={loading || !remaining.length} onChange={(e) => { const option = remaining.find((o) => modelRouteKey(o.route) === e.target.value); if (option) save([...order, option.route]) }}><option value="">{t(loading ? 'Checking account…' : 'Add a connected model…')}</option>{remaining.map((option) => <option value={modelRouteKey(option.route)} key={modelRouteKey(option.route)}>{option.label} · {names[option.route.agent]} · {method(option.route)}</option>)}</select></label>
    {error && <p className="hint">{error}</p>}
    {!order.length && <p className="hint">{t('Add models, then turn on automatic switching.')}</p>}
  </section>
}
