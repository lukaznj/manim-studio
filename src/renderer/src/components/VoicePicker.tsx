import { t as uiText, format, currentLocale } from '../lib/i18n'
import { Check, ChevronDown, Pause, Play, Search } from 'lucide-react'
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import type { VoiceOption, VoiceSettings } from '../../../shared/types'
import { DEFAULT_EL_MODEL } from '../../../shared/voice'
import { api } from '../lib/api'
import { languageName } from '../lib/languages'
import { errorText, toast, useStore } from '../store'

/**
 * ElevenLabs voices the way their site lists them: the language's ten most used, a search of the
 * whole library, and the voices in your account, each with a sample to play. The list is a native
 * popover anchored to the button, so it can reach past the dialog it's in.
 */
export function VoicePicker(props: { language: string; hasKey: boolean; value?: { id: string; name?: string }; onPick: (v: VoiceOption) => void }) {
  const compact = new Intl.NumberFormat(currentLocale(), { notation: 'compact' })
  const anchor = `--voice-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const panel = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [library, setLibrary] = useState<VoiceOption[] | null>(null)
  const [mine, setMine] = useState<VoiceOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)

  const wanted = useRef<string | null>(null) // the sample asked for last; a slower one that loads later stays quiet

  const stop = () => {
    wanted.current = null
    audio.current?.pause()
    audio.current = null
    setPlaying(null)
  }
  // The main process fetches the sample (they live on several hosts) and it plays from memory.
  const play = async (v: VoiceOption) => {
    if (playing === v.id || !v.preview) return stop()
    audio.current?.pause()
    wanted.current = v.id
    setPlaying(v.id)
    try {
      const bytes = await api.voicePreview(v.preview)
      if (wanted.current !== v.id) return
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'audio/mpeg' }))
      const a = new Audio(url)
      audio.current = a
      a.onended = () => {
        URL.revokeObjectURL(url)
        if (wanted.current === v.id) stop()
      }
      await a.play()
    } catch (e) {
      if (wanted.current === v.id) stop()
      toast(`The sample of ${v.name} didn’t play: ${errorText(e)}`, 'error')
    }
  }

  useEffect(() => {
    const el = panel.current
    const onToggle = (e: Event) => {
      const isOpen = (e as ToggleEvent).newState === 'open'
      setOpen(isOpen)
      if (isOpen) input.current?.focus()
      else stop()
    }
    el?.addEventListener('toggle', onToggle)
    return () => el?.removeEventListener('toggle', onToggle)
  }, [])

  useEffect(() => {
    if (open && props.hasKey) api.elevenLabsVoices().then(setMine, () => setMine([]))
  }, [open, props.hasKey])

  // The top ten right away; a search once typing pauses. A late answer to an older query is dropped.
  useEffect(() => {
    if (!open) return
    let live = true
    const load = async () => {
      try {
        const voices = await api.elevenLabsLibrary(props.language, search)
        if (!live) return
        setLibrary(voices)
        setError(null)
      } catch (e) {
        if (!live) return
        setLibrary([])
        setError(errorText(e))
      }
    }
    const timer = setTimeout(() => void load(), search ? 300 : 0)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [open, search, props.language, props.hasKey])

  const q = search.trim().toLowerCase()
  const own = mine.filter((v) => !q || `${v.name} ${v.description ?? ''}`.toLowerCase().includes(q))

  const row = (v: VoiceOption) => {
    const on = v.id === props.value?.id
    return (
      <div key={v.id} className={`voice-row ${on ? 'on' : ''}`}>
        <button
          className="icon-btn"
          disabled={!v.preview}
          onClick={() => void play(v)}
          aria-label={playing === v.id ? uiText('Stop the sample') : format('Play a sample of {0}', [v.name])}
        >
          {playing === v.id ? <Pause /> : <Play />}
        </button>
        <button
          className="voice-choose"
          role="option"
          aria-selected={on}
          onClick={() => {
            props.onPick(v)
            panel.current?.hidePopover()
          }}
        >
          <span className="voice-name">{v.name}</span>
          {v.description && <span className="hint">{v.description}</span>}
        </button>
        {v.users ? (
          <span className="voice-users mono faint" title={format('Saved by {0} people', [v.users.toLocaleString('en')])}>
            {compact.format(v.users)} {uiText(" users")}
          </span>
        ) : null}
        {on && <Check className="voice-check" />}
      </div>
    )
  }

  return (
    <>
      <button className="select voice-picker" popoverTarget={anchor.slice(2)} style={{ anchorName: anchor } as CSSProperties}>
        <span className={props.value?.id ? '' : 'faint'}>{props.value?.id ? (props.value.name ?? props.value.id) : uiText('Choose a voice')}</span>
        <ChevronDown />
      </button>
      <div ref={panel} id={anchor.slice(2)} popover="auto" className="voice-panel" style={{ positionAnchor: anchor } as CSSProperties}>
        <label className="voice-search">
          <Search />
          <input ref={input} placeholder={uiText('Search voices: name, accent, style…')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <div className="voice-list" role="listbox" aria-label={uiText('ElevenLabs voices')}>
          <div className="eyebrow">{q ? uiText('Voice library') : format('Most used in {0}', [languageName.of(props.language)])}</div>
          {library === null ? <div className="voice-note hint">{uiText('Loading…')}</div> : library.map(row)}
          {library?.length === 0 && !error && <div className="voice-note hint">{uiText('No voices match. Try another word.')}</div>}
          {error && <div className="voice-note hint">{error}</div>}
          {!props.hasKey && !error && <div className="voice-note hint">{uiText('Save your API key to see the top ten and search the library.')}</div>}
          {own.length > 0 && (
            <>
              <div className="eyebrow">{uiText('In your account')}</div>
              {own.map(row)}
            </>
          )}
        </div>
      </div>
    </>
  )
}

/**
 * Settings → Voice's default voice, for a video in `language`: in another language than the
 * default's, its ElevenLabs voice is that language's own (elevenLabsDefaultVoice).
 */
export function useVoiceFor(language: string): VoiceSettings | undefined {
  const def = useStore((s) => s.settings?.defaultVoice)
  const [picked, setPicked] = useState<{ language: string; id: string; name: string } | null>(null)
  const own = !!def && (def.provider !== 'elevenlabs' || (def.language === language && !!def.elevenlabs?.voiceId))
  useEffect(() => {
    if (!def || own) return
    let live = true
    void api.elevenLabsDefaultVoice(language).then(
      (v) => live && v && setPicked({ language, id: v.id, name: v.name }),
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [language, own])
  if (!def) return undefined
  if (own || picked?.language !== language) return { ...def, language }
  return { ...def, language, elevenlabs: { modelId: def.elevenlabs?.modelId ?? DEFAULT_EL_MODEL, voiceId: picked.id, voiceName: picked.name } }
}
