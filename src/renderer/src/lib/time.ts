export function timecode(t: number, withMs = true): string {
  const s = Math.max(0, t)
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const cs = Math.floor((s * 100) % 100)
  const base = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return withMs ? `${base}.${String(cs).padStart(2, '0')}` : base
}

export function seconds(t: number): string {
  return `${t.toFixed(t < 10 ? 1 : 0)} s`
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function ago(ms: number): string {
  const diff = (ms - Date.now()) / 1000
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [unit, size] of units) if (Math.abs(diff) >= size) return rtf.format(Math.round(diff / size), unit)
  return 'just now'
}

export async function sha1(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** When a plan limit resets: "at 18:40" today, otherwise "Mon 09:00". */
export function resetTime(iso: string, language: 'en' | 'hr' = 'en'): string {
  const d = new Date(iso)
  const locale = language === 'hr' ? 'hr-HR' : 'en-GB'
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === new Date().toDateString()
    ? `${language === 'hr' ? 'u' : 'at'} ${time}`
    : `${d.toLocaleDateString(locale, { weekday: 'short' })} ${time}`
}
