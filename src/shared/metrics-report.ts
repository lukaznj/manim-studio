import type { EpisodeMetrics, VoiceUsageSample } from './episode-metrics'
import type { UsageEntry } from './usage'

export interface ReportEpisode {
  metrics: EpisodeMetrics
  usage: UsageEntry[]
  voice: VoiceUsageSample[]
}
export const escapeHtml = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const number = (n: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(n)
const duration = (ms: number) => `${Math.floor(Math.round(ms / 1000) / 60)}m ${Math.round(ms / 1000) % 60}s`
const palette = ['#e5b94f', '#76b7ff', '#7dd3ad', '#c4a1ff', '#ffad85', '#69d4d4']
const activeTime = (m: EpisodeMetrics) =>
  phaseDurations(m)
    .filter((p) => !['Paused', 'Stopped', 'Metrics setup', 'Metrics finalization'].includes(p.name))
    .reduce((sum, p) => sum + p.ms, 0)
interface Point {
  at: number
  value?: number
}

export function phaseDurations(m: EpisodeMetrics): { name: string; ms: number }[] {
  const totals = new Map<string, number>()
  for (const [i, phase] of m.phases.entries())
    totals.set(phase.name, (totals.get(phase.name) ?? 0) + Math.max(0, (m.phases[i + 1]?.at ?? m.finishedAt ?? phase.at) - phase.at))
  return [...totals].map(([name, ms]) => ({ name, ms }))
}

export function usageTokenCount(entry: UsageEntry): number {
  if (entry.providerUsage) {
    if (Number.isFinite(entry.providerUsage.total_tokens)) return entry.providerUsage.total_tokens
    return (entry.providerUsage.input_tokens ?? 0) + (entry.providerUsage.output_tokens ?? 0)
  }
  return Object.values(entry.models).reduce((sum, m) => sum + m.input + m.output + m.cacheRead + m.cacheWrite, 0)
}

/** Offline, script-free HTML. Turn usage is plotted as a step function, never an invented rate. */
export function renderMetricsReport(episodes: ReportEpisode[], title: string, language: 'en' | 'hr' = 'en'): string {
  const t = (en: string, hr: string) => (language === 'hr' ? hr : en)
  const stage = (name: string) =>
    language === 'hr'
      ? ((
          {
            Script: 'Scenarij',
            Implementation: 'Izrada',
            'Render check': 'Provjera prikaza',
            'Fixing render': 'Popravak prikaza',
            Export: 'Izvoz',
            Paused: 'Pauzirano',
            Stopped: 'Zaustavljeno',
            'Metrics setup': 'Priprema mjerenja',
            'Metrics finalization': 'Završetak mjerenja',
          } as Record<string, string>
        )[name] ?? name)
      : name
  const chart = (m: EpisodeMetrics, label: string, unit: string, series: { name: string; points: Point[]; step?: boolean }[]) => {
    const start = m.startedAt,
      end = Math.max(start + 1000, m.finishedAt ?? Date.now())
    const values = series.flatMap((s) => s.points.flatMap((p) => (p.value !== undefined && Number.isFinite(p.value) ? [p.value] : [])))
    if (!values.length)
      return `<div class="chart"><h3>${escapeHtml(label)}</h3><p class="muted">${t('No supported measurement was returned. Missing data is not zero.', 'Nema podržanih mjerenja. Nedostajući podaci nisu nula.')}</p></div>`
    const max = Math.max(unit === '%' ? 100 : 1, ...values) * (unit === '%' ? 1 : 1.08)
    const x = (at: number) => 58 + Math.max(0, Math.min(1, (at - start) / (end - start))) * 860
    const y = (v: number) => 212 - (Math.max(0, v) / max) * 166
    const bands = m.phases
      .map(
        (p, i) =>
          `<rect x="${x(p.at)}" y="30" width="${Math.max(0, x(m.phases[i + 1]?.at ?? end) - x(p.at))}" height="182" fill="${palette[i % palette.length]}" opacity=".055"/><line x1="${x(p.at)}" x2="${x(p.at)}" y1="30" y2="212" stroke="${palette[i % palette.length]}" opacity=".3"><title>${escapeHtml(stage(p.name))} · ${duration(p.at - start)}</title></line>`,
      )
      .join('')
    const grid = [0, 0.25, 0.5, 0.75, 1]
      .map(
        (v) =>
          `<line x1="58" x2="918" y1="${y(max * v)}" y2="${y(max * v)}" stroke="#8393a9" opacity=".15"/><text x="48" y="${y(max * v) + 4}" text-anchor="end">${number(max * v)}</text><text x="${58 + v * 860}" y="238" text-anchor="middle">${duration((end - start) * v)}</text>`,
      )
      .join('')
    const paths = series
      .map((s, i) => {
        let drawing = '',
          previous: Point | undefined
        for (const p of s.points) {
          if (p.value === undefined || !Number.isFinite(p.value)) {
            previous = undefined
            continue
          }
          drawing += !previous ? ` M${x(p.at)},${y(p.value)}` : s.step ? ` H${x(p.at)} V${y(p.value)}` : ` L${x(p.at)},${y(p.value)}`
          previous = p
        }
        return `<path d="${drawing}" stroke="${palette[i % palette.length]}" stroke-width="2" fill="none"/>${s.points
          .filter((p) => p.value !== undefined && Number.isFinite(p.value))
          .map(
            (p) =>
              `<circle cx="${x(p.at)}" cy="${y(p.value!)}" r="2.5" fill="${palette[i % palette.length]}"><title>${escapeHtml(s.name)} · ${duration(p.at - start)} · ${number(p.value!)} ${escapeHtml(unit)}</title></circle>`,
          )
          .join('')}`
      })
      .join('')
    return `<div class="chart"><h3>${escapeHtml(label)} <small>${escapeHtml(unit)}</small></h3><svg viewBox="0 0 960 252" role="img" aria-label="${escapeHtml(label)}"><title>${escapeHtml(label)}</title>${bands}${grid}${paths}</svg><div class="legend">${series.map((s, i) => `<span><i style="background:${palette[i % palette.length]}"></i>${escapeHtml(s.name)}</span>`).join('')}</div></div>`
  }
  const peak = (values: (number | undefined)[], unit: string) => {
    const valid = values.filter((n): n is number => n !== undefined && Number.isFinite(n))
    return valid.length ? `${number(Math.max(...valid))} ${unit}` : '—'
  }
  const comparison =
    episodes.length < 2
      ? ''
      : `<h2>${t('Episode comparison', 'Usporedba epizoda')}</h2><div style="overflow-x:auto"><table><thead><tr><th>${t('Episode / model', 'Epizoda / model')}</th><th>${t('Active time', 'Aktivno vrijeme')}</th><th>${t('Reported tokens', 'Prijavljeni tokeni')}</th><th>${t('Peak Studio RAM', 'Najveći RAM Studija')}</th><th>${t('Peak device GPU', 'Najveće GPU opterećenje')}</th></tr></thead><tbody>${episodes
          .map(
            ({ metrics: m, usage }, i) =>
              `<tr><td><a href="#episode-${i}">${escapeHtml(m.title)}</a><br><small>${escapeHtml(m.selection.agent)} · ${escapeHtml(m.selection.model)}${m.selection.effort ? ` · ${escapeHtml(m.selection.effort)}` : ''}</small></td><td>${m.options.timing ? duration(activeTime(m)) : '—'}</td><td>${m.options.usage && usage.length ? number(usage.reduce((n, e) => n + usageTokenCount(e), 0)) : '—'}</td><td>${
                m.options.resources
                  ? peak(
                      m.resources.map((p) => p.appRamMb),
                      'MiB',
                    )
                  : '—'
              }</td><td>${
                m.options.resources
                  ? peak(
                      m.resources.map((p) => p.gpuPercent),
                      '%',
                    )
                  : '—'
              }</td></tr>`,
          )
          .join('')}</tbody></table></div>`
  const sections = episodes
    .map(({ metrics: m, usage, voice }, index) => {
      const end = m.finishedAt ?? Date.now()
      const phases = phaseDurations(m)
      const active = activeTime(m)
      let tokenSum = 0,
        outputSum = 0,
        billed = 0,
        requested = 0
      const tokenPoints = usage.length
        ? [
            { at: m.startedAt, value: 0 },
            ...usage.map((entry) => ({ at: entry.at, value: (tokenSum += usageTokenCount(entry)) })),
            { at: end, value: usage.reduce((n, e) => n + usageTokenCount(e), 0) },
          ]
        : []
      const outputPoints = [
        { at: m.startedAt, value: 0 },
        ...usage.map((e) => ({ at: e.at, value: (outputSum += Object.values(e.models).reduce((n, v) => n + v.output, 0)) })),
      ]
      const voicePoints = voice.map((v) => ({ at: v.at, value: (billed += v.billedCharacters ?? 0) }))
      const requestedPoints = voice.map((v) => ({ at: v.at, value: (requested += v.success && !v.cached ? v.characters : 0) }))
      const windows = new Set(m.accounts.flatMap((a) => a.usage?.windows.map((w) => `${a.provider} / ${w.label}`) ?? []))
      const accountCharts = [...windows]
        .map((key) =>
          chart(m, key, '%', [
            {
              name: t('Account used', 'Korištenje računa'),
              step: true,
              points: m.accounts.map((a) => ({ at: a.at, value: a.usage?.windows.find((w) => `${a.provider} / ${w.label}` === key)?.percent })),
            },
          ]),
        )
        .join('')
      const elevenAccount = m.accounts.some((a) => a.elevenLabsCharacters !== undefined)
        ? chart(m, 'ElevenLabs account', 'characters', [
            { name: t('Account-wide', 'Cijeli račun'), step: true, points: m.accounts.map((a) => ({ at: a.at, value: a.elevenLabsCharacters })) },
          ])
        : ''
      const hardware = m.resources
      const notes = [
        ...new Set([...m.notes, ...hardware.flatMap((p) => p.unavailable ?? []), ...hardware.flatMap((p) => (p.gpuSource ? [`GPU: ${p.gpuSource}`] : []))]),
      ]
      return `<section class="episode" id="episode-${index}"><div class="eyebrow">${t('Episode', 'Epizoda')} ${index + 1} · ${escapeHtml(m.outcome ?? 'in progress')}</div><h2>${escapeHtml(m.title)}</h2><p class="muted">${escapeHtml(m.selection.agent)} · <strong>${escapeHtml(m.selection.model || 'provider default; exact model not reported')}</strong>${m.selection.effort ? ` · ${escapeHtml(m.selection.effort)}` : ''}</p>
      <div class="cards">${m.options.timing ? `<div><small>${t('Active time', 'Aktivno vrijeme')}</small><strong>${duration(active)}</strong></div><div><small>${t('Wall time including pauses', 'Ukupno vrijeme s pauzama')}</small><strong>${duration(end - m.startedAt)}</strong></div>` : ''}${m.options.usage ? `<div><small>${t('Reported agent tokens', 'Prijavljeni tokeni agenta')}</small><strong>${usage.length ? number(tokenPoints.at(-1)!.value) : t('Not reported', 'Nije prijavljeno')}</strong></div><div><small>${t('ElevenLabs billed characters', 'Naplaćeni ElevenLabs znakovi')}</small><strong>${voice.some((v) => !v.cached && v.billedCharacters === null) ? t('Incomplete', 'Nepotpuno') : number(billed)}</strong></div>` : ''}</div>
      <div class="phases">${m.phases.map((p, i) => `<span><i style="background:${palette[i % palette.length]}"></i>${duration(p.at - m.startedAt)} ${escapeHtml(stage(p.name))}</span>`).join('')}</div>
      ${m.options.timing ? `<h3>${t('Time by phase', 'Vrijeme po koraku')}</h3><table><thead><tr><th>${t('Phase', 'Korak')}</th><th>${t('Time', 'Vrijeme')}</th></tr></thead><tbody>${phases.map((p) => `<tr><td>${escapeHtml(stage(p.name))}</td><td>${duration(p.ms)}</td></tr>`).join('')}</tbody></table>` : ''}
      ${
        m.options.usage
          ? `<h3>${t('Usage over time', 'Korištenje kroz vrijeme')}</h3><p class="muted">${t('Agent counts arrive at turn completion. Steps show reported totals, not a continuous token rate. Failed or interrupted turns may omit counters. API-equivalent prices are not subscription charges.', 'Brojači agenta stižu po završetku koraka. Graf prikazuje prijavljene ukupne vrijednosti, a ne kontinuiranu brzinu tokena. Neuspjeli ili prekinuti koraci mogu izostaviti brojače. API cijene nisu trošak pretplate.')}</p>${chart(
              m,
              t('Agent tokens', 'Tokeni agenta'),
              'tokens',
              [
                { name: t('All reported tokens (including cache)', 'Svi prijavljeni tokeni (uključujući predmemoriju)'), points: tokenPoints, step: true },
                { name: t('Output', 'Izlaz'), points: usage.length ? outputPoints : [], step: true },
              ],
            )}
      ${chart(m, 'ElevenLabs', t('characters', 'znakovi'), [
        { name: t('Known billed character cost', 'Poznat naplaćeni trošak znakova'), points: [{ at: m.startedAt, value: 0 }, ...voicePoints], step: true },
        {
          name: t('Successful uncached text characters', 'Znakovi uspješnih zahtjeva bez predmemorije'),
          points: [{ at: m.startedAt, value: 0 }, ...requestedPoints],
          step: true,
        },
      ])}
      <p class="muted">${t('ElevenLabs billing uses the response character-cost header. Text length is shown separately and never treated as the bill. Cache hits cost zero new characters; missing billing headers remain unknown.', 'Naplata ElevenLabsa koristi zaglavlje odgovora character-cost. Duljina teksta prikazuje se zasebno i nije iznos računa. Predmemorija ne troši nove znakove; nedostajuća zaglavlja naplate ostaju nepoznata.')}</p>
      <h3>${t('Account plan windows', 'Ograničenja plana računa')}</h3><p class="muted">${t('Account-wide snapshots: other chats and apps can affect these percentages even with episodes serialized. Reset times and provider reporting delays can change the curve. These are not per-episode token counters.', 'Snimke cijelog računa: drugi razgovori i aplikacije mogu utjecati na postotke čak i kada epizode rade pojedinačno. Obnove ograničenja i kašnjenja pružatelja mijenjaju krivulju. Ovo nisu brojači tokena po epizodi.')}</p>${accountCharts || `<p>${t('Plan windows were not returned (API-key accounts and unsupported providers may have none).', 'Ograničenja plana nisu vraćena (API računi i nepodržani pružatelji možda ih nemaju).')}</p>`}${elevenAccount}
      <details><summary>${t('Agent turns and original provider counters', 'Koraci agenta i izvorni brojači pružatelja')}</summary><table><thead><tr><th>${t('Step', 'Korak')}</th><th>Model</th><th>Tokens</th><th>API USD</th></tr></thead><tbody>${usage.map((u) => `<tr><td>${escapeHtml(u.step)}</td><td>${escapeHtml(Object.keys(u.models).join(', '))}</td><td>${number(usageTokenCount(u))}</td><td>${u.costKnown === false ? t('Not reported', 'Nije prijavljeno') : number(Object.values(u.models).reduce((n, v) => n + v.costUSD, 0))}</td></tr>`).join('')}</tbody></table><pre>${escapeHtml(JSON.stringify({ usage, voice, accountSnapshots: m.accounts }, null, 2))}</pre></details>`
          : ''
      }
      ${
        m.options.resources
          ? `<h3>${t('Hardware over time', 'Hardver kroz vrijeme')}</h3><p class="muted">${t('Samples every ~5 seconds, including the Studio process tree (agents and Python workers). CPU is normalized to total logical CPU capacity. RAM is summed process RSS/working set; shared pages can be counted more than once. GPU and system counters are device-wide. Other applications and remote render servers are not attributable to this episode; remote hardware is not sampled. Short-lived peaks can be missed. Collection itself has overhead.', 'Uzorci približno svakih 5 sekundi uključuju stablo procesa Studija (agente i Python radnike). CPU je normaliziran na ukupan broj logičkih jezgri. RAM je zbroj radnih skupova procesa; dijeljene stranice mogu biti prebrojene više puta. GPU i sustavni brojači obuhvaćaju cijeli uređaj. Druge aplikacije i udaljeni poslužitelji ne mogu se pripisati epizodi; udaljeni hardver se ne mjeri. Kratki vrhunci mogu se propustiti. Mjerenje stvara dodatno opterećenje.')}</p>
      ${chart(m, 'CPU', '%', [
        { name: 'Studio + children', points: hardware.map((p) => ({ at: p.at, value: p.appCpuPercent })) },
        { name: t('Whole computer', 'Cijelo računalo'), points: hardware.map((p) => ({ at: p.at, value: p.systemCpuPercent })) },
      ])}
      ${chart(m, 'RAM', 'MiB', [
        { name: 'Studio + children', points: hardware.map((p) => ({ at: p.at, value: p.appRamMb })) },
        { name: t('Whole computer', 'Cijelo računalo'), points: hardware.map((p) => ({ at: p.at, value: p.systemRamMb })) },
      ])}
      ${chart(m, 'GPU', '%', [{ name: t('Device / busiest engine', 'Uređaj / najzauzetiji sklop'), points: hardware.map((p) => ({ at: p.at, value: p.gpuPercent })) }])}
      ${chart(m, t('GPU memory', 'GPU memorija'), 'MiB', [{ name: 'VRAM', points: hardware.map((p) => ({ at: p.at, value: p.gpuMemoryMb })) }])}`
          : ''
      }
      ${notes.length ? `<details open><summary>${t('Measurement notes', 'Napomene o mjerenju')}</summary><ul>${notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul></details>` : ''}</section>`
    })
    .join('')
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>${escapeHtml(title)}</title><style>
  *{box-sizing:border-box}body{margin:0;background:#0b1421;color:#e4edf8;font:15px/1.6 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:48px 28px}h1{font-size:34px;margin:8px 0}h2{font-size:27px;margin:8px 0}h3{margin:24px 0 12px}.muted,small{color:#9eafc6}a{color:#f0ce7b}.eyebrow{color:#e5b94f;letter-spacing:.1em;text-transform:uppercase;font-size:12px}.episode{margin-top:40px;padding-top:32px;border-top:1px solid #2b3b50}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:24px 0}.cards>div,.chart,details{padding:18px;background:#101e30;border:1px solid #2b3b50;border-radius:12px}.cards strong{display:block;font-size:24px}.chart{margin:18px 0;overflow:hidden}.chart h3{margin:0}.chart svg{width:100%;height:auto;display:block}.chart text{fill:#9eafc6;font-size:11px}.legend,.phases{display:flex;flex-wrap:wrap;gap:12px;font-size:12px}.legend span,.phases span{display:inline-flex;align-items:center;gap:6px}i{display:inline-block;width:9px;height:9px;border-radius:2px}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{text-align:left;padding:10px;border-bottom:1px solid #2b3b50}th{color:#9eafc6;font-weight:500}pre{overflow:auto;font-size:11px;max-height:480px}details{margin:18px 0}summary{cursor:pointer}nav{display:flex;gap:16px;flex-wrap:wrap}@media print{body{background:#fff;color:#172538}.episode{break-before:page}.chart,details,.cards>div{background:#fff}.muted,small{color:#485e78}.chart text{fill:#485e78}}
  </style></head><body><main><div class="eyebrow">Manim Studio · ${t('Developer measurements', 'Razvojna mjerenja')}</div><h1>${escapeHtml(title)}</h1><p class="muted">${t('Measured episodes run one at a time, from scripting through export. Reports contain local measurements, not model quality scores. Course planning is shared and is not charged to an individual episode.', 'Mjerene epizode rade jedna po jedna, od scenarija do izvoza. Izvješća sadrže lokalna mjerenja, a ne ocjene kvalitete modela. Planiranje tečaja je zajedničko i ne pripisuje se pojedinoj epizodi.')}</p><nav>${episodes.map((e, i) => `<a href="#episode-${i}">${escapeHtml(e.metrics.title)}</a>`).join('')}</nav>${comparison}${sections}</main></body></html>`
}
