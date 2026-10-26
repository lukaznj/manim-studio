// App sounds (ADR 0046): short cues synthesized with the Web Audio API, so the app ships no audio
// files. Each is rendered once, levelled to the same peak, then played at the volume in Settings.
import type { ExerciseSet, SeriesRun, SetupStatus } from '../../../shared/types'
import { requiredReady } from '../components/Onboarding'
import { useStore, type State } from '../store'
import { playback } from './playback'
import { api } from './api'

export type Sound = 'render' | 'export' | 'episode' | 'series' | 'correct' | 'wrong' | 'setup' | 'attention' | 'error'

/** Which cue wins when two would play at once (an exported episode is also an export). */
const PRIORITY: Record<Sound, number> = { render: 1, export: 2, correct: 2, wrong: 2, episode: 3, attention: 4, error: 4, series: 5, setup: 5 }
const PEAK = 0.5 // every sound is levelled to −6 dBFS before the volume

type Build = (ctx: BaseAudioContext, out: AudioNode, t: number) => void

// Notes by name, so the recipes read like music: A4 = 440 Hz.
const hz = (name: string): number => {
  const m = /^([A-G])(#|b)?(\d)$/.exec(name)!
  const semis = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }[m[1] as 'C'] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)
  return 440 * 2 ** ((semis + (Number(m[3]) - 4) * 12) / 12)
}

/** One enveloped oscillator: quick rise, exponential fade, optional pitch slide. */
function tone(
  ctx: BaseAudioContext,
  out: AudioNode,
  t: number,
  o: { f: number; type?: OscillatorType; dur?: number; gain?: number; attack?: number; slideTo?: number; lowpass?: number },
): void {
  const { f, type = 'sine', dur = 0.3, gain = 0.2, attack = 0.006 } = o
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(f, t)
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + dur * 0.7)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  let node: AudioNode = osc.connect(g)
  if (o.lowpass) {
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = o.lowpass
    node = node.connect(lp)
  }
  node.connect(out)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

/** A bell-like strike: the fundamental plus two quieter, faster-fading partials. */
function bell(ctx: BaseAudioContext, out: AudioNode, t: number, f: number, { dur = 0.6, gain = 0.2 } = {}): void {
  tone(ctx, out, t, { f, dur, gain })
  tone(ctx, out, t, { f: f * 2, dur: dur * 0.55, gain: gain * 0.28 })
  tone(ctx, out, t, { f: f * 2.76, dur: dur * 0.3, gain: gain * 0.12 })
}

/** Seeded noise in [-1, 1], so a sound is the same every time. */
function seeded(seed: number, length: number, shape: (i: number) => number = () => 1): Float32Array<ArrayBuffer> {
  const d = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    seed = (seed * 48271) % 2147483647
    d[i] = ((seed / 2147483647) * 2 - 1) * shape(i)
  }
  return d
}

/** Filtered noise: the body of taps, thuds and shimmer. */
function noise(ctx: BaseAudioContext, out: AudioNode, t: number, o: { dur: number; gain: number; type?: BiquadFilterType; freq: number; q?: number }): void {
  const n = Math.ceil(o.dur * ctx.sampleRate)
  const buf = ctx.createBuffer(1, n, ctx.sampleRate)
  buf.copyToChannel(seeded(7, n), 0)
  const src = ctx.createBufferSource()
  src.buffer = buf
  const filter = ctx.createBiquadFilter()
  filter.type = o.type ?? 'bandpass'
  filter.frequency.value = o.freq
  filter.Q.value = o.q ?? 1
  const g = ctx.createGain()
  g.gain.setValueAtTime(o.gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur)
  src.connect(filter).connect(g).connect(out)
  src.start(t)
}

const SOUNDS: Record<Sound, { len: number; wet?: number; build: Build }> = {
  render: {
    len: 0.9,
    build: (c, o, t) => {
      bell(c, o, t, hz('E5'), { dur: 0.35, gain: 0.16 })
      bell(c, o, t + 0.07, hz('B5'), { dur: 0.55, gain: 0.18 })
    },
  },
  export: {
    len: 1.1,
    build: (c, o, t) => ['C5', 'E5', 'G5'].forEach((n, i) => bell(c, o, t + i * 0.06, hz(n), { dur: i === 2 ? 0.75 : 0.32, gain: 0.15 })),
  },
  episode: { len: 1.0, build: (c, o, t) => bell(c, o, t, hz('A5'), { dur: 0.75, gain: 0.2 }) },
  series: {
    len: 2.1,
    wet: 0.26,
    build: (c, o, t) => {
      ;['C5', 'E5', 'G5', 'C6', 'E6'].forEach((n, i) => bell(c, o, t + i * 0.08, hz(n), { dur: 0.4, gain: 0.12 }))
      const chord = t + 0.42
      for (const n of ['C5', 'G5', 'E6']) tone(c, o, chord, { f: hz(n), dur: 1.4, gain: 0.07, attack: 0.08 })
      noise(c, o, chord, { dur: 0.9, gain: 0.025, type: 'highpass', freq: 7000 })
    },
  },
  correct: {
    len: 0.7,
    build: (c, o, t) => {
      tone(c, o, t, { f: 600, slideTo: 1200, dur: 0.12, gain: 0.12 })
      bell(c, o, t + 0.1, hz('D6'), { dur: 0.45, gain: 0.16 })
    },
  },
  wrong: {
    len: 0.75,
    build: (c, o, t) => {
      tone(c, o, t, { f: hz('G4'), type: 'triangle', dur: 0.22, gain: 0.16, lowpass: 1200 })
      tone(c, o, t + 0.16, { f: hz('Eb4'), type: 'triangle', dur: 0.4, gain: 0.16, lowpass: 1200 })
    },
  },
  setup: {
    len: 1.9,
    wet: 0.24,
    build: (c, o, t) => {
      ;['D5', 'F#5', 'A5'].forEach((n, i) => tone(c, o, t + i * 0.02, { f: hz(n), dur: 1.1, gain: 0.08, attack: 0.18 }))
      bell(c, o, t + 0.55, hz('A5'), { dur: 0.35, gain: 0.12 })
      bell(c, o, t + 0.68, hz('D6'), { dur: 0.75, gain: 0.14 })
    },
  },
  attention: {
    len: 0.7,
    build: (c, o, t) => {
      bell(c, o, t, hz('B5'), { dur: 0.16, gain: 0.15 })
      bell(c, o, t + 0.13, hz('B5'), { dur: 0.3, gain: 0.15 })
      noise(c, o, t, { dur: 0.02, gain: 0.04, freq: 3500, q: 2 })
    },
  },
  error: {
    len: 0.8,
    build: (c, o, t) => {
      tone(c, o, t, { f: 160, slideTo: 90, dur: 0.2, gain: 0.3 })
      noise(c, o, t, { dur: 0.07, gain: 0.08, type: 'lowpass', freq: 500 })
      tone(c, o, t + 0.09, { f: hz('A3'), type: 'triangle', dur: 0.38, gain: 0.13, lowpass: 900 })
    },
  },
}

const RATE = 44100
const rendered = new Map<Sound, Promise<AudioBuffer>>()

/** Renders a sound once, in a short soft room, levelled to PEAK. */
function render(sound: Sound): Promise<AudioBuffer> {
  let buffer = rendered.get(sound)
  if (!buffer) {
    const def = SOUNDS[sound]
    const ctx = new OfflineAudioContext(2, Math.ceil(def.len * RATE), RATE)
    const bus = ctx.createGain()
    const verb = ctx.createConvolver()
    const roomLength = Math.ceil(0.8 * RATE)
    const room = ctx.createBuffer(2, roomLength, RATE)
    for (let ch = 0; ch < 2; ch++)
      room.copyToChannel(
        seeded(11 + ch, roomLength, (i) => (1 - i / roomLength) ** 3.2),
        ch,
      )
    verb.buffer = room
    const wet = ctx.createGain()
    wet.gain.value = def.wet ?? 0.18
    bus.connect(ctx.destination)
    bus.connect(verb).connect(wet).connect(ctx.destination)
    def.build(ctx, bus, 0.01)
    buffer = ctx.startRendering().then((buf) => {
      let peak = 0
      for (let ch = 0; ch < buf.numberOfChannels; ch++) for (const v of buf.getChannelData(ch)) peak = Math.max(peak, Math.abs(v))
      for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        const d = buf.getChannelData(ch)
        for (let i = 0; i < d.length; i++) d[i] *= peak ? PEAK / peak : 1
      }
      return buf
    })
    rendered.set(sound, buffer)
  }
  return buffer
}

let live: AudioContext | null = null
let last = { sound: 'render' as Sound, at: 0 }

/** The volume setting (0–100) as gain: 0 is silent, 100 is the levelled sound, each step 0.3 dB. */
export const soundGain = (volume: number): number => (volume <= 0 ? 0 : 10 ** (((volume - 100) * 0.3) / 20))

/**
 * Plays a cue unless sounds are off, a video is playing, or a more important cue just played.
 * `preview` (Settings) skips those checks, so the slider can be heard.
 */
export async function playSound(sound: Sound, preview = false): Promise<void> {
  const settings = useStore.getState().settings
  const volume = settings?.soundVolume ?? 50
  if (!preview) {
    if (settings?.sounds === false || volume <= 0) return
    if (playback.playing || [...document.querySelectorAll('video')].some((v) => !v.paused)) return
    if (Date.now() - last.at < 1500 && PRIORITY[sound] <= PRIORITY[last.sound]) return
  }
  last = { sound, at: Date.now() }
  try {
    const buffer = await render(sound)
    live ??= new AudioContext()
    if (live.state === 'suspended') await live.resume()
    const src = live.createBufferSource()
    src.buffer = buffer
    const gain = live.createGain()
    gain.gain.value = soundGain(volume)
    src.connect(gain).connect(live.destination)
    src.start()
  } catch {
    // no audio device: the app works the same without sound
  }
}

// --- when they play: changes in the app's state -------------------------------------------------

/** The cues for a series, an exercise set or quick mode moving on: done or failed. */
function items(before: { id: string; state: string; activity?: string }[], now: { id: string; state: string; activity?: string }[], done: Sound): Sound[] {
  const cues: Sound[] = []
  for (const item of now) {
    const was = before.find((b) => b.id === item.id)
    if (!was) continue
    if (item.state !== was.state && item.state === 'done') cues.push(done)
    if (item.state !== was.state && item.state === 'failed') cues.push('error')
  }
  return cues
}

const episodes = (run: SeriesRun | null) => run?.episodes.map((e) => ({ id: e.dir, state: e.state, activity: e.activity })) ?? []
const exercises = (sets: ExerciseSet[]) => sets.flatMap((s) => s.items.map((e) => ({ id: e.dir, state: e.state, activity: e.activity })))
const installing = (setup: SetupStatus | null) => !!setup && Object.values(setup).includes('installing')

/** What changed between two states, as cues; the most important one plays. */
export function cuesFor(s: State, p: State, focused: boolean): Sound[] {
  const cues: Sound[] = []
  for (const job of s.exports) {
    const was = p.exports.find((j) => j.id === job.id)
    if (was && was.state !== job.state && job.state === 'done') cues.push('export')
    if (was && was.state !== job.state && job.state === 'failed') cues.push('error')
  }
  if (s.series && p.series?.folder === s.series.folder) {
    if (s.series.state === 'done' && p.series.state !== 'done') cues.push('series')
    cues.push(...items(episodes(p.series), episodes(s.series), 'episode'))
  }
  cues.push(...items(exercises(p.exerciseSets), exercises(s.exerciseSets), 'episode'))
  if (s.quick && p.quick?.id === s.quick.id && p.quick.state !== s.quick.state)
    cues.push(...(s.quick.state === 'done' ? ['episode' as const] : s.quick.state === 'failed' ? ['error' as const] : []))
  // A render you waited for; the agent's own renders while it works stay quiet.
  if (p.render.status === 'rendering' && s.render.status === 'idle' && !s.chatBusy && Date.now() - (p.render.startedAt ?? Date.now()) >= 4000)
    cues.push('render')
  // The agent answered while you were in another window.
  if (p.chatBusy && !s.chatBusy && !focused) cues.push('attention')
  if (!requiredReady(p.setup) && requiredReady(s.setup) && installing(p.setup)) cues.push('setup')
  for (const c of ['env', 'latex', 'omnivoice', 'transcribe', 'codex', 'antigravity'] as const)
    if (p.setup?.[c] === 'installing' && s.setup?.[c] === 'error') cues.push('error')
  return cues
}

/** Starts listening; call once. */
export function startSoundCues(): () => void {
  const offLimit = api.on('usage-limit', () => void playSound('attention'))
  const offState = useStore.subscribe((s, p) => {
    const cues = cuesFor(s, p, document.hasFocus())
    if (!cues.length) return
    void playSound(cues.reduce((a, b) => (PRIORITY[b] > PRIORITY[a] ? b : a)))
  })
  return () => { offLimit(); offState() }
}
