import { Check, Circle, Mic, Pause, Play, RotateCcw, Square, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { VoiceBlock } from '../../../shared/types'
import { api } from '../lib/api'
import { audioContext, drawPeaks, encodeWav, peaksOf, trimSilence } from '../lib/audio'
import { closeDialog, errorText, renderNow, toast, useStore } from '../store'
import { Modal } from './ui'

export function useRecorder() {
  const [state, setState] = useState<'idle' | 'countdown' | 'recording'>('idle')
  const [count, setCount] = useState(0)
  const [level, setLevel] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const stream = useRef<MediaStream | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const raf = useRef(0)
  const cancelled = useRef(false)

  const cleanup = () => {
    cancelAnimationFrame(raf.current)
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    setLevel(0)
  }

  const start = async (deviceId?: string) => {
    cancelled.current = false
    await api.askMicrophone()
    stream.current = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: true, autoGainControl: false, channelCount: 1 },
    })
    // The meter runs during the countdown too, so you can check the level before speaking.
    const ctx = audioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    ctx.createMediaStreamSource(stream.current).connect(analyser)
    const buf = new Float32Array(analyser.fftSize)
    const t0 = performance.now()
    const loop = () => {
      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (const v of buf) sum += v * v
      setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4))
      if (recorder.current?.state === 'recording') setElapsed((performance.now() - t0) / 1000)
      raf.current = requestAnimationFrame(loop)
    }
    loop()

    setState('countdown')
    for (let n = 3; n > 0; n--) {
      setCount(n)
      await new Promise((r) => setTimeout(r, 650))
      if (cancelled.current) return
    }
    chunks.current = []
    const rec = new MediaRecorder(stream.current)
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
    recorder.current = rec
    rec.start()
    setElapsed(0)
    setState('recording')
  }

  const stop = async (): Promise<AudioBuffer | null> => {
    const rec = recorder.current
    if (!rec || rec.state !== 'recording') {
      cancelled.current = true
      cleanup()
      setState('idle')
      return null
    }
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve()
      rec.stop()
    })
    recorder.current = null
    cleanup()
    setState('idle')
    const blob = new Blob(chunks.current, { type: rec.mimeType })
    const ctx = audioContext()
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    return trimSilence(ctx, decoded)
  }

  useEffect(() => () => cleanup(), [])
  return { state, count, level, elapsed, start, stop }
}

export function BoothDialog() {
  const dialog = useStore((s) => s.dialog)
  const open = dialog?.kind === 'booth'
  return (
    <Modal open={open} onClose={closeDialog} title="Record voice" icon={<Mic className="head-icon coral" />} width={980} className="booth-modal">
      <Booth initialKey={dialog?.kind === 'booth' ? dialog.key : undefined} />
    </Modal>
  )
}

function Booth({ initialKey }: { initialKey?: string }) {
  const timeline = useStore((s) => s.timeline)
  const projectPath = useStore((s) => s.project?.path ?? '')
  const recordings = useStore((s) => s.recordings)
  const blocks = useMemo(() => {
    const seen = new Set<string>()
    return (timeline?.voice ?? []).filter((v) => !seen.has(v.key) && seen.add(v.key))
  }, [timeline])
  const [key, setKey] = useState<string | undefined>(initialKey ?? blocks.find((b) => !recordings.includes(b.key))?.key ?? blocks[0]?.key)
  const [take, setTake] = useState<AudioBuffer | null>(null)
  const [playing, setPlaying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [device, setDevice] = useState('')
  const changed = useRef(false)
  const source = useRef<AudioBufferSourceNode | HTMLAudioElement | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const rec = useRecorder()

  const block = blocks.find((b) => b.key === key)
  const recorded = !!key && recordings.includes(key)
  const recordingUrl = key ? api.mediaUrl(`${projectPath}/voice/recordings/${key}.wav`) : ''

  useEffect(() => {
    navigator.mediaDevices
      .enumerateDevices()
      .then((d) => setDevices(d.filter((x) => x.kind === 'audioinput')))
      .catch(() => undefined)
  }, [rec.state])

  // Re-render once when the booth closes after anything was saved or deleted.
  useEffect(
    () => () => {
      if (changed.current) void renderNow()
    },
    [],
  )

  useEffect(() => {
    if (canvas.current && take) drawPeaks(canvas.current, peaksOf(take, 800), '#4cc26a')
  }, [take])

  const stopPlayback = () => {
    const s = source.current
    if (s instanceof HTMLAudioElement) s.pause()
    else s?.stop()
    source.current = null
    setPlaying(false)
  }

  const select = (k: string) => {
    if (rec.state !== 'idle') return
    stopPlayback()
    setTake(null)
    setKey(k)
  }

  const toggleRecord = useCallback(async () => {
    try {
      if (rec.state === 'idle') {
        stopPlayback()
        setTake(null)
        await rec.start(device || undefined)
      } else {
        const buffer = await rec.stop()
        if (buffer) setTake(buffer)
      }
    } catch (e) {
      toast(`Microphone: ${errorText(e)}`, 'error')
    }
  }, [rec, device])

  const play = () => {
    if (playing) return stopPlayback()
    if (take) {
      const ctx = audioContext()
      const node = ctx.createBufferSource()
      node.buffer = take
      node.connect(ctx.destination)
      node.onended = () => setPlaying(false)
      node.start()
      source.current = node
    } else if (recorded) {
      const audio = new Audio(`${recordingUrl}?t=${Date.now()}`)
      audio.onended = () => setPlaying(false)
      void audio.play()
      source.current = audio
    } else return
    setPlaying(true)
  }

  const save = async () => {
    if (!take || !key || saving) return
    setSaving(true)
    try {
      const list = await api.saveRecording(key, encodeWav(take))
      useStore.setState({ recordings: list })
      changed.current = true
      setTake(null)
      const next = blocks.find((b) => !list.includes(b.key))
      if (next) setKey(next.key)
      toast('Recording saved', 'ok')
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!key || !confirm('Delete this recording? The sentence goes back to the computer voice.')) return
    useStore.setState({ recordings: await api.deleteRecording(key) })
    changed.current = true
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'SELECT') return
      if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        void toggleRecord()
      } else if (e.key === ' ') {
        e.preventDefault()
        if (rec.state === 'recording') void toggleRecord()
        else play()
      } else if (e.key === 'Enter' && take) {
        e.preventDefault()
        void save()
      } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && rec.state === 'idle') {
        e.preventDefault()
        const i = blocks.findIndex((b) => b.key === key)
        const next = blocks[Math.min(blocks.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))]
        if (next) select(next.key)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!blocks.length)
    return (
      <div className="modal-body booth-empty">
        <p className="muted">The scene has no narration yet. Add a `with self.voiceover("…")` block (or ask Claude), then render.</p>
      </div>
    )

  return (
    <div className="booth">
      <aside className="booth-list">
        <div className="eyebrow booth-count">
          Sentences · {blocks.filter((b) => recordings.includes(b.key)).length}/{blocks.length} recorded
        </div>
        {blocks.map((b, i) => (
          <BlockRow key={b.key} block={b} index={i} active={b.key === key} recorded={recordings.includes(b.key)} onClick={() => select(b.key)} />
        ))}
      </aside>
      <section className="booth-main">
        {block && (
          <>
            <div className="prompter">
              <span className="eyebrow">
                Read aloud · {recorded ? 'recorded' : `now: ${block.source === 'recording' ? 'recording' : 'computer voice'}`} · {(block.end - block.start).toFixed(1)} s
              </span>
              <p className={`prompter-text ${rec.state === 'recording' ? 'live' : ''}`}>{block.text}</p>
            </div>

            <div className={`take ${rec.state}`}>
              {rec.state === 'countdown' && <div className="countdown" key={rec.count}>{rec.count}</div>}
              {rec.state === 'recording' && (
                <div className="live-meter">
                  <span className="rec-dot" /> <span className="mono">{rec.elapsed.toFixed(1)} s</span>
                  <div className="meter">
                    <div style={{ transform: `scaleX(${rec.level})` }} />
                  </div>
                </div>
              )}
              {rec.state === 'idle' && take && <canvas ref={canvas} className="take-wave" />}
              {rec.state === 'idle' && !take && (
                <div className="take-empty faint">{recorded ? 'There is a recording. Record again to replace it.' : 'Press R and start reading when the countdown ends.'}</div>
              )}
            </div>

            <div className="booth-controls">
              <button className={`rec-btn ${rec.state !== 'idle' ? 'live' : ''}`} onClick={() => void toggleRecord()} title="Record / stop (R)">
                {rec.state === 'idle' ? <Circle /> : <Square />}
              </button>
              <button className="btn" disabled={rec.state !== 'idle' || (!take && !recorded)} onClick={play}>
                {playing ? <Pause /> : <Play />} {take ? 'Play take' : 'Play recording'} <span className="kbd">␣</span>
              </button>
              {take && (
                <>
                  <button className="btn primary" disabled={saving} onClick={() => void save()}>
                    <Check /> Save recording <span className="kbd">↵</span>
                  </button>
                  <button className="btn ghost" onClick={() => setTake(null)}>
                    <RotateCcw /> Discard
                  </button>
                </>
              )}
              {!take && recorded && (
                <button className="btn ghost" onClick={() => void remove()}>
                  <Trash2 /> Delete recording
                </button>
              )}
              <select className="select mic-select" value={device} onChange={(e) => setDevice(e.target.value)} disabled={rec.state !== 'idle'}>
                <option value="">Default microphone</option>
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || 'Microphone'}
                  </option>
                ))}
              </select>
            </div>
            <p className="hint booth-hint">
              Animations stretch to the length of your recording. With Whisper installed (Settings → Voice), bookmarks land on the spoken word;
              otherwise they're estimated from the text.
            </p>
          </>
        )}
      </section>
    </div>
  )
}

function BlockRow(props: { block: VoiceBlock; index: number; active: boolean; recorded: boolean; onClick: () => void }) {
  return (
    <button className={`block-row ${props.active ? 'active' : ''}`} onClick={props.onClick}>
      <span className={`block-state ${props.recorded ? 'done' : ''}`}>{props.recorded ? <Check /> : props.index + 1}</span>
      <span className="block-text">{props.block.text}</span>
      <span className="mono faint">{(props.block.end - props.block.start).toFixed(1)}s</span>
    </button>
  )
}
