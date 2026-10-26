import { useEffect, useState } from 'react'
import type { Agent, ClaudeAuth, PlanUsage } from '../../../shared/types'
import { api } from '../lib/api'
import { t, format, currentLanguage } from '../lib/i18n'
import { resetTime } from '../lib/time'

/** Overall account utilization, never presented as the percentage spent on one video. */
export function AccountPlanUsage({ agent, auth = 'account' }: { agent: Agent; auth?: ClaudeAuth }) {
  const [reading, setReading] = useState<{ agent: Agent; usage: PlanUsage | null } | null>(null)
  useEffect(() => {
    let active = true
    if (auth === 'api-key') return
    const refresh = () => void api.agentPlanUsage(agent, auth).then(
      (usage) => active && setReading({ agent, usage }),
      () => active && setReading({ agent, usage: null }),
    )
    refresh()
    const timer = setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [agent, auth])
  if (auth === 'api-key') return null
  const usage = reading?.agent === agent ? reading.usage : null
  const name = agent === 'claude' ? 'Claude' : agent === 'codex' ? 'Codex' : 'Antigravity'
  return (
    <div className="plan-usage account-plan-usage">
      <div className="eyebrow">{format('{0} account usage · shared with other apps', [name])}</div>
      {usage?.windows.length ? usage.windows.map((window) => (
        <div className="plan-usage-row" key={window.label}>
          <span>{window.label.split(' · ').map(t).join(' · ')}</span>
          <span className="usage-bar"><span style={{ width: `${Math.max(0, Math.min(100, window.percent))}%` }} /></span>
          <span className="mono">{format('{0}% used', [Math.round(window.percent)])}</span>
          <span className="hint">{window.resetsAt ? format('resets {0}', [resetTime(window.resetsAt, currentLanguage())]) : ''}</span>
        </div>
      )) : <p className="hint">{t(reading?.agent === agent ? 'Plan usage is unavailable from this provider.' : 'Checking plan usage…')}</p>}
      <p className="hint">{t('These are account-wide limits, not usage attributed to this video or series.')}</p>
    </div>
  )
}
