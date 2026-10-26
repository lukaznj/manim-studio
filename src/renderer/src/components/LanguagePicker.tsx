import { Check, ChevronDown, Languages, Search } from 'lucide-react'
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { matchingUiLanguages, UI_LANGUAGES, uiLocale, type UiLanguage } from '../../../shared/ui-languages'
import { t } from '../lib/i18n'

/** Shared, searchable native popover; remains available above Settings' modal dialog. */
export function LanguagePicker({ value, onChange }: { value: UiLanguage; onChange: (language: UiLanguage) => void }) {
  const id = `app-language-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const anchor = `--${id}`
  const panel = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [active, setActive] = useState(0)
  const selected = UI_LANGUAGES.find((language) => language.code === value)!
  const languages = matchingUiLanguages(search, value)
  const names = new Intl.DisplayNames([uiLocale(value)], { type: 'language' })

  useEffect(() => {
    const el = panel.current!
    const toggle = (event: Event) => {
      const visible = (event as ToggleEvent).newState === 'open'
      setOpen(visible)
      if (visible) {
        setSearch('')
        setActive(UI_LANGUAGES.findIndex((l) => l.code === value))
        input.current?.focus()
      }
    }
    el.addEventListener('toggle', toggle)
    return () => el.removeEventListener('toggle', toggle)
  }, [value])

  useEffect(() => {
    if (open) panel.current?.querySelector(`#${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open, id])

  const pick = (language: UiLanguage) => {
    onChange(language)
    panel.current?.hidePopover()
    button.current?.focus()
  }

  return (
    <>
      <button ref={button} className="select app-language-picker" popoverTarget={id} style={{ anchorName: anchor } as CSSProperties}
        aria-label={`${t('App language')}: ${selected.nativeName}`} aria-haspopup="listbox" aria-expanded={open}>
        <Languages aria-hidden="true" />
        <span lang={uiLocale(value)}>{selected.nativeName}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      <div ref={panel} id={id} popover="auto" className="app-language-panel" style={{ positionAnchor: anchor } as CSSProperties}>
        <label className="app-language-search">
          <Search aria-hidden="true" />
          <input ref={input} role="combobox" aria-label={t('Search languages')} placeholder={t('Search languages…')}
            aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
            aria-activedescendant={languages[active] ? `${id}-option-${active}` : undefined}
            value={search} onChange={(event) => {
              setSearch(event.target.value)
              setActive(0)
              panel.current?.querySelector('.app-language-list')?.scrollTo(0, 0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                setActive((i) => Math.max(0, Math.min(languages.length - 1, i + (event.key === 'ArrowDown' ? 1 : -1))))
              } else if (event.key === 'Enter' && languages[active]) {
                event.preventDefault()
                event.stopPropagation()
                pick(languages[active].code)
              } else if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                panel.current?.hidePopover()
                button.current?.focus()
              }
            }} />
        </label>
        <div id={`${id}-list`} role="listbox" aria-label={t('App language')} className="app-language-list">
          {languages.map((language, i) => (
            <button key={language.code} id={`${id}-option-${i}`} role="option" tabIndex={-1}
              aria-selected={value === language.code} className={`app-language-option ${active === i ? 'active' : ''}`}
              onPointerMove={() => setActive(i)} onClick={() => pick(language.code)}>
              <span><strong lang={uiLocale(language.code)}>{language.nativeName}</strong><span>{names.of(language.code) || language.name}</span></span>
              {value === language.code && <Check aria-hidden="true" />}
            </button>
          ))}
          {!languages.length && <p className="hint app-language-empty">{t('No matching languages.')}</p>}
        </div>
      </div>
    </>
  )
}
