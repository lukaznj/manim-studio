import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'

export function Modal(props: {
  open: boolean
  onClose: () => void
  title: ReactNode
  icon?: ReactNode
  width?: number
  children: ReactNode
  footer?: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (props.open && !d.open) {
      d.showModal()
      // showModal focuses the first focusable element (the close button), which beats React's
      // autoFocus; typing a space would then close the dialog. Focus the marked field, or the
      // dialog itself so keyboard shortcuts inside it keep working.
      ;(d.querySelector<HTMLElement>('[data-autofocus]') ?? d).focus()
    }
    if (!props.open && d.open) d.close()
  }, [props.open])

  return (
    <dialog
      ref={ref}
      className={`modal ${props.className ?? ''}`}
      tabIndex={-1}
      style={{ width: props.width ?? 560 }}
      onCancel={(e) => {
        e.preventDefault()
        props.onClose()
      }}
      onMouseDown={(e) => e.target === ref.current && props.onClose()}
    >
      <div className="modal-head">
        {props.icon}
        <h2>{props.title}</h2>
        <button className="icon-btn" onClick={props.onClose} aria-label="Zatvori">
          <X />
        </button>
      </div>
      {props.open && props.children}
      {props.footer && <div className="modal-foot">{props.footer}</div>}
    </dialog>
  )
}

export function Tabs<T extends string>(props: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[] }) {
  return (
    <div className="tabs" role="tablist">
      {props.items.map((it) => (
        <button key={it.value} role="tab" aria-selected={props.value === it.value} onClick={() => props.onChange(it.value)}>
          {it.label}
        </button>
      ))}
    </div>
  )
}

/** A thin determinate/indeterminate progress line. */
export function ProgressLine({ value, className }: { value?: number; className?: string }) {
  return (
    <div className={`progress-line ${value === undefined ? 'indeterminate' : ''} ${className ?? ''}`}>
      <div style={{ transform: `scaleX(${value ?? 0.3})` }} />
    </div>
  )
}

export function Ring({ value, size = 18 }: { value: number; size?: number }) {
  const r = size / 2 - 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.3s' }}
      />
    </svg>
  )
}

export function Wordmark({ size = 15 }: { size?: number }) {
  // A tiny parabola with its vertex: the first thing every maturita student plots.
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <svg viewBox="0 0 24 24" width={size * 1.25} height={size * 1.25} aria-hidden>
        <path d="M3 4 C 7 22, 17 22, 21 4" fill="none" stroke="var(--sun)" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="12" cy="17.5" r="2.6" fill="var(--blue)" />
      </svg>
      Manim Studio
    </span>
  )
}
