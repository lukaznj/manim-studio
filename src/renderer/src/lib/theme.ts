// Light or dark. Settings → Appearance sets Electron's nativeTheme.themeSource, which drives
// prefers-color-scheme here ("system" follows the OS). Styles key off html[data-theme] rather than
// the media query, so the switch can cross-fade: the view transition captures the old look
// before the attribute flips.
const dark = matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<(dark: boolean) => void>()

export const isDark = (): boolean => dark.matches

/** For what CSS can't reach (Monaco's theme). Runs inside the transition, so it fades with the rest. */
export function onThemeChange(fn: (dark: boolean) => void): void {
  listeners.add(fn)
}

function apply(isDark: boolean): void {
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
  for (const fn of listeners) fn(isDark)
}

apply(dark.matches)

dark.addEventListener('change', (e) => {
  const doc = document as Document & { startViewTransition?: (o: { update: () => void; types: string[] }) => unknown }
  if (!doc.startViewTransition || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) apply(e.matches)
  else doc.startViewTransition({ update: () => apply(e.matches), types: ['theme'] })
})
