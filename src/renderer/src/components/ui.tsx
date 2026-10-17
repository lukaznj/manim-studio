import { t as uiText, localize } from '../lib/i18n'
import { X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

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
  const [visible, setVisible] = useState(props.open)
  const lastOpen = useRef({ children: props.children, footer: props.footer, title: props.title })
  if (props.open) lastOpen.current = { children: props.children, footer: props.footer, title: props.title }
  const content = props.open ? props : lastOpen.current
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (props.open && !d.open) {
      setVisible(true)
      d.showModal()
      // showModal focuses the first focusable element (the close button), which beats React's
      // autoFocus; typing a space would then close the dialog. Focus the marked field, or the
      // dialog itself so keyboard shortcuts inside it keep working.
      ;(d.querySelector<HTMLElement>('[data-autofocus]') ?? d).focus()
    }
    if (!props.open && d.open) {
      // Retain the complete layout until the fade ends, including the footer.
      const timer = window.setTimeout(
        () => {
          d.close()
          lastOpen.current = { children: null, footer: null, title: props.title }
          setVisible(false)
        },
        matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220,
      )
      return () => window.clearTimeout(timer)
    }
  }, [props.open])

  return (
    <dialog
      ref={ref}
      className={`modal ${!props.open ? 'closing' : ''} ${props.className ?? ''}`}
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
        <h2>{localize(content.title)}</h2>
        <button className="icon-btn" onClick={props.onClose} aria-label={uiText('Close')}>
          <X />
        </button>
      </div>
      {(props.open || visible) && content.children}
      {content.footer && <div className="modal-foot">{content.footer}</div>}
    </dialog>
  )
}

/** Segmented control. Pass `radio` (the group's label) when it picks a setting instead of switching a view. */
export function Tabs<T extends string>(props: {
  value: T
  onChange: (v: T) => void
  items: { value: T; label: ReactNode }[]
  radio?: string
  disabled?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: 3, width: 0 })
  useLayoutEffect(() => {
    const measure = () => {
      const selected = ref.current?.querySelector<HTMLElement>('[aria-selected="true"], [aria-checked="true"]')
      if (selected) setPosition({ left: selected.offsetLeft, width: selected.offsetWidth })
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [props.value, props.items.length])
  return (
    <div ref={ref} className="tabs" role={props.radio ? 'radiogroup' : 'tablist'} aria-label={props.radio}>
      <span aria-hidden className="tabs-indicator" style={{ transform: `translateX(${position.left}px)`, width: position.width }} />
      {props.items.map((it) => (
        <button
          key={it.value}
          role={props.radio ? 'radio' : 'tab'}
          {...(props.radio ? { 'aria-checked': props.value === it.value } : { 'aria-selected': props.value === it.value })}
          disabled={props.disabled}
          onClick={() => props.onChange(it.value)}
        >
          {localize(it.label)}
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
            <stop offset="0" style={{ stopColor: 'var(--mark-from)' }} />
            <stop offset="1" style={{ stopColor: 'var(--mark-to)' }} />
          </linearGradient>
        </defs>
        <path d="M5.4 7 Q11 24.2 16.6 12.2" fill="none" stroke="url(#wm-curve)" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="16.6" cy="12.2" r="2.5" fill="var(--blue)" />
      </svg>
      {uiText('Manim Studio')}
    </span>
  )
}
