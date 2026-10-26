import { t as uiText, localize } from '../lib/i18n'
import { X } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

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
  items: { value: T; label: ReactNode; disabled?: boolean; title?: string }[]
  radio?: string
  label?: string
  disabled?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: 3, width: 0, animate: false })
  const measuredValue = useRef(props.value)
  useLayoutEffect(() => {
    const measure = () => {
      const selected = ref.current?.querySelector<HTMLElement>('[aria-selected="true"], [aria-checked="true"]')
      if (selected) {
        const changed = measuredValue.current !== props.value
        measuredValue.current = props.value
        setPosition((before) =>
          before.left === selected.offsetLeft && before.width === selected.offsetWidth
            ? before
            : { left: selected.offsetLeft, width: selected.offsetWidth, animate: changed && before.width > 0 },
        )
      }
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [props.value, props.items.length])
  return (
    <div
      ref={ref}
      className="tabs"
      role={props.radio ? 'radiogroup' : 'tablist'}
      aria-label={props.radio ?? props.label}
      onKeyDown={(e) => {
        if (props.disabled || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
        e.preventDefault()
        const enabled = props.items.filter((it) => !it.disabled)
        if (!enabled.length) return
        const selected = enabled.findIndex((it) => it.value === props.value)
        const index =
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? enabled.length - 1
              : selected < 0 ? (e.key === 'ArrowRight' ? 0 : enabled.length - 1)
                : (selected + (e.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length
        props.onChange(enabled[index].value)
        ref.current?.querySelectorAll('button')[props.items.indexOf(enabled[index])]?.focus()
      }}
    >
      <span
        aria-hidden
        className="tabs-indicator"
        style={{ transform: `translateX(${position.left}px)`, width: position.width, ...(!position.animate ? { transition: 'none' } : {}) }}
      />
      {props.items.map((it) => (
        <button
          key={it.value}
          role={props.radio ? 'radio' : 'tab'}
          {...(props.radio ? { 'aria-checked': props.value === it.value } : { 'aria-selected': props.value === it.value })}
          disabled={props.disabled || it.disabled}
          title={it.title}
          tabIndex={(props.items.some((item) => item.value === props.value && !item.disabled)
            ? props.value === it.value : props.items.find((item) => !item.disabled) === it) ? 0 : -1}
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
  // The Icon Composer monogram, with a tighter view box for the small inline mark.
  const gradient = useId()
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <svg viewBox="170 220 684 624" width={size * 1.3} height={size * 1.3} aria-hidden>
        <defs>
          <linearGradient id={gradient} x1="20%" y1="30%" x2="72%" y2="60%">
            <stop offset="0" style={{ stopColor: 'var(--mark-from)' }} />
            <stop offset="1" style={{ stopColor: 'var(--mark-to)' }} />
          </linearGradient>
        </defs>
        <path d="M258 728 L312 326 Q316 298 334 322 L495 550 Q512 573 529 550 L690 322 Q708 298 712 326 L766 728" fill="none" stroke={`url(#${gradient})`} strokeWidth="116" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="766" cy="728" r="66" fill="var(--blue)" />
      </svg>
      {uiText('Manim Studio')}
    </span>
  )
}
