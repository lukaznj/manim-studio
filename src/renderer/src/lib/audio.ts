// Microphone takes become 16-bit mono WAV (what manim and mutagen read without ffmpeg),
// and audio files become peak arrays for waveform drawing.

export function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  const rate = buffer.sampleRate
  const data = mixDown(buffer)
  const out = new ArrayBuffer(44 + data.length * 2)
  const view = new DataView(out)
  const str = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  view.setUint32(4, 36 + data.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  str(36, 'data')
  view.setUint32(40, data.length * 2, true)
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return out
}

function mixDown(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0)
  const out = new Float32Array(buffer.length)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c)
    for (let i = 0; i < ch.length; i++) out[i] += ch[i] / buffer.numberOfChannels
  }
  return out
}

/** Trims leading/trailing silence (with a little air) from a take. */
export function trimSilence(ctx: BaseAudioContext, buffer: AudioBuffer, threshold = 0.02, padSeconds = 0.12): AudioBuffer {
  const data = mixDown(buffer)
  let a = 0
  let b = data.length - 1
  while (a < b && Math.abs(data[a]) < threshold) a++
  while (b > a && Math.abs(data[b]) < threshold) b--
  const pad = Math.floor(padSeconds * buffer.sampleRate)
  a = Math.max(0, a - pad)
  b = Math.min(data.length - 1, b + pad)
  const out = ctx.createBuffer(1, Math.max(1, b - a), buffer.sampleRate)
  out.copyToChannel(data.slice(a, b), 0)
  return out
}

let ctx: AudioContext | null = null
export const audioContext = () => (ctx ??= new AudioContext())

const peakCache = new Map<string, Promise<Float32Array>>()

/** Max-abs peaks per bucket, normalised to the loudest bucket. */
export function peaks(url: string, buckets = 600): Promise<Float32Array> {
  const key = `${url}#${buckets}`
  let p = peakCache.get(key)
  if (!p) {
    p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => audioContext().decodeAudioData(b))
      .then((audio) => peaksOf(audio, buckets))
    peakCache.set(key, p)
  }
  return p
}

export function peaksOf(audio: AudioBuffer, buckets: number): Float32Array {
  const data = mixDown(audio)
  const out = new Float32Array(buckets)
  const size = Math.max(1, Math.floor(data.length / buckets))
  let max = 0
  for (let i = 0; i < buckets; i++) {
    let m = 0
    for (let j = i * size; j < Math.min((i + 1) * size, data.length); j++) m = Math.max(m, Math.abs(data[j]))
    out[i] = m
    max = Math.max(max, m)
  }
  if (max > 0) for (let i = 0; i < buckets; i++) out[i] /= max
  return out
}

export function drawPeaks(canvas: HTMLCanvasElement, data: Float32Array, color: string): void {
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  canvas.width = Math.max(1, Math.floor(w * dpr))
  canvas.height = Math.max(1, Math.floor(h * dpr))
  const g = canvas.getContext('2d')!
  g.scale(dpr, dpr)
  g.clearRect(0, 0, w, h)
  g.fillStyle = color
  const step = 2
  for (let x = 0; x < w; x += step) {
    const v = data[Math.floor((x / w) * data.length)] ?? 0
    const bar = Math.max(1, v * (h - 2))
    g.fillRect(x, (h - bar) / 2, step - 0.6, bar)
  }
}
