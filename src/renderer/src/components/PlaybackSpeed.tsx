import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { t } from '../lib/i18n'

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

/** A native top-layer popover also works above a fullscreen video. */
export function PlaybackSpeed({ rate, onChange, onOpen }: { rate: number; onChange: (rate: number) => void; onOpen: (open: boolean) => void }) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const position = () => {
    const rect = trigger.current?.getBoundingClientRect()
    if (!rect || !menu.current) return
    menu.current.style.left = `${Math.max(8, Math.min(rect.right - 184, innerWidth - 192))}px`
    menu.current.style.bottom = `${innerHeight - rect.top + 8}px`
  }
  useEffect(() => {
    if (!open) return
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [open])
  return (
    <>
      <button
        ref={trigger}
        className={`study-rate ${open ? 'active' : ''}`}
        popoverTarget={id}
        aria-label={t('Playback speed')}
        title={t('Playback speed')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {rate}× <ChevronDown />
      </button>
      <div
        ref={menu}
        id={id}
        popover="auto"
        className="study-speed-menu"
        role="menu"
        aria-label={t('Playback speed')}
        onBeforeToggle={(event) => {
          if (event.newState === 'open') position()
        }}
        onToggle={(event) => {
          const next = event.newState === 'open'
          setOpen(next)
          onOpen(next)
          if (next) menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus({ preventScroll: true })
        }}
        onKeyDown={(event) => {
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          event.stopPropagation()
          const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
          const index = items.indexOf(document.activeElement as HTMLButtonElement)
          const next =
            event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
          items[next]?.focus()
        }}
      >
        <span className="study-speed-heading">{t('Playback speed')}</span>
        {PLAYBACK_RATES.map((value) => (
          <button
            key={value}
            role="menuitemradio"
            aria-checked={rate === value}
            tabIndex={rate === value ? 0 : -1}
            onClick={() => {
              onChange(value)
              menu.current?.hidePopover()
              trigger.current?.closest<HTMLElement>('.study-player')?.focus({ preventScroll: true })
            }}
          >
            <span>{value}×</span>
            <span>{value === 1 ? t('Normal') : ''}</span>
            {rate === value && <Check />}
          </button>
        ))}
      </div>
    </>
  )
}
