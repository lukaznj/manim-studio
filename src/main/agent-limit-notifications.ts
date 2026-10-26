import { Notification } from 'electron'
import type { AgentLimitEvent, AgentRoute } from '../shared/types'
import { UsageLimitAlerts, usageLimitFromError } from '../shared/usage-limit'
import { getSettings } from './settings'
import { formatUi, translateUi } from '../shared/i18n'
import { uiLocale } from '../shared/ui-languages'

const alerts = new UsageLimitAlerts()
const notifications = new Set<Notification>()
let emit: (event: AgentLimitEvent) => boolean = () => false
let showWindow: () => void = () => {}

export function onAgentLimit(send: typeof emit, show: typeof showWindow): void {
  emit = send
  showWindow = show
}

/** Called on actual turn outcomes, not polling. No notification text contains raw provider errors. */
export function reportAgentOutcome(route: AgentRoute, result: { ok: boolean; error?: string; limitedUntil?: number }): void {
  const key = `${route.agent}:${route.auth}`
  if (result.ok) {
    alerts.recovered(key)
    return
  }
  const limit = result.limitedUntil !== undefined ? { until: result.limitedUntil } : usageLimitFromError(result.error)
  if (!limit || !alerts.enter(key, limit.until)) return
  const renderer = emit({ agent: route.agent, until: limit.until })
  if (!Notification.isSupported()) return
  const settings = getSettings()
  const language = settings.uiLanguage ?? 'en'
  const name = { claude: 'Claude', codex: 'Codex', antigravity: 'Antigravity' }[route.agent]
  const when = limit.until ? new Date(limit.until).toLocaleString(uiLocale(language), { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : ''
  const title = formatUi(language, '{0} reached its usage limit', [name])
  const body = (when ? formatUi(language, 'The limit resets {0}.', [when]) + ' ' : '') +
    translateUi(language, 'Open Manim Studio to continue with another connected agent, or wait for the limit to reset.')
  try {
    const notification = new Notification({
      title, body,
      // The renderer plays our attention cue at the chosen volume. With no window, use the OS cue.
      silent: renderer || settings.sounds === false || (settings.soundVolume ?? 50) <= 0,
    })
    notifications.add(notification)
    notification.on('click', showWindow)
    notification.on('close', () => notifications.delete(notification))
    notification.on('failed', () => notifications.delete(notification))
    notification.show()
  } catch {
    // Disabled or unavailable OS notifications must never interrupt the waiting job.
  }
}
