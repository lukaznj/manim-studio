import { useEffect, useRef, type CSSProperties } from 'react'
import { editorBridge } from '../lib/editor-bridge'
import { playback } from '../lib/playback'
import { openDialog, renderNow, saveScene, selectClips, updateSettings, useStore } from '../store'
import { ChatPane } from './ChatPane'
import { CodePane } from './CodePane'
import { PreviewPane } from './PreviewPane'
import { Timeline } from './Timeline'

export function Editor() {
  const settings = useStore((s) => s.settings)!
  const timeline = useStore((s) => s.timeline)
  const ref = useRef<HTMLDivElement>(null)

  useShortcuts()
  useCodeFollow()

  // Selected clips light up their lines in the code.
  const selection = useStore((s) => s.selection)
  useEffect(() => {
    editorBridge.setSelectedLines(selection.map((i) => timeline?.clips[i]?.line).filter((l): l is number => !!l))
  }, [selection, timeline])
  useEffect(() => editorBridge.showWarnings(timeline?.warnings ?? []), [timeline])

  const style = {
    '--code-w': `${settings.sidebarWidth}px`,
    '--chat-w': `${settings.chatWidth}px`,
    '--tl-h': `${settings.timelineHeight}px`,
  } as CSSProperties

  return (
    <div className="editor" ref={ref} style={style}>
      <section className="pane pane-code" data-tour="code">
        <CodePane />
      </section>
      <Resizer axis="x" containerRef={ref} prop="--code-w" min={300} max={900} onDone={(v) => void updateSettings({ sidebarWidth: v })} />
      <section className="pane pane-preview" data-tour="preview">
        <PreviewPane />
      </section>
      <Resizer axis="x" containerRef={ref} prop="--chat-w" min={300} max={640} invert onDone={(v) => void updateSettings({ chatWidth: v })} />
      <section className="pane pane-chat" data-tour="chat">
        <ChatPane />
      </section>
      <Resizer axis="y" containerRef={ref} prop="--tl-h" min={170} max={520} invert onDone={(v) => void updateSettings({ timelineHeight: v })} />
      <section className="pane pane-timeline" data-tour="timeline">
        <Timeline />
      </section>
    </div>
  )
}

function Resizer(props: {
  axis: 'x' | 'y'
  containerRef: React.RefObject<HTMLDivElement | null>
  prop: string
  min: number
  max: number
  invert?: boolean
  onDone: (value: number) => void
}) {
  const onPointerDown = (e: React.PointerEvent) => {
    const el = props.containerRef.current
    if (!el) return
    e.preventDefault()
    const startPos = props.axis === 'x' ? e.clientX : e.clientY
    const startVal = parseFloat(getComputedStyle(el).getPropertyValue(props.prop))
    let value = startVal
    document.body.classList.add(props.axis === 'x' ? 'resizing-x' : 'resizing-y')
    const move = (ev: PointerEvent) => {
      const delta = (props.axis === 'x' ? ev.clientX : ev.clientY) - startPos
      value = Math.round(Math.min(props.max, Math.max(props.min, startVal + (props.invert ? -delta : delta))))
      el.style.setProperty(props.prop, `${value}px`)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.classList.remove('resizing-x', 'resizing-y')
      props.onDone(value)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return <div className={`resizer resizer-${props.axis} resizer${props.prop}`} onPointerDown={onPointerDown} role="separator" />
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || !!t.closest('.monaco-editor')
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (useStore.getState().dialog) return
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveScene({ render: true })
        return
      }
      if (mod && e.key === 'Enter') {
        e.preventDefault()
        void saveScene({ render: true })
        return
      }
      if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        openDialog({ kind: 'export' })
        return
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault()
        openDialog({ kind: 'booth' })
        return
      }
      if (isTyping(e)) return
      const fps = useStore.getState().timeline?.fps ?? 15
      if (e.key === ' ') {
        e.preventDefault()
        playback.toggle()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        playback.step(e.shiftKey ? -1 : -1 / fps)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        playback.step(e.shiftKey ? 1 : 1 / fps)
      } else if (e.key === 'Home') playback.seek(0)
      else if (e.key === 'End') playback.seek(useStore.getState().timeline?.duration ?? 0)
      else if (e.key === 'Escape') {
        selectClips([])
        playback.setLoop(null)
      } else if (e.key.toLowerCase() === 'r' && !mod) void renderNow()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** The signature: while the video plays, the line producing what's on screen is marked. */
function useCodeFollow() {
  useEffect(() => {
    let lastPlaying = false
    const off = playback.subscribe((t) => {
      const tl = useStore.getState().timeline
      if (!tl) return
      const clip = tl.clips.find((c) => t >= c.start && t < c.end) ?? null
      editorBridge.setFollowLine(clip?.line ?? null)
    })
    const offPlay = playback.onPlayState((playing) => {
      if (!playing && lastPlaying) editorBridge.setFollowLine(null)
      lastPlaying = playing
    })
    return () => {
      off()
      offPlay()
    }
  }, [])
}
