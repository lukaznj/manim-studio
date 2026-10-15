// Claude's plan usage limits (5-hour and weekly), as the Agent SDK reports them (claude.ts).

export type Limit = { until: number; kind?: string } // until: ms since epoch, 0 when unknown

/** A rate_limit_event's info: a limit while Claude refuses, null once it's allowed again. */
export function limitFrom(info: { status: string; resetsAt?: number; rateLimitType?: string }): Limit | null {
  if (info.status !== 'rejected') return null
  const at = info.resetsAt ?? 0
  return { until: at && at < 1e12 ? at * 1000 : at, kind: info.rateLimitType } // the CLI sends seconds
}

/** The CLI's older form, a result text "Claude AI usage limit reached|<seconds>". */
export function limitFromText(text: string): Limit | null {
  const m = /usage limit reached\|(\d+)/i.exec(text)
  return m ? { until: Number(m[1]) * 1000 } : null
}

/** "You’ve reached your Claude 5-hour usage limit. It resets at 14:30." */
export function limitText(l: Limit, now = new Date()): string {
  const kind = l.kind === 'five_hour' ? '5-hour ' : l.kind?.startsWith('seven_day') ? 'weekly ' : ''
  const at = new Date(l.until)
  const time = at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const when = !l.until
    ? 'Try again later.'
    : at.toDateString() === now.toDateString()
      ? `It resets at ${time}.`
      : `It resets ${at.toLocaleDateString([], { weekday: 'long' })} at ${time}.`
  return `You’ve reached your Claude ${kind}usage limit. ${when}`
}
