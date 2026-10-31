import type { SubtitleStyle } from './types'

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = { size: 100, color: '#ffffff', background: '#000000', opacity: 70, position: 'bottom', outline: true }
const number = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.max(min, Math.min(max, value))) : fallback
const colour = (value: unknown, fallback: string) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : fallback

/** Saved preferences can come from older versions or a manually edited settings file. */
export function subtitleStyle(value?: Partial<SubtitleStyle> | null): SubtitleStyle {
  const d = DEFAULT_SUBTITLE_STYLE
  return { size: number(value?.size, d.size, 75, 200), color: colour(value?.color, d.color), background: colour(value?.background, d.background),
    opacity: number(value?.opacity, d.opacity, 0, 100), position: value?.position === 'top' ? 'top' : 'bottom', outline: typeof value?.outline === 'boolean' ? value.outline : d.outline }
}

export function subtitleVariables(style: SubtitleStyle): Record<string, string> {
  const rgb = [1, 3, 5].map((at) => parseInt(style.background.slice(at, at + 2), 16)).join(' ')
  const [red, green, blue] = [1, 3, 5].map((at) => parseInt(style.color.slice(at, at + 2), 16))
  const shadow = .2126 * red + .7152 * green + .0722 * blue < 128 ? '#fff' : '#000'
  return { '--subtitle-color': style.color, '--subtitle-background': `rgb(${rgb} / ${style.opacity / 100})`, '--subtitle-scale': String(style.size / 100),
    '--subtitle-shadow': style.outline ? `-1px -1px 1px ${shadow}, 1px -1px 1px ${shadow}, -1px 1px 1px ${shadow}, 1px 1px 1px ${shadow}` : 'none' }
}
