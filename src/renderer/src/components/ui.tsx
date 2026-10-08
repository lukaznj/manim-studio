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
        <button className="icon-btn" onClick={props.onClose} aria-label="Close">
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
  // The app icon's mark: y = x² mid-way through being drawn, the pen at its tip.
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <svg viewBox="0 0 24 24" width={size * 1.3} height={size * 1.3} aria-hidden>
        <defs>
          <linearGradient id="wm-curve" x1="0" y1="0" x2="1" y2="0.4">
            <stop offset="0" stopColor="#F58C40" />
            <stop offset="1" stopColor="#FFDB73" />
          </linearGradient>
        </defs>
        <path d="M5.4 7 Q11 24.2 16.6 12.2" fill="none" stroke="url(#wm-curve)" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="16.6" cy="12.2" r="2.5" fill="var(--blue)" />
      </svg>
      Manim Studio
    </span>
  )
}
